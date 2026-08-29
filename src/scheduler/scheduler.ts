/**
 * Automation Scheduler and Orchestrator
 */
import { StateManager } from '../state/state-manager.js';
import { ResetDetector } from '../reset/reset-detector.js';
import { Notifier } from '../notifications/notifier.js';
import { logger } from '../logging/logger.js';
import { NormalizedUsageState } from '../types/index.js';
import { TIMING } from '../config/defaults.js';

export interface UsageFetcher {
  fetchUsage(): Promise<NormalizedUsageState>;
}

export interface DOMSender {
  sendMessage(
    message: string,
    model: string,
    dryRun: boolean
  ): Promise<{ success: boolean; error?: string; step?: string; selectedModel?: string }>;
}

export class AutomationScheduler {
  private stateManager: StateManager;
  private notifier: Notifier;
  private usageFetcher: UsageFetcher | null = null;
  private domSender: DOMSender | null = null;
  private timerId: ReturnType<typeof setTimeout> | null = null;
  private isRunning = false;
  private isChecking = false;
  private lastCheckTimestamp = 0;

  constructor(stateManager: StateManager, notifier: Notifier) {
    this.stateManager = stateManager;
    this.notifier = notifier;
  }

  public setUsageFetcher(fetcher: UsageFetcher): void {
    this.usageFetcher = fetcher;
  }

  public setDOMSender(sender: DOMSender): void {
    this.domSender = sender;
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('AutomationScheduler started.');
    this.scheduleNextCheck(0); // immediate first tick
  }

  public stop(): void {
    this.isRunning = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    logger.info('AutomationScheduler stopped.');
  }

  public scheduleNextCheck(delayMs: number): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (!this.isRunning) return;

