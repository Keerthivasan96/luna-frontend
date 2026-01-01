// ============================================
// speech.js - FIXED VERSION
// Removed: Broken alternative selection, dead grammar code
// Kept: Fast timing (~0.5s), simple logic
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
// TIMING - FAST (tested values, ~0.5s feel)
// ============================================
const CONFIG = {
  baseSilence: isMobile ? 450 : 400,            // Fast base timing
  shortPhraseSilence: 650,                       // Short phrases wait a bit more
  completeSilence: 250,                          // Complete sentences send fast
  
  minSendGap: 1000,                              // Prevent double-sends
  restartDelay: isMobile ? 150 : 120,
  minWordsForEarlySend: 5,
};

console.log(`🎤 Speech: ${isMobile ? 'Mobile' : 'Desktop'} mode`);

/**
 * Check if text has clear complete intent
 */
function hasCompleteIntent(text) {
  const lower = text.toLowerCase().trim();
  const lastChar = text.trim().slice(-1);
  
  // Clear sentence ending
  if (['.', '!', '?'].includes(lastChar)) {
    return true;
  }
  
  // One-word complete responses
  if (/^(yes|no|yeah|yep|nope|okay|sure|hi|hey|hello|bye|thanks)$/i.test(lower)) {
    return true;
  }
  
  // Common complete short phrases
  const completePatterns = [
    /^(my name is|i am|i'm) \w+/i,
    /^(i'?m (good|fine|great|okay|tired|sad|happy))/i,
    /^(that'?s (good|great|cool|nice|fine|okay))/i,
    /^(sounds (good|great|fine))/i,
    /^(thank you|thanks|no thanks|yes please)/i,
  ];
  
  return completePatterns.some(pattern => pattern.test(lower));
}

/**
 * Detect truly incomplete phrases that need more input
 * SIMPLIFIED - only catch obvious fragments
 */
function isIncompletePhrase(text) {
  const lower = text.toLowerCase().trim();
  const words = lower.split(/\s+/).length;
  
  // Single question words that clearly need more
  if (words === 1 && /^(what|why|how|when|where|who|which)$/i.test(lower)) {
    return true;
  }
  
  // Clear incomplete starters (2 words max)
  if (words <= 2) {
    const incompleteStarters = [
      /^(tell me)$/i,
      /^(can you|could you|would you|will you)$/i,
      /^(i want|i need|i think|i'm going)$/i,
      /^(what if|how about)$/i,
    ];
    return incompleteStarters.some(pattern => pattern.test(lower));
  }
  
  return false;
}

/**
 * Get timeout based on text - FAST
 */
function getTimeout(text) {
  const words = text.trim().split(/\s+/).filter(w => w);
  const wordCount = words.length;
  
  // Clear sentence ending - SEND FAST
  if (hasCompleteIntent(text)) {
    console.log(`✅ Complete (${wordCount} words) - fast send`);
    return CONFIG.completeSilence;
  }
  
  // Check if clearly incomplete - wait a bit more
  if (isIncompletePhrase(text)) {
    console.log(`⏳ Incomplete phrase - waiting`);
    return CONFIG.shortPhraseSilence;
  }
  
  // 1-2 words that aren't complete - wait briefly
  if (wordCount <= 2) {
    console.log(`⏳ Short (${wordCount} words) - brief wait`);
    return CONFIG.shortPhraseSilence;
  }
  
  // 3+ words - use base timing
  console.log(`📝 Normal (${wordCount} words)`);
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
  recognition.maxAlternatives = 1;  // FIXED: Just use first result, don't pick alternatives
  recognition.lang = options.lang || "en-US";  // FIXED: Use en-US (better for most cases)

  // REMOVED: Grammar hints (deprecated API, does nothing)

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
      
      // FIXED: Just use first result - don't try to pick "better" alternatives
      // The alternative picking logic was making STT WORSE
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

    // Early send for clearly complete longer sentences
    if (
      interim &&
      interim.length > 15 &&
      Date.now() - lastSendTime > CONFIG.minSendGap
    ) {
      const words = interim.trim().split(/\s+/).length;
      
      if (words >= CONFIG.minWordsForEarlySend && hasCompleteIntent(interim)) {
        console.log("⚡ Early send:", interim);
        finalize((pendingText + interim).trim());
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