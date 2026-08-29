/**
 * Safari Web Extension Background Service Worker
 */
import { stateManager } from '../state/state-manager.js';
import { logger } from '../logging/logger.js';
import { notifier } from '../notifications/notifier.js';
import { AutomationScheduler, DOMSender, UsageFetcher } from '../scheduler/scheduler.js';
import { CLAUDE_URLS } from '../config/defaults.js';
import { extractOrgIdFromBootstrap, orderOrgCandidates, parseUsageResponse } from '../usage/usage-parser.js';
import { NormalizedUsageState } from '../types/index.js';

const scheduler = new AutomationScheduler(stateManager, notifier);

// Implement Safari-compatible UsageFetcher using content script proxy
class ExtensionUsageFetcher implements UsageFetcher {
  async fetchUsage(): Promise<NormalizedUsageState> {
    const tabs = await chrome.tabs.query({ url: '*://claude.ai/*' });
    if (!tabs || tabs.length === 0) {
      return {
        usagePercent: 0,
        resetTimestamp: null,
        secondsUntilReset: null,
        status: 'CLAUDE_UNAVAILABLE',
        lastUpdated: Date.now(),
        method: 'unknown',
        error: 'No Claude.ai tab is currently open in Safari. Please open https://claude.ai.',
      };
    }

    const targetTab = tabs.find((t) => t.active) || tabs[0];
    if (!targetTab.id) {
      throw new Error('Valid Claude tab ID not found.');
    }

    // 1. Fetch bootstrap and org list via tab proxy
    const proxyCall = async (url: string) => {
      return new Promise<any>((resolve, reject) => {
        chrome.tabs.sendMessage(targetTab.id!, { action: 'proxy_fetch', url }, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!res?.success) {
            reject(new Error(res?.error || 'Proxy fetch failed'));
          } else {
            resolve(res);
          }
        });
      });
    };

    try {
      const orgsRes = await proxyCall(CLAUDE_URLS.API_ORGANIZATIONS);
      if (orgsRes.status === 401) {
        return {
          usagePercent: 0,
          resetTimestamp: null,
          secondsUntilReset: null,
          status: 'LOGIN_REQUIRED',
          lastUpdated: Date.now(),
          method: 'api',
          error: 'Claude login required.',
        };
      }

      let activeOrgId: string | null = null;
      try {
        const bootRes = await proxyCall(CLAUDE_URLS.API_BOOTSTRAP);
        if (bootRes.status === 200 && bootRes.body) {
          activeOrgId = extractOrgIdFromBootstrap(bootRes.body);
        }
      } catch {
        // ignore bootstrap error
      }

      const orgCandidates = orderOrgCandidates(orgsRes.body, activeOrgId);
      if (orgCandidates.length === 0) {
        throw new Error('No valid Claude organization found in account.');
      }

      let usageBody: any = null;
      for (const orgId of orgCandidates) {
        try {
          const uRes = await proxyCall(CLAUDE_URLS.API_USAGE(orgId));
          if (uRes.status === 200 && uRes.body) {
            usageBody = uRes.body;
            break;
          }
        } catch {
          // try next org
        }
      }

      if (!usageBody) {
        throw new Error('Could not retrieve usage limits from any organization.');
      }

      return parseUsageResponse(usageBody, Date.now());
    } catch (err) {
      logger.error('Failed to fetch usage via proxy:', err);
      return {
        usagePercent: 0,
        resetTimestamp: null,
        secondsUntilReset: null,
        status: 'CLAUDE_UNAVAILABLE',
        lastUpdated: Date.now(),
        method: 'unknown',
        error: (err as Error).message,
      };
    }
  }
}

