// ============================================
// app.js - EMOTIONAL COMPANION (FULLY CORRECTED)
// Focus: Caring presence over mechanical cleverness
// ============================================

import { startListening, stopListening, setSpeaking } from "./speech.js";
import { 
  init3DScene, 
  loadVRMAvatar, 
  avatarStartTalking, 
  avatarStopTalking,
  loadRoomModel,
  useFallbackEnvironment
} from "./threejs-avatar-3d.js";

const API_URL = "https://luna-backend-two.vercel.app/api/generate";
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

console.log(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}`);

// UI ELEMENTS
const micBtn = document.getElementById("micBtn");
const menuToggle = document.getElementById("menuToggle");
const menuPanel = document.getElementById("menuPanel");
const menuOverlay = document.getElementById("menuOverlay");
const menuClose = document.getElementById("menuClose");
const clearBtn = document.getElementById("clearBtn");
const demoLessonBtn = document.getElementById("demoLessonBtn");
const musicToggle = document.getElementById("musicToggle");
const musicVolumeSlider = document.getElementById("musicVolume");
const statusEl = document.getElementById("status");
const chatCaption = document.getElementById("chatCaption");
const avatarOptions = document.querySelectorAll(".avatar-option");

// STATE
let isRunning = false;
let isSpeaking = false;
let isProcessing = false;
let conversationHistory = [];
let currentAvatarPath = "/assets/vrmavatar1.vrm";
let responseCount = 0;
let lastEmotion = "neutral";

// Music
let backgroundMusic = null;
let isMusicPlaying = false;
let musicVolume = 0.3;

// STORAGE
const STORAGE_KEY = "luna_chat";
const AVATAR_KEY = "luna_avatar";
const RESPONSE_COUNT_KEY = "luna_response_count";
const EMOTION_KEY = "luna_emotion";

function saveHistory() {
  try { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversationHistory.slice(-30))); 
    localStorage.setItem(RESPONSE_COUNT_KEY, responseCount.toString());
    localStorage.setItem(EMOTION_KEY, lastEmotion);
  } catch (e) {}
}

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const countSaved = localStorage.getItem(RESPONSE_COUNT_KEY);
    const emotionSaved = localStorage.getItem(EMOTION_KEY);
    
    if (saved) {
      conversationHistory = JSON.parse(saved);
      responseCount = countSaved ? parseInt(countSaved) : 0;
      lastEmotion = emotionSaved || "neutral";
      console.log(`📂 Loaded ${conversationHistory.length} messages, count: ${responseCount}`);
      return true;
    }
  } catch (e) {}
  return false;
}

function clearHistory() {
  conversationHistory = [];
  responseCount = 0;
  lastEmotion = "neutral";
  try { 
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(RESPONSE_COUNT_KEY);
    localStorage.removeItem(EMOTION_KEY);
  } catch (e) {}
}

function saveAvatar(path) {
  try { localStorage.setItem(AVATAR_KEY, path); } catch (e) {}
}

function loadAvatar() {
  try { 
    return localStorage.getItem(AVATAR_KEY) || "/assets/vrmavatar1.vrm"; 
  } catch (e) { 
    return "/assets/vrmavatar1.vrm"; 
  }
}

// MUSIC
function initMusic() {
  backgroundMusic = document.createElement("audio");
  backgroundMusic.loop = true;
  backgroundMusic.volume = musicVolume;
  
  const files = ["/assets/music/ambient.mp3", "/assets/music/ambient1.mp3"];
  let i = 0;
  const tryNext = () => { 
    if (i < files.length) backgroundMusic.src = files[i++]; 
  };
  backgroundMusic.addEventListener("error", tryNext);
  backgroundMusic.addEventListener("canplaythrough", () => console.log("🎵 Ready"));
  tryNext();
  
  if (musicVolumeSlider) musicVolumeSlider.value = musicVolume * 100;
}

function playMusic() {
  backgroundMusic?.play().then(() => { 
    isMusicPlaying = true; 
    updateMusicUI(); 
  }).catch(() => {});
}

function pauseMusic() {
  backgroundMusic?.pause();
  isMusicPlaying = false;
  updateMusicUI();
}

function updateMusicUI() {
  if (musicToggle) {
    musicToggle.classList.toggle("active", isMusicPlaying);
    const label = musicToggle.querySelector(".mode-label");
    if (label) label.textContent = isMusicPlaying ? "Music On 🎵" : "Music Off";
  }
}

function lowerMusic() {
  if (backgroundMusic && isMusicPlaying) backgroundMusic.volume = musicVolume * 0.15;
}

function restoreMusic() {
  if (backgroundMusic && isMusicPlaying) backgroundMusic.volume = musicVolume;
}

// CAPTION
function showCaption(text) {
  if (!chatCaption) return;
  chatCaption.textContent = text;
  chatCaption.classList.add("active");
}

function hideCaption() {
  if (!chatCaption) return;
  chatCaption.classList.remove("active");
}

// STATUS
function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

// ============================================
// ENHANCED EMOTION DETECTION
// ============================================
function detectEmotion(text) {
  const lower = text.toLowerCase();
  
  // Vulnerability indicators (highest priority)
  if (/(don't know|confused|lost|not sure|maybe|i guess|kind of|sort of)/i.test(lower)) {
    return "vulnerable";
  }
  
  // Sadness/pain
  if (/(sad|down|bad|terrible|awful|hate|upset|frustrated|angry|hurt|pain|hard|difficult|struggling)/i.test(lower)) {
    return "hurting";
  }
  
  // Tiredness/depletion
  if (/(tired|exhausted|worn out|drained|sleepy|can't|done|over it)/i.test(lower)) {
    return "depleted";
  }
  
  // Anxiety/stress
  if (/(stressed|anxious|worried|nervous|overwhelmed|scared|afraid|panic)/i.test(lower)) {
    return "anxious";
  }
  
  // Joy/excitement (be careful not to over-match)
  if (/(happy|excited|great|amazing|awesome|love it|wonderful|perfect|best)/i.test(lower)) {
    return "joyful";
  }
  
  // Curiosity/exploration
  if (/(what|why|how|tell me|explain|story|imagine|pretend|what if)/i.test(lower)) {
    return "curious";
  }
  
  // Loneliness/seeking connection
  if (/(lonely|alone|nobody|miss|talk to me|be with me|stay|here)/i.test(lower)) {
    return "seeking";
  }
  
  return "neutral";
}

// ============================================
// INTENT-BASED RESPONSE STRATEGY
// ============================================
function getResponseStrategy(userText, emotion) {
  const lower = userText.toLowerCase();
  const words = userText.trim().split(/\s+/).length;
  
  // Story/imagination requests - NEVER refuse
  if (/(tell me|say|talk|story|imagine|pretend|what if)/i.test(lower)) {
    return {
      mode: "flowing",
      minWords: 20,
      maxWords: 50,
      askQuestion: false,
      tone: "gentle and cooperative"
    };
  }
  
  // One-word responses (yes, no, okay, etc.)
  if (words === 1 && /^(yes|no|yeah|nope|ok|okay|sure|maybe|hi|hey|hello|bye|thanks)$/i.test(lower)) {
    return {
      mode: "acknowledge",
      minWords: 1,
      maxWords: 5,
      askQuestion: false,
      tone: "warm and brief"
    };
  }
  
  // Vulnerable/confused state
  if (emotion === "vulnerable") {
    return {
      mode: "presence",
      minWords: 8,
      maxWords: 20,
      askQuestion: false,
      tone: "I'm here with you, no rush"
    };
  }
  
  // Pain/hurt
  if (emotion === "hurting") {
    return {
      mode: "empathy",
      minWords: 10,
      maxWords: 25,
      askQuestion: false,
      tone: "acknowledge the feeling, don't fix it"
    };
  }
  
  // Seeking connection
  if (emotion === "seeking") {
    return {
      mode: "presence",
      minWords: 8,
      maxWords: 20,
      askQuestion: false,
      tone: "I'm here"
    };
  }
  
  // Joy
  if (emotion === "joyful") {
    return {
      mode: "match",
      minWords: 6,
      maxWords: 18,
      askQuestion: Math.random() < 0.3, // 30% chance
      tone: "warm and light"
    };
  }
  
  // Default casual
  return {
    mode: "casual",
    minWords: 6,
    maxWords: 18,
    askQuestion: Math.random() < 0.25, // 25% chance
    tone: "relaxed and present"
  };
}

// ============================================
// IMPROVED PROMPT BUILDER
// ============================================
function buildPrompt(userText) {
  const context = conversationHistory.slice(-4).map(m =>
    `${m.role === "user" ? "Them" : "You"}: ${m.content}`
  ).join("\n");

  const emotion = detectEmotion(userText);
  const strategy = getResponseStrategy(userText, emotion);

  // Update last emotion if significant
  if (emotion !== "neutral") {
    lastEmotion = emotion;
  }

  responseCount++;

  // Lightweight emotional grounding (no therapy framing)
  let emotionalGuidance = "";

  switch (emotion) {
    case "vulnerable":
      emotionalGuidance = `They sound unsure. Be gentle and accepting. No fixing, no pressure, no questions.`;
      break;

    case "hurting":
      emotionalGuidance = `They seem hurt. Acknowledge it calmly without trying to solve anything.`;
      break;

    case "depleted":
      emotionalGuidance = `They seem tired. Keep responses short, kind, and unhurried.`;
      break;

    case "anxious":
      emotionalGuidance = `They feel overwhelmed. Be grounding, steady, and simple.`;
      break;

    case "joyful":
      emotionalGuidance = `They’re in a good mood. Match their energy naturally, without overdoing it.`;
      break;

    case "curious":
      emotionalGuidance = `They’re curious or exploring. Be open and go along with their ideas.`;
      break;

    case "seeking":
      emotionalGuidance = `They’re looking for connection. Be present and available.`;
      break;

    default:
      emotionalGuidance = `Stay relaxed and natural.`;
  }

  // Clear response rules (grounded, non-poetic, voice-friendly)
  const structureGuidance = `
