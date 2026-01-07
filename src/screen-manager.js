// ============================================
// screen-manager.js - WITH CAMERA TRANSITIONS
// Integrates smooth Replika-style camera zoom
// ============================================

import { startListening, stopListening, setSpeaking } from "./speech.js";

// ============================================
// STATE
// ============================================
let currentScreen = 'landing';
let loadingProgress = 0;
let isLoadingComplete = false;

// Track what's loaded
let loadingSteps = {
  scene3D: false,
  avatar: false,
  room: false,
  voices: false,
  mic: false
};

// ANTI-DUPLICATE SYSTEM
let lastMessageText = '';
let lastMessageTime = 0;
const MESSAGE_DEBOUNCE = 500;
let isSendingMessage = false;

// ============================================
// SCREEN VISIBILITY MANAGEMENT
// ============================================

export function showScreen(screenName) {
  console.log(`[ScreenManager] Switching to: ${screenName}`);
  
  const allScreens = document.querySelectorAll('.screen');
  allScreens.forEach(screen => {
    screen.classList.remove('active');
  });
  
  const targetScreen = document.getElementById(`${screenName}Screen`);
  if (targetScreen) {
    targetScreen.classList.add('active');
    currentScreen = screenName;
    onScreenChange(screenName);
  } else {
    console.error(`[ScreenManager] Screen not found: ${screenName}Screen`);
  }
}

function onScreenChange(screenName) {
  const canvas = document.querySelector('canvas');

  switch (screenName) {
    case 'landing':
      break;

    case 'textChat':
      const textChatContainer = document.getElementById('canvas-container-text');
      if (canvas && textChatContainer && !textChatContainer.contains(canvas)) {
        textChatContainer.appendChild(canvas);
      }

      window.avatarModule?.transitionCameraToMode('textChat', 1500);
      setTimeout(() => {
        const input = document.getElementById('textChatInput');
        if (input) input.focus();
      }, 400);
      stopListening();
      setSpeaking(false);
      break;

    case 'call':
      const callContainer = document.getElementById('canvas-container');
      if (canvas && callContainer && !callContainer.contains(canvas)) {
        callContainer.appendChild(canvas);
      }

      window.avatarModule?.transitionCameraToMode('call', 1800, () => {
        window.avatarModule?.triggerGreeting?.();
      });
      break;
  }
}


export function getCurrentScreen() {
  return currentScreen;
}

// ============================================
// LOADING PROGRESS TRACKING
// ============================================

export function updateLoadingStep(step, complete = true) {
  if (loadingSteps.hasOwnProperty(step)) {
    loadingSteps[step] = complete;
    console.log(`[ScreenManager] Loading: ${step} = ${complete}`);
    calculateProgress();
  }
}

function calculateProgress() {
  const steps = Object.values(loadingSteps);
  const completed = steps.filter(v => v === true).length;
  const total = steps.length;
  
  loadingProgress = Math.round((completed / total) * 100);
  
  console.log(`[ScreenManager] Progress: ${loadingProgress}% (${completed}/${total})`);
  
  updateProgressBar(loadingProgress);
  
  if (loadingProgress >= 100 && !isLoadingComplete) {
    onLoadingComplete();
  }
}

function updateProgressBar(percent) {
  const progressBar = document.getElementById('loadingProgress');
  const loadingText = document.getElementById('loadingText');
  
  if (progressBar) {
    progressBar.style.width = `${percent}%`;
  }
  
  if (loadingText) {
    if (percent < 100) {
      loadingText.textContent = `Loading... ${percent}%`;
    } else {
      loadingText.textContent = 'Ready!';
    }
  }
}

function onLoadingComplete() {
  console.log('[ScreenManager] ✅ Loading complete!');
  isLoadingComplete = true;
  
  const enterBtn = document.getElementById('enterBtn');
  if (enterBtn) {
    enterBtn.style.display = 'block';
  }
}

export function completeLoading() {
  Object.keys(loadingSteps).forEach(key => {
    loadingSteps[key] = true;
  });
  calculateProgress();
}

// ============================================
// DISPLAY HELPER FUNCTIONS
// ============================================

export function setStatus(text) {
  const statusInline = document.getElementById('status');
  if (statusInline) {
    statusInline.textContent = text;
  }
  
  const statusCall = document.getElementById('callStatus');
  if (statusCall) {
    statusCall.textContent = text;
    statusCall.classList.add('active');
    setTimeout(() => {
      statusCall.classList.remove('active');
    }, 2000);
  }
}

export function showTranscript(text) {
  const transcript = document.getElementById('transcript');
  if (transcript) {
    transcript.style.display = 'block';
    transcript.textContent = text;
  }
}

export function hideTranscript() {
  const transcript = document.getElementById('transcript');
  if (transcript) {
    transcript.style.display = 'none';
  }
}

export function showReply(text) {
  const reply = document.getElementById('reply');
  if (reply) {
    reply.textContent = text;
  }
}

export function showCaption(text) {
  const caption = document.getElementById('chatCaption');
  if (caption) {
    caption.textContent = text;
    caption.classList.add('active');
  }
}

export function hideCaption() {
  const caption = document.getElementById('chatCaption');
  if (caption) {
    caption.classList.remove('active');
  }
}

// ============================================
// MESSAGE BUBBLE RENDERING - ANTI-DUPLICATE
// ============================================

