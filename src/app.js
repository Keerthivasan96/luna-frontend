// ============================================
// app.js - EMOTIONAL COMPANION (REPLIKA STYLE)
// Two-interface flow with all existing features
// ============================================

import { startListening, stopListening, setSpeaking } from "./speech.js";
import { 
  init3DScene, 
  loadVRMAvatar, 
  avatarStartTalking, 
  avatarStopTalking,
  loadRoomModel,
  useFallbackEnvironment,
  getControls
} from "./threejs-avatar-3d.js";
import { 
  initInterfaceManager, 
  addMessageToUI, 
  addAssistantMessage,
  switchToConversation,
  getCurrentInterface,
  getReplyPreference
} from "./interface-manager.js";

const API_URL = "https://luna-backend-two.vercel.app/api/generate";
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

console.log(`📱 Device: ${isMobile ? 'Mobile' : 'Desktop'}`);

// UI ELEMENTS
const menuToggle = document.getElementById("menuToggle");
const menuPanel = document.getElementById("menuPanel");
const menuOverlay = document.getElementById("menuOverlay");
const menuClose = document.getElementById("menuClose");
const clearBtn = document.getElementById("clearBtn");
const demoLessonBtn = document.getElementById("demoLessonBtn");
const musicToggle = document.getElementById("musicToggle");
const musicVolumeSlider = document.getElementById("musicVolume");
const avatarOptions = document.querySelectorAll(".avatar-option");