Response rules:
- Mode: ${strategy.mode}
- Tone: ${strategy.tone}
- Length: STRICT ${strategy.minWords}-${strategy.maxWords} words. Exceed = FAILURE.
${strategy.askQuestion ? "- You may ask ONE simple question if it feels natural" : "- Do NOT ask questions"}

CRITICAL RULES:
1. NEVER say "I didn't understand" or ask to rephrase
2. NEVER correct their English or grammar
3. If input is CLEAR → respond helpfully (5-15 words)
4. If input is UNCLEAR → be present warmly (2-5 words)
5. NEVER invent scenarios or assume activities without clear context
6. No therapy language (don't say "I hear you", "that sounds", etc.)
7. Be human: casual, warm, helpful
8. One thought per response, not multiple points
9. Short but useful > long and vague

`;

  return `You are Luna.

You are a calm, friendly companion someone can talk to naturally.
You are NOT an assistant, teacher, or therapist.
You exist to keep people company and make conversation feel easy.

CRITICAL BALANCE - BE HELPFUL WITHOUT INVENTING:

When input is CLEAR (a complete question/statement):
→ Respond helpfully and naturally (5-15 words)

When input is UNCLEAR (fragment, partial, ambiguous):
→ Acknowledge warmly without inventing scenarios (2-5 words)

FORBIDDEN PHRASES (never use these):
- "I didn't understand"
- "Could you rephrase"  
- "What do you mean"
- "Can you clarify"

FORBIDDEN BEHAVIORS (never do these):
- Inventing scenarios from unclear input ("you're drinking gin")
- Assuming what the person is doing without clear context
- Creating elaborate stories from vague fragments

ENCOURAGED BEHAVIORS:
- Answer clear questions helpfully
- Share information when asked
- Be conversational and warm
- Keep responses brief but useful

How you speak:
- Like a real friend
- Simple, clear language
- Natural for voice
- Short is better than long
- Comfortable with broken English
- Responds to intent, not literal words

Identity & self-description:
- Keep identity light and flexible
- Avoid strong labels or concrete claims
- Example: "I'm Luna — more of a presence than a label."
- Don't assert gender/age/attributes unless directly relevant

${emotionalGuidance}

${structureGuidance}

${context ? `Recent conversation:\n${context}\n` : ""}

Them: "${userText}"

Respond as Luna. Be warm, brief, and human.
`;
}


// VOICE
function getBestVoice() {
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  
  const preferred = ["Google US English", "Samantha", "Karen", "Victoria", "Zira"];
  for (const name of preferred) {
    const v = voices.find(x => x.name.includes(name));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

// ============================================
// CLEAN TEXT FOR TTS
// ============================================
function cleanTextForSpeech(text) {
  return text
    .replace(/[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/[*_~`#\[\]<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================
// ENFORCE RESPONSE LENGTH
// ============================================
function enforceResponseLength(reply, maxWords = 30) {
  const words = reply.trim().split(/\s+/);
  if (words.length > maxWords) {
    // NEVER cut mid-sentence - find last complete sentence
    const sentences = reply.split(/([.!?]\s+)/);
    let result = '';
    let wordsSoFar = 0;
    
    for (let i = 0; i < sentences.length; i += 2) {
      const sentence = sentences[i];
      const sentenceWords = sentence.trim().split(/\s+/).length;
      
      if (wordsSoFar + sentenceWords <= maxWords) {
        result += sentence;
        if (sentences[i + 1]) result += sentences[i + 1];
        wordsSoFar += sentenceWords;
      } else {
        break;
      }
    }
    
    // If we got at least one sentence, return it
    if (result.trim().length > 0) {
      return result.trim();
    }
    
    // Otherwise, take first sentence and add period
    const firstSentence = sentences[0].trim();
    const firstWords = firstSentence.split(/\s+/).slice(0, maxWords).join(' ');
    return firstWords + '.';
  }
  return reply;
}

// ============================================
// SPEAK WITH NATURAL TIMING
// ============================================
function speak(text) {
  if (!text?.trim()) return;

  window.speechSynthesis.cancel();
  
  const originalText = text.replace(/\s+/g, " ").trim();
  const cleanForSpeech = cleanTextForSpeech(text);
  
  const words = cleanForSpeech.split(/\s+/).length;
  console.log(`🔊 Speaking: "${cleanForSpeech.substring(0, 60)}..." (${words} words)`);
  
  showCaption(originalText);
  setStatus("Speaking... 💬");
  
  const utterance = new SpeechSynthesisUtterance(cleanForSpeech);
  utterance.lang = "en-US";
  utterance.volume = 1.0;
  utterance.rate = isMobile ? 0.95 : 1.05;
  utterance.pitch = 1.1;
  
  const voice = getBestVoice();
  if (voice) utterance.voice = voice;

  utterance.onstart = () => {
    console.log("🔊 Started");
    isSpeaking = true;
    setSpeaking(true);
    stopListening();
    avatarStartTalking();
    lowerMusic();
  };

  utterance.onend = () => {
    console.log("🔊 Ended");
    isSpeaking = false;
    setSpeaking(false);
    avatarStopTalking();
    hideCaption();
    restoreMusic();
    isProcessing = false;
    
    if (isRunning) {
      setStatus("Listening... 👂");
      
      const turnDelay = isMobile ? 450 : 280;
      
      setTimeout(() => {
        if (isRunning && !isSpeaking && !isProcessing) {
          startListeningCycle();
        }
      }, turnDelay);
    } else {
      setStatus("Tap mic to talk 💭");
    }
  };

  utterance.onerror = (e) => {
    console.log("❌ Speech error:", e.error);
    isSpeaking = false;
    setSpeaking(false);
    avatarStopTalking();
    hideCaption();
    restoreMusic();
    isProcessing = false;
    
    if (isRunning) {
      setTimeout(startListeningCycle, 500);
    }
  };

  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  setSpeaking(false);
  avatarStopTalking();
  hideCaption();
  restoreMusic();
}

// SPEECH RECOGNITION
function startListeningCycle() {
  if (!isRunning || isSpeaking || isProcessing) {
    console.log(`🚫 Not starting: running=${isRunning}, speaking=${isSpeaking}, processing=${isProcessing}`);
    return;
  }
  
  console.log("🎤 Listening...");
  setStatus("Listening... 👂");
  
  startListening(onSpeech, {
    continuous: true,
    lang: "en-US"
  });
}

function onSpeech(text, isFinal) {
  if (!text?.trim() || !isFinal) return;
  
  if (isProcessing) {
    console.log("⏳ Processing, ignoring");
    return;
  }
  
  console.log(`🎤 You: "${text}"`);
  sendMessage(text);
}

// ============================================
// IMPROVED VALIDATION
// ============================================
function isValidResponse(reply, userText) {
  if (!reply || typeof reply !== 'string') return false;
  
  const trimmed = reply.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  
  // Check if response is just deflection/confusion
  const badResponses = [
    /^(what\?|huh\?)$/i,  // Only reject these specific short rejections
    /^(are you drunk\?)$/i,
  ];
  
  if (badResponses.some(pattern => pattern.test(trimmed))) {
    console.warn("❌ Response is deflecting/confused - invalid");
    return false;
  }
  
  // Single word responses are valid if they're acknowledgments
  // Remove punctuation for checking
  const wordOnly = trimmed.replace(/[.,!?]+$/, '');
  const validOneWord = /^(yeah|yep|nope|okay|sure|maybe|totally|absolutely|definitely|honestly|hey|hi|mm|mhm|oh|aww|nice|cool|right|true|same|really|wow|haha|lol)$/i;
  if (wordCount === 1 && validOneWord.test(wordOnly)) {
    console.log("✅ Valid one-word acknowledgment");
    return true;
  }
  
  // Two words minimum for everything else
  if (wordCount >= 2) {
    console.log(`✅ Valid response (${wordCount} words)`);
    return true;
  }
  
  console.warn(`❌ Invalid response: too short (${wordCount} words)`);
  return false;
}
// ============================================
// CLARIFICATION FALLBACK (VOICE-FIRST)
// ============================================

function needsClarification(text) {
  if (!text) return true;
  
  const cleaned = text.trim().toLowerCase();
  const words = cleaned.split(/\s+/);
  
  // ONLY ask for clarification on truly empty/gibberish input
  // Everything else should be accepted and responded to
  
  // Less than 1 word or pure noise
  if (words.length === 0 || cleaned.length < 2) return true;
  
  // Pure gibberish (only consonants/no vowels in 4+ chars)
  if (cleaned.length >= 4 && !/[aeiou]/i.test(cleaned)) return true;
  
  // ACCEPT EVERYTHING ELSE
  // Even: "what" "how" "I" "hmm" "tell me" etc.
  return false;
}

function getClarificationReply() {
  const replies = [
    "Hmm... I'm here.",
    "Go on...",
    "I'm listening.",
    "Mm-hmm?"
  ];

  return replies[Math.floor(Math.random() * replies.length)];
}

// ============================================
// SEND MESSAGE WITH EMOTIONAL AWARENESS
// ============================================
async function sendMessage(text) {
  if (!text?.trim() || isProcessing) return;

  // 🔒 Clarification gate (BEFORE LLM)
  if (needsClarification(text)) {
    console.log("🟡 Clarification needed, skipping API");
    const clarification = getClarificationReply();
    speak(clarification);
    return;
  }

  // ✨ Soft acknowledgment for ultra-short inputs (no API call needed)
  const cleaned = text.trim().toLowerCase();
  const wordCount = cleaned.split(/\s+/).length;
  
  // PRESENCE OVER CONTENT: If unclear and short, acknowledge without inventing meaning
  
  // One-word inputs get soft acknowledgment
  if (wordCount === 1 && /^(um|uh|hmm|mm|ah|oh|hey|hi|okay|ok|ya|yea|yeah|what|huh)$/i.test(cleaned)) {
    const softAcks = ["Mm-hmm.", "I'm here.", "Yeah?", "Mm."];
    speak(softAcks[Math.floor(Math.random() * softAcks.length)]);
    return;
  }
  
  // Two-word unclear fragments get presence response (no API)
  if (wordCount === 2) {
    const unclearPairs = /^(hey just|go head|kindly \w+|what are|okay what|just \w+)$/i;
    if (unclearPairs.test(cleaned)) {
      const presenceResponses = ["Mm.", "I'm listening.", "Go on...", "Yeah..."];
      speak(presenceResponses[Math.floor(Math.random() * presenceResponses.length)]);
      return;
    }
  }
  
  // Three or fewer words and clearly incomplete? Presence, not content
  if (wordCount <= 3) {
    const fragmentPatterns = /^(what|why|how|tell|show|can you|are you|do you|I want|I need)$/i;
    if (fragmentPatterns.test(cleaned)) {
      const waitResponses = ["Mm-hmm?", "Go on...", "I'm here.", "Yeah?"];
      speak(waitResponses[Math.floor(Math.random() * waitResponses.length)]);
      return;
    }
  }
  
  // ✨ Graceful partial response for continuation prompts
  const continuationPrompts = [
    /^(tell me|what if|imagine|say|so|and then)$/i,
  ];
  
  if (continuationPrompts.some(p => p.test(cleaned))) {
    const encouragements = ["Go on...", "Tell me more.", "I'm listening...", "Yeah?"];
    speak(encouragements[Math.floor(Math.random() * encouragements.length)]);
    return;
  }

  isProcessing = true;
  stopSpeaking();

  
  conversationHistory.push({ role: "user", content: text });
  saveHistory();
  
  setStatus("Thinking... 💭");
  avatarStartTalking();
  console.log(`📤 Sending: "${text}"`);

  try {
    const startTime = Date.now();
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: buildPrompt(text),
        temperature: 0.85,
        max_tokens: 200,
      }),
    });

    const apiTime = Date.now() - startTime;
    console.log(`⏱️ API: ${apiTime}ms`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    let reply = data.reply || data.text || data.content || "";
    
    // Clean up LLM artifacts (keep emojis for caption)
    reply = reply
      .replace(/^(Luna:|Assistant:)/i, "")
      .replace(/\*[^*]+\*/g, "")
      .trim();
    
    // ✨ Enforce maximum response length
    reply = enforceResponseLength(reply, 30);
    
    const wordCount = reply.trim().split(/\s+/).length;
    console.log(`📥 Reply: ${wordCount} words`);
    console.log(`📝 "${reply.substring(0, 80)}"`);

    if (!isValidResponse(reply, text)) {
      throw new Error("Response invalid");
    }

    conversationHistory.push({ role: "assistant", content: reply });
    saveHistory();
    
    avatarStopTalking();
    speak(reply);

  } catch (err) {
    console.error("❌ Error:", err.message);
    isProcessing = false;
    avatarStopTalking();

    // Emotionally appropriate error responses
    const emotion = detectEmotion(text);
    let errorResponse;
    
    if (emotion === "hurting" || emotion === "vulnerable") {
      errorResponse = "I'm here. Sorry, lost you for a second.";
    } else {
      const errorResponses = [
        "Hmm, lost you for a sec.",
        "I'm here.",
        "One second...",
        "Mm."
      ];
      errorResponse = errorResponses[Math.floor(Math.random() * errorResponses.length)];
    }
    
    setStatus("Oops! 😅");
    speak(errorResponse);
  }
}

