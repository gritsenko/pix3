import './styles/main.css';
import { Game } from './core/Game';
import { useGameStore } from './core/GameStore';

// Early console capture — runs before any game systems are created.
// Intercepts console.error and global errors so they are visible on iOS Safari
// even if the game fails to initialise.
interface EarlyConsoleMessage {
  type: string;
  message: string;
  timestamp: Date;
}

declare global {
  interface Window {
    __earlyConsoleBuffer: EarlyConsoleMessage[];
  }
}

window.__earlyConsoleBuffer = [];

function setupEarlyErrorCapture(): void {
  const overlay = document.getElementById('console-overlay');
  const content = document.getElementById('console-content');

  function showOverlay(): void {
    if (overlay) overlay.classList.remove('hidden');
  }

  function appendToOverlay(type: string, message: string): void {
    if (!content) return;
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `console-line console-${type}`;
    div.innerHTML = `<span class="console-time">[${time}]</span> ${message}`;
    content.appendChild(div);
    content.scrollTop = content.scrollHeight;
  }

  function storeEarly(type: string, message: string): void {
    window.__earlyConsoleBuffer.push({ type, message, timestamp: new Date() });
    appendToOverlay(type, message);
    if (type === 'error') showOverlay();
  }

  // Chain console.error so errors are captured before DebugController takes over
  const origError = console.error.bind(console);
  console.error = (...args: any[]) => {
    origError(...args);
    const msg = args
      .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ');
    storeEarly('error', msg);
  };

  // Also capture unhandled JS errors and promise rejections
  window.addEventListener('error', (event) => {
    const msg = event.message + (event.filename ? ` (${event.filename}:${event.lineno})` : '');
    storeEarly('error', msg);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg =
      reason instanceof Error
        ? `Unhandled promise rejection: ${reason.message}`
        : `Unhandled promise rejection: ${String(reason)}`;
    storeEarly('error', msg);
  });
}

// Main entry point
async function main() {
  console.log('🎮 Deep Core - Starting...');
  
  try {
    // Check for debug query parameter
    const params = new URLSearchParams(window.location.search);
    if (params.has('debug') && params.get('debug') === 'true') {
      const state = useGameStore.getState();
      state.toggleDebugMode();
      // Only enable debug visuals if explicitly requested via URL (e.g. ?debug=true&visuals=true)
      if (params.get('visuals') === 'true' || params.get('debugVisuals') === 'true') {
        state.toggleDebugVisuals();
      }
      console.log('🐛 Debug mode enabled via URL parameter');
    }

    const game = new Game();
    await game.init();
    
    console.log('✅ Game initialized successfully!');
    
    // Make game accessible for debugging
    (window as any).game = game;
    
  } catch (error) {
    console.error('❌ Failed to initialize game:', error);
    
    // Show error to user
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');
    
    if (loading && loadingText) {
      loadingText.textContent = 'Failed to load game. Please refresh.';
      loadingText.style.color = '#ff6b6b';
    }
  }
}

// Wait for DOM, then set up early error capture first before starting the game
function bootstrap() {
  setupEarlyErrorCapture();
  main();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}

// Debug Toggle Button functionality
function setupDebugToggle() {
  const debugToggleBtn = document.getElementById('debug-toggle-btn');
  
  if (!debugToggleBtn) {
    console.warn('Debug toggle button not found');
    return;
  }
  
  // Update button state based on current debug mode
  function updateButtonState() {
    const params = new URLSearchParams(window.location.search);
    const isDebugMode = params.has('debug') && params.get('debug') === 'true';
    
    if (isDebugMode) {
      debugToggleBtn?.classList.add('active');
    } else {
      debugToggleBtn?.classList.remove('active');
    }
  }
  
  // Toggle debug mode on button click with real navigation
  debugToggleBtn.addEventListener('click', () => {
    const params = new URLSearchParams(window.location.search);
    
    if (params.has('debug') && params.get('debug') === 'true') {
      // Remove debug parameter and navigate to base URL
      params.delete('debug');
      params.delete('visuals');
      params.delete('debugVisuals');
      
      const baseUrl = window.location.pathname;
      const newUrl = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
      
      console.log('🐛 Debug mode disabled, navigating to:', newUrl);
      window.location.href = newUrl;
    } else {
      // Add debug parameter and navigate
      params.set('debug', 'true');
      
      const newUrl = `${window.location.pathname}?${params.toString()}`;
      
      console.log('🐛 Debug mode enabled, navigating to:', newUrl);
      window.location.href = newUrl;
    }
  });
  
  // Initial state update
  updateButtonState();
}

// Setup debug toggle after a short delay to ensure DOM is ready
setTimeout(setupDebugToggle, 100);
