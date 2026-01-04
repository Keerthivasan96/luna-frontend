// ============================================
// interface-manager.js
// Handles Preview ↔ Conversation interface switching
// Integrates with existing app.js functionality
// ============================================

let currentInterface = 'preview'; // 'preview' or 'conversation'
let replyPreference = 'voice'; // 'text', 'voice', or 'both'
let isExploring = false;
let isVoiceActive = false;

// ============================================
// INITIALIZE ALL UI HANDLERS
// ============================================
export function initInterfaceManager() {
  console.log('[Interface] Initializing...');
  
  // Preview interface handlers
  initPreviewHandlers();
  
  // Conversation interface handlers
  initConversationHandlers();
  
  // Settings menu handlers
  initSettingsHandlers();
  
  console.log('[Interface] ✅ Ready');
}

// ============================================
// PREVIEW INTERFACE HANDLERS
// ============================================
function initPreviewHandlers() {
  const startBtn = document.getElementById('startConversationBtn');
  const exploreBtn = document.getElementById('exploreBtn');
  
  if (startBtn) {
    startBtn.addEventListener('click', () => {
      switchToConversation();
    });
  }
  
  if (exploreBtn) {
    exploreBtn.addEventListener('click', () => {
      toggleExplore();
    });
  }
}

// ============================================
// CONVERSATION INTERFACE HANDLERS
// ============================================
function initConversationHandlers() {
  const exitBtn = document.getElementById('exitConversationBtn');
  const sendBtn = document.getElementById('sendBtn');
  const micBtn = document.getElementById('micBtn');
  const chatInput = document.getElementById('chatInput');
  
  // Exit back to preview
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      switchToPreview();
    });
  }
  
  // Send text message
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      sendTextMessage();
    });
  }
  
  // Enter key to send
  if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTextMessage();
      }
    });
  }
  
  // Mic toggle
  if (micBtn) {
    micBtn.addEventListener('click', () => {
      toggleVoiceInput();
    });
  }
}

// ============================================
// SETTINGS HANDLERS
// ============================================
function initSettingsHandlers() {
  // Reply preference buttons
  const replyPrefBtns = document.querySelectorAll('.reply-pref-btn');
  replyPrefBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      replyPrefBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      replyPreference = btn.dataset.pref;
      console.log('[Interface] Reply preference:', replyPreference);
    });
  });
}

// ============================================
// INTERFACE SWITCHING
// ============================================
export function switchToConversation() {
  console.log('[Interface] Switching to Conversation');
  
  const previewInterface = document.getElementById('previewInterface');
  const conversationInterface = document.getElementById('conversationInterface');
  
  // Hide preview
  if (previewInterface) {
    previewInterface.style.opacity = '0';
    previewInterface.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      previewInterface.style.display = 'none';
    }, 300);
  }
  
  // Show conversation
  if (conversationInterface) {
    conversationInterface.style.display = 'flex';
    setTimeout(() => {
      conversationInterface.style.opacity = '1';
    }, 50);
  }
  
  currentInterface = 'conversation';
  
  // Disable explore if active
  if (isExploring) {
    toggleExplore();
  }
  
  // Focus input
  setTimeout(() => {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) chatInput.focus();
  }, 400);
}

export function switchToPreview() {
  console.log('[Interface] Switching to Preview');
  
  const previewInterface = document.getElementById('previewInterface');
  const conversationInterface = document.getElementById('conversationInterface');
  
  // Hide conversation
  if (conversationInterface) {
    conversationInterface.style.opacity = '0';
    conversationInterface.style.transition = 'opacity 0.3s ease';
    setTimeout(() => {
      conversationInterface.style.display = 'none';
    }, 300);
  }
  
  // Show preview
  if (previewInterface) {
    previewInterface.style.display = 'flex';
    setTimeout(() => {
      previewInterface.style.opacity = '1';
    }, 50);
  }
  
  currentInterface = 'preview';
  
  // Stop voice if active
  if (isVoiceActive) {
    toggleVoiceInput();
  }
}