// Implement DOMSender via tab message passing
class ExtensionDOMSender implements DOMSender {
  async sendMessage(
    message: string,
    model: string = 'haiku',
    dryRun: boolean
  ): Promise<{ success: boolean; error?: string; step?: string; selectedModel?: string }> {
    let tabs = await chrome.tabs.query({ url: '*://claude.ai/*' });
    let targetTab = tabs.find((t) => t.active) || tabs[0];

    if (!targetTab || !targetTab.id) {
      // Create new Claude tab if none open
      logger.info('No Claude tab found. Opening https://claude.ai/new...');
      targetTab = await chrome.tabs.create({ url: CLAUDE_URLS.NEW_CHAT, active: true });
      await new Promise((r) => setTimeout(r, 4000)); // wait for load
    } else {
      // Focus the tab
      await chrome.tabs.update(targetTab.id, { active: true });
      if (targetTab.windowId) {
        await chrome.windows.update(targetTab.windowId, { focused: true }).catch(() => {});
      }
    }

    if (!targetTab.id) {
      return { success: false, error: 'Could not open or focus Claude tab.' };
    }

    return new Promise((resolve) => {
      chrome.tabs.sendMessage(
        targetTab.id!,
        { action: 'dom_interact', message, model, dryRun },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else if (!response) {
            resolve({ success: false, error: 'Empty response from Claude content script.' });
          } else {
            resolve(response);
          }
        }
      );
    });
  }
}

async function setupAlarms(): Promise<void> {
  const config = stateManager.getConfig();
  const periodInMinutes = Math.max(1, Math.round(config.checkIntervalSec / 60));
  await chrome.alarms.clear('claude-reset-alarm');
  chrome.alarms.create('claude-reset-alarm', { periodInMinutes });
  logger.debug(`Alarm setup: period=${periodInMinutes} min`);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'claude-reset-alarm') {
    scheduler.checkAndExecute('alarm_tick');
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  await stateManager.init();
  await setupAlarms();
  scheduler.setUsageFetcher(new ExtensionUsageFetcher());
  scheduler.setDOMSender(new ExtensionDOMSender());
  scheduler.start();
  logger.info('Claude Reset Automation Extension installed.');
});

chrome.runtime.onStartup.addListener(async () => {
  await stateManager.init();
  await setupAlarms();
  scheduler.setUsageFetcher(new ExtensionUsageFetcher());
  scheduler.setDOMSender(new ExtensionDOMSender());
  scheduler.start();
  scheduler.handleSystemWake();
  logger.info('Claude Reset Automation Extension started on browser launch.');
});

// Handle Popup & UI Messages
chrome.runtime.onMessage.addListener((message: any, _sender, sendResponse) => {
  if (!message || !message.action) return false;

  (async () => {
    try {
      switch (message.action) {
        case 'get_status':
          sendResponse({
            success: true,
            config: stateManager.getConfig(),
            state: stateManager.getState(),
            usage: stateManager.getUsage(),
            logs: logger.getEntries(),
          });
          break;

        case 'get_logs':
          sendResponse({ success: true, logs: logger.getEntries() });
          break;

        case 'update_config':
          const updated = await stateManager.updateConfig(message.config || {});
          await setupAlarms();
          sendResponse({ success: true, config: updated });
          break;

        case 'trigger_check':
          await scheduler.checkAndExecute(message.triggerReason || 'user_trigger');
          sendResponse({
            success: true,
            state: stateManager.getState(),
            usage: stateManager.getUsage(),
          });
          break;

        case 'run_test_now':
          const mode = message.mode || 'dry_run';
          const cfg = stateManager.getConfig();
          const domSender = new ExtensionDOMSender();
          const targetModel = cfg.model || 'haiku';
          logger.info(`Manual test initiated: mode=${mode}, model=${targetModel}`);

          const result = await domSender.sendMessage(cfg.message, targetModel, mode === 'dry_run');
          sendResponse({ success: result.success, result });
          break;

        case 'reset_state':
          await stateManager.resetState();
          sendResponse({ success: true, state: stateManager.getState() });
          break;

        case 'clear_logs':
          logger.clear();
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: `Unknown action: ${message.action}` });
      }
    } catch (err) {
      sendResponse({ success: false, error: (err as Error).message });
    }
  })();

  return true; // async
});

// Initialize
stateManager.init().then(() => {
  scheduler.setUsageFetcher(new ExtensionUsageFetcher());
  scheduler.setDOMSender(new ExtensionDOMSender());
  scheduler.start();
  setupAlarms();
});
