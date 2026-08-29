/**
 * Multi-Signal Reset Detection Engine
 */
import { NormalizedUsageState } from '../types/index.js';
import { logger } from '../logging/logger.js';

export interface ResetEvaluation {
  isResetConfirmed: boolean;
  reason: string;
  resetTimestamp: string | null;
  usagePercent: number;
  isDuplicate: boolean;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

export class ResetDetector {
  /**
   * Evaluates whether a 5-hour usage reset has legitimately occurred based on multi-signal verification.
   *
   * @param current The latest normalized usage state
   * @param previous The previous normalized usage state (if available)
   * @param lastConfirmedReset The timestamp of the last reset window that was already processed
   * @param now Current timestamp in ms (defaults to Date.now())
   */
  public static evaluate(
    current: NormalizedUsageState,
    previous: NormalizedUsageState | null,
    lastConfirmedReset: string | null,
    now: number = Date.now()
  ): ResetEvaluation {
    const currentResetTime = current.resetTimestamp ? new Date(current.resetTimestamp).getTime() : null;
    const prevResetTime = previous?.resetTimestamp ? new Date(previous.resetTimestamp).getTime() : null;

    // 1. Check if current reset has already been processed
    if (current.resetTimestamp && lastConfirmedReset === current.resetTimestamp) {
      return {
        isResetConfirmed: false,
        reason: `Reset window ${current.resetTimestamp} has already been processed.`,
        resetTimestamp: current.resetTimestamp,
        usagePercent: current.usagePercent,
        isDuplicate: true,
        confidence: 'NONE',
      };
    }

    // 2. Signal A: Active reset timestamp has elapsed in time (now >= resetTimestamp)
    if (currentResetTime && now >= currentResetTime) {
      logger.info('Reset Signal: Reset timestamp reached/passed.', {
        resetTimestamp: current.resetTimestamp,
        nowIso: new Date(now).toISOString(),
      });
      return {
        isResetConfirmed: true,
        reason: `Reset timestamp ${current.resetTimestamp} reached at ${new Date(now).toISOString()}`,
        resetTimestamp: current.resetTimestamp,
        usagePercent: current.usagePercent,
        isDuplicate: false,
        confidence: 'HIGH',
      };
    }

    // 3. Signal B: Reset timestamp advanced forward to a new future window while previous had expired
    if (currentResetTime && prevResetTime && currentResetTime > prevResetTime) {
      logger.info('Reset Signal: Reset window advanced forward.', {
        previousReset: previous?.resetTimestamp,
        newReset: current.resetTimestamp,
        currentUsage: current.usagePercent,
      });
      return {
        isResetConfirmed: true,
        reason: `Reset window advanced from ${previous?.resetTimestamp} to ${current.resetTimestamp}`,
        resetTimestamp: current.resetTimestamp,
        usagePercent: current.usagePercent,
        isDuplicate: false,
        confidence: 'HIGH',
      };
    }

    // 4. Signal C: Usage percentage dropped from a previously high usage (>=50% or >0%) down to 0%
    if (
      previous &&
      previous.usagePercent > 0 &&
      current.usagePercent === 0 &&
      (!currentResetTime || (prevResetTime && currentResetTime !== prevResetTime))
    ) {
      logger.info('Reset Signal: Usage utilization dropped to 0%.', {
        previousUsage: previous.usagePercent,
        currentUsage: current.usagePercent,
      });
      const generatedTimestamp = current.resetTimestamp || new Date(now).toISOString();
      return {
        isResetConfirmed: true,
        reason: `Usage dropped from ${previous.usagePercent}% to 0%`,
        resetTimestamp: generatedTimestamp,
        usagePercent: current.usagePercent,
        isDuplicate: lastConfirmedReset === generatedTimestamp,
        confidence: 'MEDIUM',
      };
    }

    // 5. No reset condition met
    return {
      isResetConfirmed: false,
      reason: current.resetTimestamp
        ? `Reset in future: ${current.secondsUntilReset ?? 0}s remaining (${current.resetTimestamp})`
        : `No active reset countdown. Current usage: ${current.usagePercent}%`,
      resetTimestamp: current.resetTimestamp,
      usagePercent: current.usagePercent,
      isDuplicate: false,
      confidence: 'NONE',
    };
  }
}
