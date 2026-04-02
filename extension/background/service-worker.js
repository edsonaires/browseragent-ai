// BrowserAgent AI - Service Worker (Background)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyBOjwPD1N9gdeKujC_i8HA_MstAybvw4tw",
  authDomain: "browseragent-ai.firebaseapp.com",
  projectId: "browseragent-ai",
  storageBucket: "browseragent-ai.firebasestorage.app",
  messagingSenderId: "636409912514",
  appId: "1:636409912514:web:8ed497aa6b381c99c26f5b",
  measurementId: "G-XMER88RZYQ"
};

let app, auth, db;
let currentUser = null;
let activeSessions = new Map();

// Initialize Firebase
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  console.log('[BrowserAgent] Firebase initialized');
} catch (e) {
  console.error('[BrowserAgent] Firebase init error:', e);
}

// Auth state listener
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (user) {
    console.log('[BrowserAgent] User signed in:', user.uid);
    // Update last seen
    updateDoc(doc(db, 'users', user.uid), {
      lastSeen: serverTimestamp()
    }).catch(() => {});
  }
});

// Open side panel on extension icon click
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(console.error);

// Message handler - central brain of the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Keep channel open for async response
});

async function handleMessage(message, sender, sendResponse) {
  const { type, payload } = message;

  switch (type) {
    case 'GET_AUTH_STATUS':
      sendResponse({ user: currentUser ? { uid: currentUser.uid, email: currentUser.email } : null });
      break;

    case 'CAPTURE_SCREENSHOT': {
      try {
        const tabId = sender.tab?.id || payload?.tabId;
        if (!tabId) { sendResponse({ error: 'No tab ID' }); break; }
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png', quality: 90 });
        sendResponse({ success: true, dataUrl });
      } catch (e) {
        sendResponse({ error: e.message });
      }
      break;
    }

    case 'EXECUTE_ACTION': {
      try {
        const { tabId, action } = payload;
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: executeActionInPage,
          args: [action]
        });
        sendResponse({ success: true, result: result.result });
      } catch (e) {
        sendResponse({ error: e.message });
      }
      break;
    }

    case 'GET_PAGE_CONTEXT': {
      try {
        const { tabId } = payload;
        const tab = await chrome.tabs.get(tabId);
        const [result] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => ({
            url: window.location.href,
            title: document.title,
            html: document.documentElement.outerHTML.substring(0, 50000)
          })
        });
        sendResponse({ success: true, context: { ...result.result, tab } });
      } catch (e) {
        sendResponse({ error: e.message });
      }
      break;
    }

    case 'START_SESSION': {
      try {
        if (!currentUser) { sendResponse({ error: 'Not authenticated' }); break; }
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const sessionData = {
          userId: currentUser.uid,
          url: payload.url,
          task: payload.task,
          status: 'active',
          steps: [],
          startedAt: serverTimestamp()
        };
        await setDoc(doc(db, 'sessions', sessionId), sessionData);
        activeSessions.set(sessionId, { ...sessionData, id: sessionId });
        sendResponse({ success: true, sessionId });
      } catch (e) {
        sendResponse({ error: e.message });
      }
      break;
    }

    case 'UPDATE_SESSION': {
      try {
        const { sessionId, step, status } = payload;
        const updates = {};
        if (step) updates[`steps`] = [...(activeSessions.get(sessionId)?.steps || []), step];
        if (status) updates.status = status;
        if (status === 'completed') updates.completedAt = serverTimestamp();
        await updateDoc(doc(db, 'sessions', sessionId), updates);
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ error: e.message });
      }
      break;
    }

    case 'GET_LLM_CONFIG': {
      const config = await chrome.storage.local.get('llmConfig');
      sendResponse({ config: config.llmConfig || null });
      break;
    }

    case 'SAVE_LLM_CONFIG': {
      await chrome.storage.local.set({ llmConfig: payload.config });
      sendResponse({ success: true });
      break;
    }

    default:
      sendResponse({ error: `Unknown message type: ${type}` });
  }
}

// This function runs in the page context
function executeActionInPage(action) {
  // Delegate to content script
  return window.__browserAgent?.execute(action) || { error: 'Agent not initialized' };
}

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'browseragent-analyze',
    title: 'Analisar com BrowserAgent AI',
    contexts: ['page', 'selection']
  });
  console.log('[BrowserAgent] Extension installed/updated');
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'browseragent-analyze') {
    chrome.sidePanel.open({ tabId: tab.id });
    chrome.runtime.sendMessage({
      type: 'CONTEXT_ANALYZE',
      payload: { selection: info.selectionText, url: tab.url }
    });
  }
});

console.log('[BrowserAgent] Service Worker started');