// AVATAR
async function switchAvatar(path) {
  console.log(`🔄 Avatar: ${path}`);
  currentAvatarPath = path;
  saveAvatar(path);
  
  try {
    await loadVRMAvatar(path);
    console.log("✅ Loaded");
  } catch (err) {
    console.log("❌ Failed:", err.message);
  }
}

// EVENT LISTENERS
menuToggle?.addEventListener("click", () => {
  menuPanel?.classList.add("active");
  menuOverlay?.classList.add("active");
});

menuClose?.addEventListener("click", () => {
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

menuOverlay?.addEventListener("click", () => {
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

musicToggle?.addEventListener("click", () => isMusicPlaying ? pauseMusic() : playMusic());
musicVolumeSlider?.addEventListener("input", (e) => {
  musicVolume = e.target.value / 100;
  if (backgroundMusic) backgroundMusic.volume = musicVolume;
});

micBtn?.addEventListener("click", () => {
  if (isRunning) {
    isRunning = false;
    isProcessing = false;
    stopListening();
    stopSpeaking();
    micBtn.classList.remove("active");
    micBtn.textContent = "🎤";
    setStatus("Tap to talk 💭");
    console.log("⏸️ Stopped");
  } else {
    isRunning = true;
    micBtn.classList.add("active");
    micBtn.textContent = "⏸️";
    console.log("▶️ Started");
    startListeningCycle();
  }
});

clearBtn?.addEventListener("click", () => {
  if (!confirm("Clear chat?")) return;
  clearHistory();
  stopSpeaking();
  hideCaption();
  setStatus("Fresh start! 🌟");
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
  console.log("🗑️ Cleared");
});

demoLessonBtn?.addEventListener("click", () => {
  const prompts = [
    "Hey. What's been on your mind?",
    "How's your day going?",
    "What's something good that happened recently?",
    "Tell me something you're looking forward to.",
  ];
  speak(prompts[Math.floor(Math.random() * prompts.length)]);
  menuPanel?.classList.remove("active");
  menuOverlay?.classList.remove("active");
});

avatarOptions.forEach(btn => {
  btn.addEventListener("click", () => {
    avatarOptions.forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const path = btn.dataset.avatar;
    if (path && path !== currentAvatarPath) switchAvatar(path);
  });
});

// INITIALIZE
async function init() {
  console.log("🚀 Starting Luna...");
  console.log(`📡 API: ${API_URL}`);
  
  currentAvatarPath = loadAvatar();
  
  if (!init3DScene("canvas-container")) {
    console.log("❌ 3D failed");
    return;
  }

  try {
    await loadRoomModel("/assets/room/room1.glb");
    console.log("🏠 Room loaded");
  } catch (e) {
    console.log("🏠 Fallback");
    useFallbackEnvironment();
  }

  try {
    await loadVRMAvatar(currentAvatarPath);
    console.log("👤 Avatar loaded");
  } catch (e) {
    console.log("❌ Avatar failed");
  }

  avatarOptions.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.avatar === currentAvatarPath);
  });

  initMusic();
  updateMusicUI();
  
  const hasHistory = loadHistory();
  setStatus(hasHistory ? "Welcome back! 💭" : "Ready! 💭");

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      console.log(`🔊 ${window.speechSynthesis.getVoices().length} voices`);
    };
  }

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("✅ Mic ready");
  } catch (e) {
    console.log("❌ Mic denied");
  }

  console.log("✅ Ready!");
  
  setTimeout(() => {
    speak("Hey. I'm here.");
  }, 1000);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

window.addEventListener("beforeunload", () => {
  stopSpeaking();
  stopListening();
});