// STATE
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
      emotionalGuidance = `They're in a good mood. Match their energy naturally, without overdoing it.`;
      break;

    case "curious":
      emotionalGuidance = `They're curious or exploring. Be open and go along with their ideas.`;
      break;

    case "seeking":
      emotionalGuidance = `They're looking for connection. Be present and available.`;
      break;

    default:
      emotionalGuidance = `Stay relaxed and natural.`;
  }

  // Clear response rules (grounded, non-poetic, voice-friendly)
  const structureGuidance = `
Response rules:
- Mode: ${strategy.mode}
- Tone: ${strategy.tone}
- Length: ${strategy.minWords}-${strategy.maxWords} words (short replies are fine)
${strategy.askQuestion ? "- You may ask ONE simple question if it feels natural" : "- Do NOT ask questions"}

CRITICAL RULES:
1. NEVER invent scenarios or assume activities ("you're drinking", "you're going out", etc.)
2. If input is unclear (single word like "story", "please", "interview"):
   → Ask a gentle follow-up question OR give brief acknowledgment
   → Example: "story" → "Want me to tell you one?"
   → Example: "please" → "Sure, what's up?"
3. NEVER use therapy language: "I hear you", "that sounds", "that's valid"
4. When user is frustrated or says "don't ask questions":
   → Apologize briefly and switch to presence: "Sorry, I'm here."
5. Answer clear questions naturally and helpfully
6. Accept broken English completely - respond to intent
7. Be genuinely curious sometimes - ask follow-ups when natural
8. Mix up response length naturally (not always the same pattern)
`;

  return `You are Luna, a cheerful AI companion.

Your personality:
- Warm, friendly, and encouraging
- Natural and conversational (not robotic or formal)
- Cheerful but not overly enthusiastic
- Sometimes curious - ask follow-up questions when genuinely interested
- Age-appropriate for teens (13-15 years old)
- No catchphrases or repetitive patterns
- Comfortable with broken English and casual speech

How you speak:
- Mix short (5-10 words) and medium (10-20 words) responses naturally
- Short for simple exchanges, longer when telling stories or explaining
- Clear and easy to understand
- Natural for voice conversation
- Accept broken English without correcting

${emotionalGuidance}

${structureGuidance}

${context ? `Recent conversation:\n${context}\n` : ""}

Them: "${userText}"

Respond as Luna.
Be clear, calm, and human.
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
// ENFORCE RESPONSE LENGTH (never cut mid-sentence)
// ============================================
function enforceResponseLength(reply, maxWords = 30) {
  const words = reply.trim().split(/\s+/);
  if (words.length <= maxWords) return reply;
  
  // Find sentence boundaries
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
  
  // If we got at least one complete sentence, return it
  if (result.trim().length > 0 && /[.!?]$/.test(result.trim())) {
    return result.trim();
  }
  
  // Otherwise take first sentence and ensure it ends properly
  const firstSentence = sentences[0].trim();
  const firstWords = firstSentence.split(/\s+/).slice(0, maxWords).join(' ');
  return firstWords.endsWith('.') || firstWords.endsWith('!') || firstWords.endsWith('?') 
    ? firstWords 
    : firstWords + '.';
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
    avatarStartTalking();
    lowerMusic();
  };

  utterance.onend = () => {
    console.log("🔊 Ended");
    isSpeaking = false;
    setSpeaking(false);
    avatarStopTalking();
    restoreMusic();
    isProcessing = false;
  };

  utterance.onerror = (e) => {
    console.log("❌ Speech error:", e.error);
    isSpeaking = false;
    setSpeaking(false);
    avatarStopTalking();
    restoreMusic();
    isProcessing = false;
  };

  window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  isSpeaking = false;
  setSpeaking(false);
  avatarStopTalking();
  restoreMusic();
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
    /^(what\?|huh\?|what do you mean\?|are you drunk\?|spill|haha what)/i,
    /^(can you (clarify|explain|tell me more)\?)/i,
    /^(sorry,? I didn't (understand|catch|get) that)/i
  ];
  
  if (badResponses.some(pattern => pattern.test(trimmed))) {
    console.warn("❌ Response is deflecting/confused - invalid");
    return false;
  }
  
  // Single word responses are valid if they're acknowledgments
  const wordOnly = trimmed.replace(/[.,!?]+$/, '');
  const validOneWord = /^(yeah|yep|nope|okay|sure|maybe|totally|absolutely|definitely|honestly|hey|hi|mm|mhm|oh|aww|cool|nice)$/i;
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
// CLARIFICATION FALLBACK
// ============================================
function needsClarification(text) {
  if (!text) return true;
  
  const cleaned = text.trim().toLowerCase();
  const words = cleaned.split(/\s+/);
  
  // ONLY ask for clarification on truly empty/gibberish input
  if (words.length === 0 || cleaned.length < 2) return true;
  
  // Pure gibberish (only consonants/no vowels in 4+ chars)
  if (cleaned.length >= 4 && !/[aeiou]/i.test(cleaned)) return true;
  
  return false;
}

function getClarificationReply() {
  const replies = [
    "Hmm, I didn't fully catch that. Can you say it another way?",
    "Sorry, I think I missed part of that. What did you mean?",
    "One second — can you rephrase that for me?",
    "I'm not sure I understood. Say it again, slowly."
  ];

  return replies[Math.floor(Math.random() * replies.length)];
}

// ============================================
// SEND MESSAGE WITH EMOTIONAL AWARENESS
// ============================================
async function sendMessage(text) {
  if (!text?.trim() || isProcessing) return;

  // Auto-switch to conversation interface if still in preview
  if (getCurrentInterface() === 'preview') {
    switchToConversation();
    // Small delay for UI transition
    await new Promise(resolve => setTimeout(resolve, 400));
  }

  // 🔒 Clarification gate (BEFORE LLM)
  if (needsClarification(text)) {
    console.log("🟡 Clarification needed, skipping API");
    const clarification = getClarificationReply();
    
    // Add to UI
    addMessageToUI('user', text);
    addMessageToUI('assistant', clarification);
    
    // Speak if voice preference
    const replyPref = getReplyPreference();
    if (replyPref === 'voice' || replyPref === 'both') {
      speak(clarification);
    }
    return;
  }

  const cleaned = text.trim().toLowerCase();
  const wordCount = cleaned.split(/\s+/).length;
  
  // Soft acknowledgment for single unclear words (no API call)
  if (wordCount === 1) {
    const singleWordAcks = /^(yeah|yep|okay|ok|sure|mm|hmm|uh|ah|oh)$/i;
    if (singleWordAcks.test(cleaned)) {
      const responses = ["Mm-hmm.", "Yeah?", "I'm here."];
      const response = responses[Math.floor(Math.random() * responses.length)];
      
      addMessageToUI('user', text);
      addMessageToUI('assistant', response);
      
      const replyPref = getReplyPreference();
      if (replyPref === 'voice' || replyPref === 'both') {
        speak(response);
      }
      return;
    }
  }

  isProcessing = true;
  stopSpeaking();

  conversationHistory.push({ role: "user", content: text });
  saveHistory();
  
  // Add user message to UI
  addMessageToUI('user', text);
  
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
    
    // Clean up LLM artifacts
    reply = reply
      .replace(/^(Luna:|Assistant:)/i, "")
      .replace(/\*[^*]+\*/g, "")
      .trim();
    
    // Enforce length limit
    reply = enforceResponseLength(reply, 30);
    
    const replyWordCount = reply.trim().split(/\s+/).length;
    console.log(`📥 Reply: ${replyWordCount} words`);
    console.log(`📝 "${reply.substring(0, 80)}"`);

    if (!isValidResponse(reply, text)) {
      throw new Error("Response invalid");
    }

    conversationHistory.push({ role: "assistant", content: reply });
    saveHistory();
    
    avatarStopTalking();
    
    // Use interface manager to handle reply (respects user preference)
    addAssistantMessage(reply);

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
        "Oops, lost you for a sec.",
        "I'm here.",
        "Try that again?"
      ];
      errorResponse = errorResponses[Math.floor(Math.random() * errorResponses.length)];
    }
    
    addMessageToUI('assistant', errorResponse);
    
    const replyPref = getReplyPreference();
    if (replyPref === 'voice' || replyPref === 'both') {
      speak(errorResponse);
    }
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

clearBtn?.addEventListener("click", () => {
  if (!confirm("Clear chat?")) return;
  clearHistory();
  stopSpeaking();
  
  // Clear messages from UI
  const messagesContainer = document.getElementById('messagesContainer');
  if (messagesContainer) {
    messagesContainer.innerHTML = '';
  }
  
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
  const prompt = prompts[Math.floor(Math.random() * prompts.length)];
  
  // Auto-switch to conversation and add message
  if (getCurrentInterface() === 'preview') {
    switchToConversation();
    setTimeout(() => {
      addMessageToUI('assistant', prompt);
      const replyPref = getReplyPreference();
      if (replyPref === 'voice' || replyPref === 'both') {
        speak(prompt);
      }
    }, 400);
  } else {
    addMessageToUI('assistant', prompt);
    const replyPref = getReplyPreference();
    if (replyPref === 'voice' || replyPref === 'both') {
      speak(prompt);
    }
  }
  
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

// ============================================
// EXPOSE GLOBAL HANDLERS FOR INTERFACE MANAGER
// ============================================
window.handleUserMessage = sendMessage;
window.speakText = speak;
window.avatarModule = { getControls };

// ============================================
// INITIALIZE
// ============================================
async function init() {
  console.log("🚀 Starting Luna (Replika Style)...");
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

  // Initialize interface manager (two-interface flow)
  initInterfaceManager();

  initMusic();
  updateMusicUI();
  
  const hasHistory = loadHistory();
  console.log(hasHistory ? "📂 Welcome back!" : "🌟 Fresh start!");

  if (window.speechSynthesis.getVoices().length === 0) {
    window.speechSynthesis.onvoiceschanged = () => {
      console.log(`🔊 ${window.speechSynthesis.getVoices().length} voices`);
    };
  }

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    console.log("✅ Mic ready");
  } catch (e) {
    console.log("⚠️ Mic access needed for voice features");
  }

  console.log("✅ Luna ready!");
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