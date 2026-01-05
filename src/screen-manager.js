// ============================================
// screen-manager.js
// Handles 3-screen flow: Landing → Text Chat → Call
// Wires up all navigation buttons and loading progress
// ============================================

// Import required modules
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

// ============================================
// SCREEN VISIBILITY MANAGEMENT
// ============================================

/**
 * Show a specific screen and hide others
 * @param {string} screenName - 'landing', 'textChat', or 'call'
 */
export function showScreen(screenName) {
  console.log(`[ScreenManager] Switching to: ${screenName}`);
  
  // Hide all screens
  const allScreens = document.querySelectorAll('.screen');
  allScreens.forEach(screen => {
    screen.classList.remove('active');
  });
  
  // Show requested screen
  const targetScreen = document.getElementById(`${screenName}Screen`);
  if (targetScreen) {
    targetScreen.classList.add('active');
    currentScreen = screenName;
    
    // Handle screen-specific logic
    onScreenChange(screenName);
  } else {
    console.error(`[ScreenManager] Screen not found: ${screenName}Screen`);
  }
}

/**
 * Handle actions when screen changes
 */
function onScreenChange(screenName) {
  switch(screenName) {
    case 'landing':
      // Nothing needed - just show loading
      break;
      
    case 'textChat':
      // Focus on text input
      setTimeout(() => {
        const input = document.getElementById('textChatInput');
        if (input) input.focus();
      }, 400);
      
      // Stop any voice input
      stopListening();
      setSpeaking(false);
      break;
      
    case 'call':
      // Clear text input focus
      const input = document.getElementById('textChatInput');
      if (input) input.blur();
      break;
  }
}

/**
 * Get current screen
 */
export function getCurrentScreen() {
  return currentScreen;
}

// ============================================
// LOADING PROGRESS TRACKING
// ============================================

/**
 * Update a specific loading step
 * @param {string} step - Key from loadingSteps
 * @param {boolean} complete - Whether step is complete
 */
export function updateLoadingStep(step, complete = true) {
  if (loadingSteps.hasOwnProperty(step)) {
    loadingSteps[step] = complete;
    console.log(`[ScreenManager] Loading: ${step} = ${complete}`);
    calculateProgress();
  }
}

/**
 * Calculate total loading progress
 */
function calculateProgress() {
  const steps = Object.values(loadingSteps);
  const completed = steps.filter(v => v === true).length;
  const total = steps.length;
  
  loadingProgress = Math.round((completed / total) * 100);
  
  console.log(`[ScreenManager] Progress: ${loadingProgress}% (${completed}/${total})`);
  
  // Update UI
  updateProgressBar(loadingProgress);
  
  // Check if complete
  if (loadingProgress >= 100 && !isLoadingComplete) {
    onLoadingComplete();
  }
}

/**
 * Update progress bar in UI
 */
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

/**
 * Called when all loading is complete
 */
function onLoadingComplete() {
  console.log('[ScreenManager] ✅ Loading complete!');
  isLoadingComplete = true;
  
  // Show "Enter" button
  const enterBtn = document.getElementById('enterBtn');
  if (enterBtn) {
    enterBtn.style.display = 'block';
  }
}

/**
 * Manually set loading complete (for testing)
 */
export function completeLoading() {
  Object.keys(loadingSteps).forEach(key => {
    loadingSteps[key] = true;
  });
  calculateProgress();
}

// ============================================
// DISPLAY HELPER FUNCTIONS
// ============================================

/**
 * Update status message (works in both text chat and call screens)
 */
export function setStatus(text) {
  // Text chat screen status (in header)
  const statusInline = document.getElementById('status');
  if (statusInline) {
    statusInline.textContent = text;
  }
  
  // Call screen status (floating)
  const statusCall = document.getElementById('callStatus');
  if (statusCall) {
    statusCall.textContent = text;
    
    // Show it briefly
    statusCall.classList.add('active');
    setTimeout(() => {
      statusCall.classList.remove('active');
    }, 2000);
  }
}

/**
 * Show transcript (user's speech-to-text)
 */
export function showTranscript(text) {
  const transcript = document.getElementById('transcript');
  if (transcript) {
    transcript.style.display = 'block';
    transcript.textContent = text;
  }
}

/**
 * Hide transcript
 */
export function hideTranscript() {
  const transcript = document.getElementById('transcript');
  if (transcript) {
    transcript.style.display = 'none';
  }
}

/**
 * Show reply in text chat mode
 */
export function showReply(text) {
  const reply = document.getElementById('reply');
  if (reply) {
    reply.textContent = text;
  }
}

/**
 * Show caption (voice mode - bottom center)
 */
export function showCaption(text) {
  const caption = document.getElementById('chatCaption');
  if (caption) {
    caption.textContent = text;
    caption.classList.add('active');
  }
}

/**
 * Hide caption
 */
export function hideCaption() {
  const caption = document.getElementById('chatCaption');
  if (caption) {
    caption.classList.remove('active');
  }
}

