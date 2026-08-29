import { describe, it, expect } from 'vitest';
import {
  clampPercent,
  extractOrgIdFromBootstrap,
  orderOrgCandidates,
  parseUsageResponse,
  parseScrapedSettingsText,
} from '../src/usage/usage-parser.js';

describe('UsageParser', () => {
  it('clamps percentages properly between 0 and 100', () => {
    expect(clampPercent(-10)).toBe(0);
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(45.6)).toBe(46);
    expect(clampPercent(100)).toBe(100);
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(NaN)).toBe(0);
  });

  it('extracts org ID from bootstrap object across formats', () => {
    expect(extractOrgIdFromBootstrap({ organization_id: 'org-123' })).toBe('org-123');
    expect(extractOrgIdFromBootstrap({ account: { organization_id: 'org-456' } })).toBe('org-456');
    expect(
      extractOrgIdFromBootstrap({
        account: { memberships: [{ organization: { uuid: 'org-789' } }] },
      })
    ).toBe('org-789');
    expect(extractOrgIdFromBootstrap(null)).toBeNull();
  });

  it('orders org candidates prioritizing active org', () => {
    const orgs = [{ uuid: 'org-1' }, { uuid: 'org-2' }, { uuid: 'org-3' }];
    expect(orderOrgCandidates(orgs, 'org-2')).toEqual(['org-2', 'org-1', 'org-3']);
    expect(orderOrgCandidates(orgs, 'org-unknown')).toEqual(['org-1', 'org-2', 'org-3']);
  });

  it('parses modern limits array format', () => {
    const data = {
      limits: [
        { kind: 'session', percent: 82.4, resets_at: '2026-08-30T05:15:00.000Z' },
        { kind: 'weekly_all', percent: 40, resets_at: '2026-09-05T00:00:00.000Z' },
        {
          kind: 'weekly_scoped',
          percent: 25,
          resets_at: '2026-09-05T00:00:00.000Z',
          scope: { model: { id: 'claude-3-5-sonnet', display_name: 'Sonnet' } },
        },
      ],
    };

    const now = new Date('2026-08-30T04:15:00.000Z').getTime();
    const result = parseUsageResponse(data, now);

    expect(result.usagePercent).toBe(82);
    expect(result.resetTimestamp).toBe('2026-08-30T05:15:00.000Z');
    expect(result.secondsUntilReset).toBe(3600);
    expect(result.allModelsPercent).toBe(40);
    expect(result.models).toHaveLength(1);
    expect(result.models![0].name).toBe('Sonnet');
    expect(result.models![0].percent).toBe(25);
  });

  it('parses legacy five_hour and seven_day format', () => {
    const data = {
      five_hour: { utilization: 95, resets_at: '2026-08-30T06:00:00.000Z' },
      seven_day: { utilization: 60, resets_at: '2026-09-06T00:00:00.000Z' },
      seven_day_opus: { utilization: 30, resets_at: '2026-09-06T00:00:00.000Z' },
    };

    const now = new Date('2026-08-30T05:00:00.000Z').getTime();
    const result = parseUsageResponse(data, now);

    expect(result.usagePercent).toBe(95);
    expect(result.resetTimestamp).toBe('2026-08-30T06:00:00.000Z');
    expect(result.secondsUntilReset).toBe(3600);
    expect(result.models).toHaveLength(1);
    expect(result.models![0].name).toBe('Opus');
  });

  it('parses scraped settings usage text fallback', () => {
    const pageText = 'Your current session usage is 78% used of your total capacity. Weekly usage is 34% used.';
    const result = parseScrapedSettingsText(pageText);

    expect(result).not.toBeNull();
    expect(result?.usagePercent).toBe(78);
    expect(result?.allModelsPercent).toBe(34);
    expect(result?.method).toBe('scraper');
  });
});
