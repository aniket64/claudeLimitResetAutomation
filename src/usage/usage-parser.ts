/**
 * Usage Data Parsing and Extraction
 */
import { NormalizedUsageState, ScopedModelUsage } from '../types/index.js';

export function clampPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function extractOrgIdFromBootstrap(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, any>;
  return (
    d.organization_id ||
    d.organizationId ||
    d.account?.organization_id ||
    d.account?.memberships?.[0]?.organization?.uuid ||
    d.account?.memberships?.[0]?.organization?.id ||
    d.organizations?.[0]?.uuid ||
    d.organizations?.[0]?.id ||
    null
  );
}

export function orderOrgCandidates(orgs: unknown, activeOrgId: string | null): string[] {
  const list = Array.isArray(orgs) ? orgs : [];
  const validIds = list
    .map((o) => (o && typeof o === 'object' ? (o.uuid || o.id) : null))
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (activeOrgId && validIds.includes(activeOrgId)) {
    return [activeOrgId, ...validIds.filter((id) => id !== activeOrgId)];
  }
  return validIds;
}

export interface RawLimitsEntry {
  kind?: string;
  percent?: number;
  resets_at?: string | null;
  scope?: {
    model?: {
      id?: string;
      display_name?: string;
    };
  };
}

export interface RawUsageResponse {
  limits?: RawLimitsEntry[];
  five_hour?: {
    utilization?: number;
    resets_at?: string | null;
  };
  seven_day?: {
    utilization?: number;
    resets_at?: string | null;
  };
  [key: string]: unknown;
}

export function parseUsageResponse(data: unknown, now: number = Date.now()): NormalizedUsageState {
  if (!data || typeof data !== 'object') {
    return {
      usagePercent: 0,
      resetTimestamp: null,
      secondsUntilReset: null,
      status: 'CLAUDE_UNAVAILABLE',
      lastUpdated: now,
      method: 'unknown',
      error: 'Invalid or empty usage data received',
    };
  }

  const raw = data as RawUsageResponse;
  let usagePercent = 0;
  let resetTimestamp: string | null = null;
  let allModelsPercent = 0;
  let allModelsResetTimestamp: string | null = null;
  const models: ScopedModelUsage[] = [];

  if (Array.isArray(raw.limits) && raw.limits.length > 0) {
    for (const entry of raw.limits) {
      if (!entry || typeof entry !== 'object') continue;
      const pct = clampPercent(entry.percent);

      if (entry.kind === 'session') {
        usagePercent = pct;
        resetTimestamp = entry.resets_at || null;
      } else if (entry.kind === 'weekly_all') {
        allModelsPercent = pct;
        allModelsResetTimestamp = entry.resets_at || null;
      } else if (entry.kind === 'weekly_scoped') {
        const modelObj = entry.scope?.model;
        const name = modelObj?.display_name || modelObj?.id || 'Unknown';
        const codename = (modelObj?.id || name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        models.push({
          codename,
          name,
          percent: pct,
          resetsAt: entry.resets_at || null,
        });
      }
    }
  } else {
    // Legacy fallback (five_hour & seven_day)
    const fiveHour = raw.five_hour || {};
    const sevenDay = raw.seven_day || {};

    usagePercent = clampPercent(fiveHour.utilization);
    resetTimestamp = fiveHour.resets_at || null;

    allModelsPercent = clampPercent(sevenDay.utilization);
    allModelsResetTimestamp = sevenDay.resets_at || null;

    for (const key of Object.keys(raw)) {
      if (key.startsWith('seven_day_') && key !== 'seven_day' && raw[key] && typeof raw[key] === 'object') {
        const modelData = raw[key] as { utilization?: number; resets_at?: string | null };
        const codename = key.replace('seven_day_', '');
        models.push({
          codename,
          name: codename.charAt(0).toUpperCase() + codename.slice(1),
          percent: clampPercent(modelData.utilization),
          resetsAt: modelData.resets_at || null,
        });
      }
    }
  }

  // Calculate secondsUntilReset
  let secondsUntilReset: number | null = null;
  if (resetTimestamp) {
    const resetTime = new Date(resetTimestamp).getTime();
    if (Number.isFinite(resetTime)) {
      secondsUntilReset = Math.max(0, Math.floor((resetTime - now) / 1000));
    }
  }

  return {
    usagePercent,
    resetTimestamp,
    secondsUntilReset,
    status: secondsUntilReset === 0 ? 'RESET_DETECTED' : 'WAITING',
    allModelsPercent,
    allModelsResetTimestamp,
    models,
    lastUpdated: now,
    method: 'api',
  };
}

/**
 * Scraper fallback for text in /settings/usage
 */
export function parseScrapedSettingsText(pageText: string, now: number = Date.now()): NormalizedUsageState | null {
  if (!pageText || pageText.length < 50) return null;

  const pattern = /(\d+)%\s*used/gi;
  const matches = [...pageText.matchAll(pattern)];

  if (matches.length === 0) return null;

  const percentages = matches.map((m) => {
    const num = parseInt(m[1], 10);
    return isNaN(num) ? 0 : clampPercent(num);
  });

  const usagePercent = percentages[0] ?? 0;
  const allModelsPercent = percentages[1] ?? 0;

  return {
    usagePercent,
    resetTimestamp: null,
    secondsUntilReset: null,
    status: 'WAITING',
    allModelsPercent,
    lastUpdated: now,
    method: 'scraper',
  };
}