// ============================================
// MESSAGE BUBBLE RENDERING (TEXT CHAT)
// ============================================

/**
 * Add a message bubble to text chat screen
 * @param {string} sender - 'user' or 'assistant'
 * @param {string} text - Message content
 */
export function addMessageBubble(sender, text) {
  const container = document.getElementById('textChatMessages');
  if (!container) {
    console.error('[ScreenManager] textChatMessages container not found!');
    return;
  }
  
  // Create bubble
  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${sender}`;
  bubble.textContent = text;
  
  // Add to container
  container.appendChild(bubble);
  
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
  
  console.log(`[ScreenManager] Added ${sender} bubble: "${text.substring(0, 30)}..."`);
}

/**
 * Clear all messages from text chat
 */
export function clearMessages() {
  const container = document.getElementById('textChatMessages');
  if (container) {
    container.innerHTML = '';
  }
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
  
  // Send button
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      sendTextMessage();
    });
  }
  
  // Enter key to send
  if (textInput) {
    textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
      }
    });
  }
  
  // Call button (phone icon)
  if (callBtn) {
    callBtn.addEventListener('click', () => {
      console.log('[ScreenManager] Call button clicked');
      showScreen('call');
    });
  }
  
  // Menu button
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      openSettings();
    });
  }
}

/**
 * Send text message from text chat screen
 */
function sendTextMessage() {
  const input = document.getElementById('textChatInput');
  if (!input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  console.log('[ScreenManager] Sending text:', text);
  
  // Add user message bubble
  addMessageBubble('user', text);
  
  // Clear input
  input.value = '';
  
  // Send to app.js handler
  if (window.handleUserMessage) {
    window.handleUserMessage(text);
  } else {
    console.error('[ScreenManager] handleUserMessage not found!');
  }
}

// ============================================
// EVENT HANDLERS - CALL SCREEN
// ============================================

function initCallScreen() {
  const backBtn = document.getElementById('backToTextBtn');
  const micBtn = document.getElementById('micBtn');
  const callInput = document.getElementById('callChatInput');
  const callSendBtn = document.getElementById('callSendBtn');
  const callMicBtn = document.getElementById('callMicBtn');
  
  // Back button
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      console.log('[ScreenManager] Back button clicked');
      stopListening();
      showScreen('textChat');
    });
  }
  
  // Main mic button (bottom-left)
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      toggleMainMic();
    });
  }
  
  // Panel mic button
  if (callMicBtn) {
    callMicBtn.addEventListener('click', () => {
      toggleMainMic();
    });
  }
  
  // Panel send button
  if (callSendBtn) {
    callSendBtn.addEventListener('click', () => {
      sendCallMessage();
    });
  }
  
  // Panel input enter key
  if (callInput) {
    callInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendCallMessage();
      }
    });
  }
}

/**
 * Toggle main microphone (bottom-left button)
 */
let isMicActive = false;

function toggleMainMic() {
  isMicActive = !isMicActive;
  
  const micBtn = document.getElementById('micBtn');
  const callMicBtn = document.getElementById('callMicBtn');
  
  if (isMicActive) {
    console.log('[ScreenManager] 🎤 Mic ON');
    
    // Visual feedback
    if (micBtn) micBtn.classList.add('active');
    if (callMicBtn) callMicBtn.classList.add('active');
    
    // Start listening
    startListening((text, isFinal) => {
      if (isFinal) {
        console.log('[ScreenManager] Voice input:', text);
        handleVoiceInput(text);
      } else {
        // Show interim transcript
        showTranscript(text);
      }
    }, { continuous: true });
    
  } else {
    console.log('[ScreenManager] 🎤 Mic OFF');
    
    // Visual feedback
    if (micBtn) micBtn.classList.remove('active');
    if (callMicBtn) callMicBtn.classList.remove('active');
    
    // Stop listening
    stopListening();
    hideTranscript();
  }
}

/**
 * Handle voice input from call screen
 */
function handleVoiceInput(text) {
  if (!text || !text.trim()) return;
  
  console.log('[ScreenManager] Processing voice:', text);
  
  // Hide transcript
  hideTranscript();
  
  // Send to app.js handler
  if (window.handleUserMessage) {
    window.handleUserMessage(text);
  }
}

/**
 * Send message from call panel input
 */
function sendCallMessage() {
  const input = document.getElementById('callChatInput');
  if (!input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  console.log('[ScreenManager] Sending from call panel:', text);
  
  // Clear input
  input.value = '';
  
  // Send to app.js handler
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
  
  // Set initial screen
  showScreen('landing');
  
  // Initialize all screen handlers
  initLandingScreen();
  initTextChatScreen();
  initCallScreen();
  
  // Start at 0% progress
  updateProgressBar(0);
  
  console.log('[ScreenManager] ✅ Ready!');
}

// ============================================
// EXPOSE TO WINDOW FOR EXTERNAL ACCESS
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

// ============================================
// EXPORT ALL PUBLIC FUNCTIONS
// ============================================

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