export function addMessageBubble(sender, text) {
  const container = document.getElementById('textChatMessages');
  if (!container) {
    console.error('[ScreenManager] textChatMessages container not found!');
    return;
  }
  
  // PREVENT DUPLICATES
  const now = Date.now();
  if (sender === 'user' && text === lastMessageText && (now - lastMessageTime) < MESSAGE_DEBOUNCE) {
    console.warn('[ScreenManager] ❌ Duplicate blocked:', text);
    return;
  }
  
  if (sender === 'user') {
    lastMessageText = text;
    lastMessageTime = now;
  }
  
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${sender}`;
  bubble.textContent = text;
  
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
  
  console.log(`[ScreenManager] ✅ Added ${sender}: "${text.substring(0, 30)}..."`);
}

export function clearMessages() {
  const container = document.getElementById('textChatMessages');
  if (container) {
    container.innerHTML = '';
  }
  
  lastMessageText = '';
  lastMessageTime = 0;
}

// ============================================
// EVENT HANDLERS - LANDING SCREEN
// ============================================

function initLandingScreen() {
  const enterBtn = document.getElementById('enterBtn');
  
  if (enterBtn) {
    enterBtn.addEventListener('click', () => {
      console.log('[ScreenManager] Enter button clicked');
      showScreen('textChat');
    });
  }
}

// ============================================
// EVENT HANDLERS - TEXT CHAT SCREEN
// ============================================

function initTextChatScreen() {
  const textInput = document.getElementById('textChatInput');
  const sendBtn = document.getElementById('textSendBtn');
  const callBtn = document.getElementById('callBtn');
  const menuBtn = document.getElementById('chatMenuToggle');
  
  if (sendBtn) {
    sendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sendTextMessage();
    });
  }
  
  if (textInput) {
    textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        sendTextMessage();
      }
    });
  }
  
  if (callBtn) {
    callBtn.addEventListener('click', () => {
      console.log('[ScreenManager] 📞 Call button clicked - Starting camera transition');
      showScreen('call');
    });
  }
  
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      openSettings();
    });
  }
}

// FIXED: Prevent double sends
function sendTextMessage() {
  const input = document.getElementById('textChatInput');
  if (!input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  // PREVENT DOUBLE SEND
  if (isSendingMessage) {
    console.warn('[ScreenManager] ⏳ Already sending, blocked duplicate');
    return;
  }
  
  isSendingMessage = true;
  
  console.log('[ScreenManager] 📤 Sending:', text);
  
  // Add user message
  addMessageBubble('user', text);
  
  // Clear input IMMEDIATELY
  input.value = '';
  
  // Send to handler
  if (window.handleUserMessage) {
    window.handleUserMessage(text);
  } else {
    console.error('[ScreenManager] handleUserMessage not found!');
  }
  
  // Reset after delay
  setTimeout(() => {
    isSendingMessage = false;
  }, 300);
}

// ============================================
// EVENT HANDLERS - CALL SCREEN (VOICE ONLY)
// ============================================

function initCallScreen() {
  const backBtn = document.getElementById('backToTextBtn');
  const micBtn = document.getElementById('micBtn');
  
  // HIDE TEXT CHAT PANEL (Voice-only mode)
  const callPanel = document.getElementById('callChatPanel');
  if (callPanel) {
    callPanel.style.display = 'none';
  }
  
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      console.log('[ScreenManager] ← Back button clicked - Returning to text chat');
      stopListening();
      showScreen('textChat');
    });
  }
  
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      toggleMainMic();
    });
  }
}

let isMicActive = false;

function toggleMainMic() {
  isMicActive = !isMicActive;
  
  const micBtn = document.getElementById('micBtn');
  
  if (isMicActive) {
    console.log('[ScreenManager] 🎤 Mic ON');
    
    if (micBtn) micBtn.classList.add('active');
    
    startListening((text, isFinal) => {
      if (isFinal) {
        console.log('[ScreenManager] Voice input:', text);
        handleVoiceInput(text);
      } else {
        showTranscript(text);
      }
    }, { continuous: true });
    
  } else {
    console.log('[ScreenManager] 🎤 Mic OFF');
    
    if (micBtn) micBtn.classList.remove('active');
    
    stopListening();
    hideTranscript();
  }
}

function handleVoiceInput(text) {
  if (!text || !text.trim()) return;
  
  console.log('[ScreenManager] Processing voice:', text);
  
  hideTranscript();
  
  if (window.handleUserMessage) {
    window.handleUserMessage(text);
  }
}

// ============================================
// SETTINGS MENU
// ============================================

function openSettings() {
  const menuPanel = document.getElementById('menuPanel');
  const menuOverlay = document.getElementById('menuOverlay');
  
  if (menuPanel) menuPanel.classList.add('active');
  if (menuOverlay) menuOverlay.classList.add('active');
}

// ============================================
// INITIALIZE ALL SCREENS
// ============================================

export function initScreenManager() {
  console.log('[ScreenManager] Initializing...');
  
  showScreen('landing');
  
  initLandingScreen();
  initTextChatScreen();
  initCallScreen();
  
  updateProgressBar(0);
  
  console.log('[ScreenManager] ✅ Ready!');
}

// ============================================
// EXPOSE TO WINDOW
// ============================================

if (typeof window !== 'undefined') {
  window.screenManager = {
    showScreen,
    getCurrentScreen,
    updateLoadingStep,
    completeLoading,
    setStatus,
    showTranscript,
    hideTranscript,
    showReply,
    showCaption,
    hideCaption,
    addMessageBubble,
    clearMessages,
  };
}

export default {
  initScreenManager,
  showScreen,
  getCurrentScreen,
  updateLoadingStep,
  completeLoading,
  setStatus,
  showTranscript,
  hideTranscript,
  showReply,
  showCaption,
  hideCaption,
  addMessageBubble,
  clearMessages,
};