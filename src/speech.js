// ============================================
// speech.js - PRODUCTION FIXES
// Fix #1: Stricter early-send gating
// Fix #2: Better incomplete phrase detection
// ============================================

let recognition = null;
let callback = null;
let continuous = false;
let isListening = false;
let isSpeaking = false;

let silenceTimer = null;
let restartTimer = null;
let pendingText = "";
let lastSendTime = 0;
let interimBuffer = "";

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ============================================
// TIMING - Balanced for smooth listening without too much wait
// ============================================
const CONFIG = {
  baseSilence: isMobile ? 800 : 900,           // Reduced from 1200/1500 (20% closer to 400)
  shortPhraseSilence: 1200,                     // Reduced from 1800 (20% closer to 600)
  completeSilence: 500,                         // Reduced from 800 (20% closer to 220)
  
  minSendGap: 1300,                             // Reduced from 1500 (20% closer to 1100)
  restartDelay: isMobile ? 200 : 200,
  minWordsForEarlySend: 5,                      // Back to 5 words (from 6)
};

console.log(`🎤 Speech: ${isMobile ? 'Mobile' : 'Desktop'} mode`);

/**
 * STRICTER intent detection
 */
function hasCompleteIntent(text) {
  const lower = text.toLowerCase().trim();
  const lastChar = text.trim().slice(-1);
  
  // Clear sentence ending
  if (['.', '!', '?'].includes(lastChar)) {
    return true;
  }
  
  // Complete statement patterns (must be 4+ words)
  const completeStatements = [
    /^(my name is|i am|i'm) \w+$/i,
    /^(i live in|i work at|i go to) /i,
    /^(i like|i love|i hate|i want|i need) /i,
    /^(yes|no|yeah|yep|nope|okay|sure)$/i,
  ];
  
  return completeStatements.some(pattern => pattern.test(lower));
}

/**
 * Detect if phrase is clearly incomplete
 */
function isIncompletePhrase(text) {
  const lower = text.toLowerCase().trim();
  
  // ONLY flag as incomplete if it's a clear fragment that can't stand alone
  const trulyIncomplete = [
    /^(tell me a|give me a|show me a)$/i,  // Needs object
    /^(because|so that|in order to)$/i,     // Needs completion
    /^(I want to|I need to|I'm going to)$/i, // Needs verb
  ];
  
  return trulyIncomplete.some(pattern => pattern.test(lower));
}

function getTimeout(text) {
  const words = text.trim().split(/\s+/).filter(w => w);
  const wordCount = words.length;
  const lastChar = text.trim().slice(-1);
  
  // Clear sentence ending - SEND
  if (['.', '!', '?'].includes(lastChar)) {
    console.log(`✅ Complete sentence (${wordCount} words)`);
    return CONFIG.completeSilence;
  }
  
  // Check if clearly incomplete
  if (isIncompletePhrase(text)) {
    console.log(`⏳ Incomplete phrase detected - waiting`);
    return CONFIG.shortPhraseSilence;
  }
  
  // One-word - only if it's a complete response
  if (wordCount === 1) {
    const oneWordComplete = /^(yes|no|yeah|yep|nope|ok|okay|sure|hi|hey|hello|bye|thanks|please)$/i;
    if (oneWordComplete.test(text.toLowerCase())) {
      console.log(`✅ Quick one-word response`);
      return CONFIG.completeSilence;
    }
    console.log(`⏳ Single word - waiting for more`);
    return CONFIG.shortPhraseSilence;
  }
  
  // 2-3 words - be VERY cautious, wait longer
  if (wordCount === 2 || wordCount === 3) {
    const shortComplete = /^(i'?m (good|fine|great|okay|tired)|that'?s (good|great|cool|nice)|sounds (good|great)|yes please|no thanks|thank you|you too|not really|right now|of course)$/i;
    if (shortComplete.test(text.toLowerCase())) {
      console.log(`✅ Complete short phrase (${wordCount} words)`);
      return CONFIG.baseSilence;
    }
    console.log(`⏳ ${wordCount} words - likely incomplete, waiting`);
    return CONFIG.shortPhraseSilence;  // Wait 1.2 seconds (longer than before)
  }
  
  // 4 words - still cautious, wait a bit
  if (wordCount === 4) {
    console.log(`📝 4 words - waiting to confirm complete`);
    return CONFIG.baseSilence;  // Wait 1.2-1.5 seconds
  }
  
  // 5 words - still wait
  if (wordCount === 5) {
    console.log(`📝 5 words - waiting to confirm complete`);
    return CONFIG.baseSilence;  // Wait 1.2-1.5 seconds
  }
  
  // 6+ words - likely complete but still wait a reasonable time
  console.log(`📝 Normal sentence (${wordCount} words)`);
  return CONFIG.baseSilence;
}

export function startListening(onFinal, options = {}) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error("❌ Speech Recognition not supported");
    return;
  }

  if (isSpeaking) {
    callback = onFinal;
    continuous = !!options.continuous;
    return;
  }

  callback = onFinal;
  continuous = !!options.continuous;

  if (recognition && isListening) return;

  cleanup();
  pendingText = "";
  interimBuffer = "";

  recognition = new SpeechRecognition();
  recognition.continuous = !isMobile;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = options.lang || "en-US";

  recognition.onstart = () => {
    console.log("🎤 Listening...");
    isListening = true;
  };

  recognition.onresult = (event) => {
    clearTimeout(silenceTimer);

    let interim = "";
    let final = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript;

      if (result.isFinal) {
        final += text + " ";
      } else {
        interim += text;
      }
    }

    if (final) {
      pendingText += final;
      console.log("🎤 Final:", final.trim());
    }

    const fullText = (pendingText + interim).trim();
    interimBuffer = interim;

    if (interim && interim.length > 2) {
      console.log("🎤 ...", interim.substring(0, 50));
    }

    // ⚡ STRICTER early send - only on clear complete intent
    if (
      interim &&
      interim.length > 12 &&                    // Longer threshold
      Date.now() - lastSendTime > CONFIG.minSendGap
    ) {
      const words = interim.trim().split(/\s+/).length;
      
      // Must be 5+ words AND have complete intent
      if (words >= CONFIG.minWordsForEarlySend && hasCompleteIntent(interim)) {
        console.log("⚡ Early send (complete intent):", interim);
        finalize((pendingText + interim).trim());
        return;
      }
      
      // Block early send if clearly incomplete
      if (isIncompletePhrase(interim)) {
        console.log("🚫 Blocking early send - incomplete phrase");
        const timeout = getTimeout(fullText);
        silenceTimer = setTimeout(() => finalize(fullText), timeout);
        return;
      }
    }

    // Normal silence-based finalize
    if (fullText) {
      const timeout = getTimeout(fullText);
      silenceTimer = setTimeout(() => finalize(fullText), timeout);
    }
  };

  recognition.onerror = (e) => {
    console.log("❌ Error:", e.error);
    clearTimeout(silenceTimer);
    
    if (e.error === 'not-allowed') {
      alert("Please allow microphone access");
    }
    
    if (e.error === 'no-speech') {
      console.log("🔇 No speech");
      if (continuous) scheduleRestart();
    }
  };

  recognition.onend = () => {
    console.log("🛑 Recognition ended");
    isListening = false;
    
    const text = pendingText.trim();
    if (text && text.length > 0) {
      clearTimeout(silenceTimer);
      finalize(text);
      return;
    }
    
    if (continuous && !isSpeaking) {
      scheduleRestart();
    }
  };

  try {
    recognition.start();
  } catch (e) {
    console.error("❌ Start failed:", e);
  }
}