// ============================================
// EXPLORE MODE (Zoom out in preview)
// ============================================
function toggleExplore() {
  isExploring = !isExploring;
  const exploreBtn = document.getElementById('exploreBtn');
  
  if (isExploring) {
    exploreBtn?.classList.add('active');
    zoomCamera(3.2); // Zoom out
    console.log('[Interface] Explore mode ON');
  } else {
    exploreBtn?.classList.remove('active');
    zoomCamera(2.0); // Zoom back
    console.log('[Interface] Explore mode OFF');
  }
}

function zoomCamera(targetDistance) {
  // Get controls from 3D module
  const controls = window.avatarModule?.getControls?.();
  if (!controls) return;
  
  const camera = controls.object;
  const startDistance = camera.position.distanceTo(controls.target);
  const duration = 800;
  const startTime = Date.now();
  
  function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    
    const currentDistance = startDistance + (targetDistance - startDistance) * eased;
    
    // Update camera position
    const direction = camera.position.clone().sub(controls.target).normalize();
    camera.position.copy(controls.target).add(direction.multiplyScalar(currentDistance));
    
    controls.update();
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  }
  
  animate();
}

// ============================================
// TEXT MESSAGE HANDLING
// ============================================
function sendTextMessage() {
  const chatInput = document.getElementById('chatInput');
  const text = chatInput?.value.trim();
  
  if (!text) return;
  
  console.log('[Interface] User (text):', text);
  
  // Add to chat UI
  addMessageToUI('user', text);
  
  // Clear input
  chatInput.value = '';
  
  // Send to conversation handler (from app.js)
  if (window.handleUserMessage) {
    window.handleUserMessage(text);
  }
}

// ============================================
// VOICE INPUT HANDLING
// ============================================
function toggleVoiceInput() {
  isVoiceActive = !isVoiceActive;
  const micBtn = document.getElementById('micBtn');
  
  if (isVoiceActive) {
    micBtn?.classList.add('active');
    startVoiceListening();
    console.log('[Interface] Voice input ON');
  } else {
    micBtn?.classList.remove('active');
    stopVoiceListening();
    console.log('[Interface] Voice input OFF');
  }
}

function startVoiceListening() {
  // Use existing speech module
  if (window.startListening) {
    window.startListening((text, isFinal) => {
      if (isFinal) {
        console.log('[Interface] User (voice):', text);
        
        // Add to chat UI
        addMessageToUI('user', text);
        
        // Send to conversation handler
        if (window.handleUserMessage) {
          window.handleUserMessage(text);
        }
      }
    }, { continuous: true });
  }
}

function stopVoiceListening() {
  if (window.stopListening) {
    window.stopListening();
  }
}

// ============================================
// CHAT UI HELPERS
// ============================================
export function addMessageToUI(sender, text) {
  const container = document.getElementById('messagesContainer');
  if (!container) return;
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;
  messageDiv.textContent = text;
  
  container.appendChild(messageDiv);
  
  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

export function addAssistantMessage(text) {
  // Show based on reply preference
  if (replyPreference === 'text' || replyPreference === 'both') {
    addMessageToUI('assistant', text);
  }
  
  if (replyPreference === 'voice' || replyPreference === 'both') {
    // Speak using existing TTS
    if (window.speakText) {
      window.speakText(text);
    }
  }
}

// ============================================
// PUBLIC GETTERS
// ============================================
export function getCurrentInterface() {
  return currentInterface;
}

export function getReplyPreference() {
  return replyPreference;
}

export function isInConversation() {
  return currentInterface === 'conversation';
}

// ============================================
// EXPORT FOR GLOBAL ACCESS
// ============================================
if (typeof window !== 'undefined') {
  window.interfaceManager = {
    switchToConversation,
    switchToPreview,
    addMessageToUI,
    addAssistantMessage,
    getCurrentInterface,
    getReplyPreference,
    isInConversation,
  };
}

export default {
  initInterfaceManager,
  switchToConversation,
  switchToPreview,
  addMessageToUI,
  addAssistantMessage,
  getCurrentInterface,
  getReplyPreference,
  isInConversation,
};