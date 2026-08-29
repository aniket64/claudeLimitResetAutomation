/**
 * Configuration Defaults & Constants
 */
import { AutomationConfig, PersistentState } from '../types/index.js';

export const DEFAULT_CONFIG: AutomationConfig = {
  enabled: true,
  message: 'Hi',
  model: 'haiku',
  checkIntervalSec: 60, // 1 minute default interval
  autoSendAfterReset: true,
  requireClaudeTab: true,
  desktopNotifications: true,
  debugLogging: true,
  dryRun: false,
  maxRetries: 3,
  retryBackoffSec: 15,
};

export const INITIAL_STATE: PersistentState = {
  lastConfirmedReset: null,
  lastMessageSentAt: null,
  lastMessageId: null,
  lastMessageContent: null,
  lastSelectedModel: null,
  state: 'WAITING',
  stateReason: 'Automation initialized. Waiting for reset schedule.',
  history: [],
  isSending: false,
};

export const CLAUDE_URLS = {
  HOME: 'https://claude.ai',
  NEW_CHAT: 'https://claude.ai/new',
  SETTINGS_USAGE: 'https://claude.ai/settings/usage',
  API_BOOTSTRAP: 'https://claude.ai/api/bootstrap',
  API_ACCOUNT: 'https://claude.ai/api/account',
  API_ORGANIZATIONS: 'https://claude.ai/api/organizations',
  API_USAGE: (orgId: string) => `https://claude.ai/api/organizations/${orgId}/usage`,
};

export const STORAGE_KEYS = {
  CONFIG: 'claude_auto_reset_config',
  STATE: 'claude_auto_reset_state',
  USAGE: 'claude_auto_reset_usage',
  LOGS: 'claude_auto_reset_logs',
};

export const TIMING = {
  MIN_CHECK_INTERVAL_SEC: 15,
  MAX_CHECK_INTERVAL_SEC: 3600,
  POST_RESET_STABILIZE_DELAY_MS: 3000,
  DOM_INTERACTION_TIMEOUT_MS: 15000,
  MAX_LOG_ENTRIES: 300,
};