function finalize(text) {
  if (!text || text.trim().length === 0) return;
  
  const now = Date.now();
  if (now - lastSendTime < CONFIG.minSendGap) {
    console.log("⏳ Too soon, skipping");
    pendingText = "";
    interimBuffer = "";
    scheduleRestart();
    return;
  }
  
  const words = text.split(/\s+/).length;
  console.log(`✅ SENDING: "${text}" (${words} words)`);
  
  lastSendTime = now;
  pendingText = "";
  interimBuffer = "";
  
  stopRecognition();
  
  if (typeof callback === "function") {
    try {
      callback(text, true);
    } catch (e) {
      console.error("❌ Callback error:", e);
    }
  }
}

function scheduleRestart() {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    if (continuous && !isSpeaking && !isListening) {
      console.log("🔄 Restarting...");
      startListening(callback, { continuous: true });
    }
  }, CONFIG.restartDelay);
}

function stopRecognition() {
  clearTimeout(silenceTimer);
  if (recognition) {
    try {
      recognition.onend = null;
      recognition.stop();
    } catch (e) {}
  }
  isListening = false;
}

export function stopListening() {
  console.log("🛑 STOP");
  continuous = false;
  callback = null;
  isListening = false;
  pendingText = "";
  interimBuffer = "";
  cleanup();
}

function cleanup() {
  clearTimeout(silenceTimer);
  clearTimeout(restartTimer);
  if (recognition) {
    try { recognition.onend = null; } catch (e) {}
    try { recognition.stop(); } catch (e) {}
    recognition = null;
  }
}

export function setSpeaking(speaking) {
  isSpeaking = speaking;
}

export function stopSpeaking() {
  if (window.speechSynthesis) {
    try { window.speechSynthesis.cancel(); } catch (e) {}
  }
  isSpeaking = false;
}

if (typeof window !== "undefined") {
  window.startListening = startListening;
  window.stopListening = stopListening;
  window.stopSpeaking = stopSpeaking;
}

export default { startListening, stopListening, stopSpeaking, setSpeaking };