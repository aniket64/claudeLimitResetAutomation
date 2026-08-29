import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutomationScheduler, DOMSender, UsageFetcher } from '../src/scheduler/scheduler.js';
import { StateManager, MemoryStorageAdapter } from '../src/state/state-manager.js';
import { Notifier } from '../src/notifications/notifier.js';
import { NormalizedUsageState } from '../src/types/index.js';

describe('AutomationScheduler', () => {
  let stateManager: StateManager;
  let notifier: Notifier;
  let scheduler: AutomationScheduler;

  beforeEach(async () => {
    stateManager = new StateManager(new MemoryStorageAdapter());
    await stateManager.init();
    notifier = Notifier.getInstance();
    scheduler = new AutomationScheduler(stateManager, notifier);
  });

  it('pauses automation when status is LOGIN_REQUIRED', async () => {
    const mockFetcher: UsageFetcher = {
      fetchUsage: async () => ({
        usagePercent: 0,
        resetTimestamp: null,
        secondsUntilReset: null,
        status: 'LOGIN_REQUIRED',
        lastUpdated: Date.now(),
        method: 'api',
        error: 'Please log in',
      }),
    };

    scheduler.setUsageFetcher(mockFetcher);
    await scheduler.checkAndExecute('test_run');

    expect(stateManager.getState().state).toBe('LOGIN_REQUIRED');
  });

  it('triggers send with target model when valid reset is detected and auto-send is enabled', async () => {
    let messageSent: string | null = null;
    let modelUsed: string | null = null;
    let dryRunFlag: boolean | null = null;
    const pastResetIso = new Date(Date.now() - 60000).toISOString();

    const mockSender: DOMSender = {
      sendMessage: async (msg, model, dryRun) => {
        messageSent = msg;
        modelUsed = model;
        dryRunFlag = dryRun;
        return { success: true, selectedModel: model };
      },
    };

    const mockFetcher: UsageFetcher = {
      fetchUsage: async () => ({
        usagePercent: 95,
        resetTimestamp: pastResetIso,
        secondsUntilReset: 0,
        status: 'RESET_DETECTED',
        lastUpdated: Date.now(),
        method: 'api',
      }),
    };

    scheduler.setUsageFetcher(mockFetcher);
    scheduler.setDOMSender(mockSender);

    await scheduler.checkAndExecute('reset_test');

    expect(messageSent).toBe('Hi');
    expect(modelUsed).toBe('haiku'); // Defaults to Haiku
    expect(dryRunFlag).toBe(false);
    expect(stateManager.getState().state).toBe('MESSAGE_SENT');
    expect(stateManager.getState().lastConfirmedReset).toBe(pastResetIso);
  });

  it('aborts send safely and sets MODEL_UNAVAILABLE if Haiku cannot be selected', async () => {
    const pastResetIso = new Date(Date.now() - 60000).toISOString();

    const mockSender: DOMSender = {
      sendMessage: async () => {
        return {
          success: false,
          step: 'select_model',
          error: 'HAIKU_NOT_AVAILABLE: Option not found in model menu',
        };
      },
    };

    const mockFetcher: UsageFetcher = {
      fetchUsage: async () => ({
        usagePercent: 95,
        resetTimestamp: pastResetIso,
        secondsUntilReset: 0,
        status: 'RESET_DETECTED',
        lastUpdated: Date.now(),
        method: 'api',
      }),
    };

    scheduler.setUsageFetcher(mockFetcher);
    scheduler.setDOMSender(mockSender);

    await scheduler.checkAndExecute('haiku_fail_test');

    expect(stateManager.getState().state).toBe('MODEL_UNAVAILABLE');
    expect(stateManager.getState().lastConfirmedReset).toBeNull(); // Reset not consumed so it can retry safely
  });

  it('respects dry-run mode and passes dryRun=true to DOM sender', async () => {
    await stateManager.updateConfig({ dryRun: true, message: 'Dry run test message' });
    const pastResetIso = new Date(Date.now() - 60000).toISOString();

    let sentDryRun = false;
    let modelUsed = '';
    const mockSender: DOMSender = {
      sendMessage: async (_msg, model, dryRun) => {
        sentDryRun = dryRun;
        modelUsed = model;
        return { success: true, selectedModel: model };
      },
    };

    const mockFetcher: UsageFetcher = {
      fetchUsage: async () => ({
        usagePercent: 100,
        resetTimestamp: pastResetIso,
        secondsUntilReset: 0,
        status: 'RESET_DETECTED',
        lastUpdated: Date.now(),
        method: 'api',
      }),
    };

    scheduler.setUsageFetcher(mockFetcher);
    scheduler.setDOMSender(mockSender);

    await scheduler.checkAndExecute('dry_run_test');

    expect(sentDryRun).toBe(true);
    expect(modelUsed).toBe('haiku');
    expect(stateManager.getState().state).toBe('MESSAGE_SENT');
    expect(stateManager.getState().history[0].dryRun).toBe(true);
  });

  it('skips message send on subsequent checks for the same reset window', async () => {
    let sendCount = 0;
    const pastResetIso = new Date(Date.now() - 60000).toISOString();

    const mockSender: DOMSender = {
      sendMessage: async () => {
        sendCount++;
        return { success: true };
      },
    };

    const mockFetcher: UsageFetcher = {
      fetchUsage: async () => ({
        usagePercent: 95,
        resetTimestamp: pastResetIso,
        secondsUntilReset: 0,
        status: 'RESET_DETECTED',
        lastUpdated: Date.now(),
        method: 'api',
      }),
    };

    scheduler.setUsageFetcher(mockFetcher);
    scheduler.setDOMSender(mockSender);

    // First check triggers send
    await scheduler.checkAndExecute('first');
    expect(sendCount).toBe(1);

    // Second check MUST skip send
    await scheduler.checkAndExecute('second');
    expect(sendCount).toBe(1);
    expect(stateManager.getState().state).toBe('WAITING');
  });
});
