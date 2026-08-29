import { describe, it, expect, beforeEach } from 'vitest';
import { StateManager, MemoryStorageAdapter } from '../src/state/state-manager.js';

describe('StateManager', () => {
  let memoryStorage: MemoryStorageAdapter;
  let stateManager: StateManager;

  beforeEach(async () => {
    memoryStorage = new MemoryStorageAdapter();
    stateManager = new StateManager(memoryStorage);
    await stateManager.init();
  });

  it('initializes with default config and state', () => {
    const config = stateManager.getConfig();
    expect(config.enabled).toBe(true);
    expect(config.message).toBe('Hi');
    expect(config.checkIntervalSec).toBe(60);

    const state = stateManager.getState();
    expect(state.state).toBe('WAITING');
    expect(state.lastConfirmedReset).toBeNull();
    expect(state.isSending).toBe(false);
  });

  it('updates configuration and notifies subscribers', async () => {
    let notifiedConfig: any = null;
    stateManager.onConfigChange((cfg) => {
      notifiedConfig = cfg;
    });

    await stateManager.updateConfig({ message: 'Hello from automation', dryRun: true });

    expect(stateManager.getConfig().message).toBe('Hello from automation');
    expect(stateManager.getConfig().dryRun).toBe(true);
    expect(notifiedConfig?.message).toBe('Hello from automation');
  });

  it('handles atomic send lock acquisition and release', async () => {
    const firstLock = await stateManager.acquireSendLock();
    expect(firstLock).toBe(true);
    expect(stateManager.getState().isSending).toBe(true);

    // Second lock attempt must fail
    const secondLock = await stateManager.acquireSendLock();
    expect(secondLock).toBe(false);

    await stateManager.releaseSendLock();
    expect(stateManager.getState().isSending).toBe(false);

    // Now acquisition succeeds again
    const thirdLock = await stateManager.acquireSendLock();
    expect(thirdLock).toBe(true);
  });

  it('prevents duplicate processing of the same reset timestamp', async () => {
    const resetTime = '2026-08-30T04:00:00.000Z';
    expect(stateManager.isResetAlreadyProcessed(resetTime)).toBe(false);

    await stateManager.recordSendSuccess(resetTime, 'Hi', false, 95);

    expect(stateManager.isResetAlreadyProcessed(resetTime)).toBe(true);
    expect(stateManager.getState().lastConfirmedReset).toBe(resetTime);
    expect(stateManager.getState().history).toHaveLength(1);
  });

  it('survives state re-initialization and clears dangling locks on reboot', async () => {
    const resetTime = '2026-08-30T04:00:00.000Z';
    await stateManager.recordSendSuccess(resetTime, 'Hi', false, 95);
    await stateManager.acquireSendLock(); // Simulate crash while locked

    // Simulate browser restart / new instance
    const freshManager = new StateManager(memoryStorage);
    await freshManager.init();

    expect(freshManager.getState().lastConfirmedReset).toBe(resetTime);
    expect(freshManager.getState().isSending).toBe(false); // cleared on boot
    expect(freshManager.isResetAlreadyProcessed(resetTime)).toBe(true);
  });
});
