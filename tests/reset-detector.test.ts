import { describe, it, expect } from 'vitest';
import { ResetDetector } from '../src/reset/reset-detector.js';
import { NormalizedUsageState } from '../src/types/index.js';

describe('ResetDetector', () => {
  const baseUsage = (overrides: Partial<NormalizedUsageState> = {}): NormalizedUsageState => ({
    usagePercent: 50,
    resetTimestamp: '2026-08-30T04:00:00.000Z',
    secondsUntilReset: 3600,
    status: 'WAITING',
    lastUpdated: Date.now(),
    method: 'api',
    ...overrides,
  });

  it('detects reset when current time reaches or passes resetTimestamp', () => {
    const current = baseUsage({
      usagePercent: 90,
      resetTimestamp: '2026-08-30T04:00:00.000Z',
      secondsUntilReset: 0,
    });
    const prev = baseUsage({
      usagePercent: 90,
      resetTimestamp: '2026-08-30T04:00:00.000Z',
      secondsUntilReset: 10,
    });
    const now = new Date('2026-08-30T04:00:01.000Z').getTime();

    const result = ResetDetector.evaluate(current, prev, null, now);
    expect(result.isResetConfirmed).toBe(true);
    expect(result.confidence).toBe('HIGH');
    expect(result.resetTimestamp).toBe('2026-08-30T04:00:00.000Z');
  });

  it('rejects duplicate reset if the timestamp was already confirmed and processed', () => {
    const current = baseUsage({
      usagePercent: 90,
      resetTimestamp: '2026-08-30T04:00:00.000Z',
    });
    const prev = baseUsage({
      usagePercent: 90,
      resetTimestamp: '2026-08-30T04:00:00.000Z',
    });
    const now = new Date('2026-08-30T04:05:00.000Z').getTime();

    const result = ResetDetector.evaluate(current, prev, '2026-08-30T04:00:00.000Z', now);
    expect(result.isResetConfirmed).toBe(false);
    expect(result.isDuplicate).toBe(true);
  });

  it('detects reset when reset timestamp advances forward to a new window', () => {
    const prev = baseUsage({
      usagePercent: 100,
      resetTimestamp: '2026-08-30T04:00:00.000Z',
    });
    const current = baseUsage({
      usagePercent: 10,
      resetTimestamp: '2026-08-30T09:00:00.000Z',
    });
    const now = new Date('2026-08-30T04:01:00.000Z').getTime();

    const result = ResetDetector.evaluate(current, prev, '2026-08-30T04:00:00.000Z', now);
    expect(result.isResetConfirmed).toBe(true);
    expect(result.resetTimestamp).toBe('2026-08-30T09:00:00.000Z');
  });

  it('detects reset when usage drops to 0% after previously having utilization', () => {
    const prev = baseUsage({
      usagePercent: 85,
      resetTimestamp: '2026-08-30T04:00:00.000Z',
    });
    const current = baseUsage({
      usagePercent: 0,
      resetTimestamp: null,
    });
    const now = new Date('2026-08-30T04:00:05.000Z').getTime();

    const result = ResetDetector.evaluate(current, prev, '2026-08-30T04:00:00.000Z', now);
    expect(result.isResetConfirmed).toBe(true);
    expect(result.usagePercent).toBe(0);
  });

  it('returns no reset when reset is still in the future', () => {
    const current = baseUsage({
      usagePercent: 40,
      resetTimestamp: '2026-08-30T08:00:00.000Z',
      secondsUntilReset: 7200,
    });
    const now = new Date('2026-08-30T06:00:00.000Z').getTime();

    const result = ResetDetector.evaluate(current, null, null, now);
    expect(result.isResetConfirmed).toBe(false);
    expect(result.confidence).toBe('NONE');
  });
});