    this.timerId = setTimeout(() => {
      this.checkAndExecute('scheduled_timer').catch((err) => {
        logger.error('Error during scheduled check:', err);
      });
    }, Math.max(0, delayMs));
  }

  /**
   * Main check execution cycle
   */
  public async checkAndExecute(triggerReason = 'manual'): Promise<void> {
    if (this.isChecking) {
      logger.debug('Check already in progress. Skipping duplicate invocation.');
      return;
    }
    this.isChecking = true;
    this.lastCheckTimestamp = Date.now();

    try {
      const config = this.stateManager.getConfig();
      if (!config.enabled) {
        await this.stateManager.setStatus('DISABLED', 'Automation is currently disabled in settings.');
        logger.debug('Automation is disabled. Skipping check.');
        return;
      }

      if (!this.usageFetcher) {
        logger.warn('No UsageFetcher registered with scheduler.');
        return;
      }

      logger.debug(`Executing usage check [trigger=${triggerReason}]...`);
      const prevUsage = this.stateManager.getUsage();
      const currentUsage = await this.usageFetcher.fetchUsage();
      await this.stateManager.setUsage(currentUsage);

      // Handle Authentication / Availability Errors
      if (currentUsage.status === 'LOGIN_REQUIRED') {
        await this.stateManager.setStatus('LOGIN_REQUIRED', 'Claude login required. Automation paused.');
        return;
      }

      if (currentUsage.status === 'CLAUDE_UNAVAILABLE') {
        await this.stateManager.setStatus('CLAUDE_UNAVAILABLE', currentUsage.error || 'Claude Web is unavailable.');
        return;
      }

      // Evaluate Reset Signals
      const state = this.stateManager.getState();
      const evaluation = ResetDetector.evaluate(currentUsage, prevUsage, state.lastConfirmedReset);

      if (evaluation.isResetConfirmed) {
        logger.info(`🚨 Reset Confirmed! Reason: ${evaluation.reason}`);
        await this.handleConfirmedReset(evaluation.resetTimestamp || new Date().toISOString(), evaluation.usagePercent);
      } else if (evaluation.isDuplicate) {
        logger.debug(`Reset window already processed: ${evaluation.reason}`);
        await this.stateManager.setStatus('WAITING', `Waiting for next reset window (Current window already processed).`);
      } else {
        const nextTimeStr = currentUsage.secondsUntilReset
          ? `${Math.floor(currentUsage.secondsUntilReset / 60)}m ${currentUsage.secondsUntilReset % 60}s`
          : 'unknown';
        await this.stateManager.setStatus('WAITING', `Usage: ${currentUsage.usagePercent}%. Next reset in ${nextTimeStr}.`);
      }

      // Schedule next check
      this.recalculateNextSchedule(currentUsage);
    } catch (error) {
      logger.error('Check execution encountered an error:', error);
      await this.stateManager.setStatus('ERROR', `Check error: ${(error as Error).message}`);
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Executes the post-reset actions (lock acquisition, model selection, message send, state update)
   */
  private async handleConfirmedReset(resetTimestamp: string, usagePercent: number): Promise<void> {
    const config = this.stateManager.getConfig();
    const targetModel = config.model || 'haiku';

    // Check duplicate
    if (this.stateManager.isResetAlreadyProcessed(resetTimestamp)) {
      logger.info(`Reset ${resetTimestamp} already processed in history. Skipping send.`);
      return;
    }

    // Acquire atomic send lock
    const lockAcquired = await this.stateManager.acquireSendLock();
    if (!lockAcquired) {
      logger.warn('Could not acquire send lock. Another process is sending.');
      return;
    }

    try {
      await this.stateManager.setStatus('RESETTING', `Confirmed reset at ${resetTimestamp}. Stabilizing...`);
      await this.notifier.notifyDesktop(
        'Claude Reset Confirmed',
        `5-hour usage limit has reset. Usage: ${usagePercent}%.`,
        config
      );

      // Stabilization delay
      await new Promise((resolve) => setTimeout(resolve, TIMING.POST_RESET_STABILIZE_DELAY_MS));

      if (!config.autoSendAfterReset) {
        logger.info('autoSendAfterReset is disabled in settings. Skipping message dispatch.');
        await this.stateManager.recordSendSuccess(resetTimestamp, '(Auto-send disabled)', false, usagePercent);
        return;
      }

      if (!this.domSender) {
        throw new Error('No DOMSender registered to perform message sending.');
      }

      await this.stateManager.setStatus(
        'MESSAGE_SENDING',
        `Selecting ${targetModel} and sending: "${config.message}" (dryRun=${config.dryRun})`
      );
      logger.info(`Sending message to Claude Web (model=${targetModel}): "${config.message}" (dryRun=${config.dryRun})`);

      const result = await this.domSender.sendMessage(config.message, targetModel, config.dryRun);

      if (result.success) {
        await this.stateManager.recordSendSuccess(resetTimestamp, config.message, config.dryRun, usagePercent);
        await this.notifier.notifyDesktop(
          config.dryRun ? 'Claude Reset [DRY-RUN]' : 'Claude Message Sent',
          config.dryRun
            ? `[DRY-RUN] Verified ${targetModel} & message "${config.message}" in input.`
            : `Successfully sent with ${targetModel}: "${config.message}"`,
          config
        );
      } else {
        const errorMsg = result.error || 'Failed to submit message to Claude.';
        logger.error(`Send failure: ${errorMsg}`);
        if (result.step === 'select_model' || errorMsg.includes('HAIKU') || errorMsg.includes('MODEL')) {
          await this.stateManager.setStatus('MODEL_UNAVAILABLE', `Haiku model unavailable: ${errorMsg}`);
          await this.notifier.notifyDesktop('Claude Model Selection Failed', `Could not select Haiku: ${errorMsg}`, config);
        } else {
          await this.stateManager.recordSendFailure(resetTimestamp, config.message, config.dryRun, errorMsg, usagePercent);
        }
      }
    } catch (err) {
      const errorMsg = (err as Error).message;
      logger.error('Unexpected error handling reset:', err);
      await this.stateManager.recordSendFailure(resetTimestamp, config.message, config.dryRun, errorMsg, usagePercent);
    } finally {
      await this.stateManager.releaseSendLock();
    }
  }

  /**
   * Intelligently calculates optimal next polling interval
   */
  private recalculateNextSchedule(usage: NormalizedUsageState): void {
    const config = this.stateManager.getConfig();
    let nextDelaySec = config.checkIntervalSec;

    if (usage.secondsUntilReset !== null && usage.secondsUntilReset > 0) {
      if (usage.secondsUntilReset > 300) {
        // More than 5 minutes until reset: poll at configured interval
        nextDelaySec = Math.min(config.checkIntervalSec, usage.secondsUntilReset - 60);
      } else if (usage.secondsUntilReset > 30) {
        // Within 5 minutes: poll every 30 seconds
        nextDelaySec = Math.min(30, usage.secondsUntilReset);
      } else {
        // Within 30 seconds: poll every 5 seconds for precise detection
        nextDelaySec = Math.max(5, usage.secondsUntilReset + 2);
      }
    }

    // Clamp between min and max bounds
    nextDelaySec = Math.max(TIMING.MIN_CHECK_INTERVAL_SEC, Math.min(TIMING.MAX_CHECK_INTERVAL_SEC, nextDelaySec));
    logger.debug(`Next check scheduled in ${nextDelaySec} seconds.`);
    this.scheduleNextCheck(nextDelaySec * 1000);
  }

  /**
   * System Wake Handler: Compensates for computer sleep where timers pause
   */
  public handleSystemWake(): void {
    logger.info('System wake detected. Re-evaluating reset state immediately...');
    this.scheduleNextCheck(1000);
  }
}
