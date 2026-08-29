/**
 * Claude Web Injected Content Script
 */
import { ClaudeDOM } from '../claude/claude-dom.js';
import { Notifier } from '../notifications/notifier.js';
import { ExtensionMessage } from '../types/index.js';

const notifier = Notifier.getInstance();

function injectStreamWatcher(): void {
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/injections/stream-watcher.js');
    script.async = false;
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    console.warn('[ClaudeAutoReset] Stream watcher injection failed:', err);
  }
}

// Listen to stream events from main world
window.addEventListener('claude-reset:stream-end', () => {
  try {
    chrome.runtime.sendMessage({ action: 'trigger_check', triggerReason: 'completion_stream_end' } as ExtensionMessage);
  } catch {
    // ignore
  }
});

// Handle messages from background worker
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (!message || !message.action) return false;

  // 1. Proxy Fetch for Safari MV3 Cookie Support
  if (message.action === 'proxy_fetch') {
    (async () => {
      try {
        const response = await fetch(message.url, {
          credentials: 'include',
          cache: 'no-store',
        });
        const status = response.status;
        const body = await response.json().catch(() => null);
        sendResponse({ success: true, status, body });
      } catch (error) {
        sendResponse({ success: false, error: (error as Error).message });
      }
    })();
    return true; // async
  }

  // 2. DOM Send Workflow
  if (message.action === 'dom_interact') {
    (async () => {
      try {
        const result = await ClaudeDOM.executeSendWorkflow(
          message.message || 'Hi',
          message.model || 'haiku',
          Boolean(message.dryRun),
          document
        );
        sendResponse(result);
      } catch (err) {
        sendResponse({
          success: false,
          step: 'insert_text',
          error: (err as Error).message,
          message: 'DOM interaction thrown unexpected error',
          timestamp: Date.now(),
        });
      }
    })();
    return true;
  }

  // 3. Show In-Page Toast
  if (message.action === 'show_toast') {
    notifier.showInPageToast(message.title, message.body, message.level || 'info', document);
    sendResponse({ success: true });
    return true;
  }

  return false;
});

// Initialize on page load
injectStreamWatcher();
console.log('[ClaudeAutoReset] Content script loaded on', window.location.href);
