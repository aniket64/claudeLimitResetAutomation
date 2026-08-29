/**
 * Core Type Definitions for Claude Safari Reset Automation
 */

export type AutomationStatus =
  | 'ACTIVE'
  | 'RESETTING'
  | 'RESET_DETECTED'
  | 'MODEL_SELECTING'
  | 'MESSAGE_SENDING'
  | 'MESSAGE_SENT'
  | 'WAITING'
  | 'ERROR'
  | 'LOGIN_REQUIRED'
  | 'MODEL_UNAVAILABLE'
  | 'CLAUDE_UNAVAILABLE'
  | 'PAUSED'
  | 'DISABLED';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export type SupportedClaudeModel = 'haiku' | 'sonnet' | 'opus' | 'default' | string;

export interface ModelSelectionResult {
  success: boolean;
  model: string;
  previousModel?: string;
  step?: 'check_current' | 'open_menu' | 'select_option' | 'verify';
  error?: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  message: string;
  details?: Record<string, unknown> | Error | string | number | boolean | null;
}

export interface ScopedModelUsage {
  codename: string;
  name: string;
  percent: number;
  resetsAt: string | null;
}

export interface NormalizedUsageState {
  usagePercent: number;
  resetTimestamp: string | null;
  secondsUntilReset: number | null;
  status: AutomationStatus;
  allModelsPercent?: number;
  allModelsResetTimestamp?: string | null;
  models?: ScopedModelUsage[];
  lastUpdated: number;
  method: 'api' | 'scraper' | 'simulated' | 'unknown';
  error?: string | null;
}

export interface AutomationConfig {
  enabled: boolean;
  message: string;
  model: SupportedClaudeModel;
  checkIntervalSec: number;
  autoSendAfterReset: boolean;
  requireClaudeTab: boolean;
  desktopNotifications: boolean;
  debugLogging: boolean;
  dryRun: boolean;
  maxRetries: number;
  retryBackoffSec: number;
}

export interface ResetEventRecord {
  id: string;
  timestamp: number;
  resetTimestamp: string;
  usageAtReset: number;
  messageSent: string;
  selectedModel?: string;
  dryRun: boolean;
  success: boolean;
  error?: string | null;
}

export interface PersistentState {
  lastConfirmedReset: string | null;
  lastMessageSentAt: number | null;
  lastMessageId: string | null;
  lastMessageContent: string | null;
  lastSelectedModel?: string | null;
  state: AutomationStatus;
  stateReason: string | null;
  history: ResetEventRecord[];
  isSending: boolean;
}

export interface ClaudeTabInfo {
  tabId?: number;
  url: string;
  title: string;
  active: boolean;
  isLoggedIn: boolean;
}

export interface DOMInteractionResult {
  success: boolean;
  step:
    | 'find_tab'
    | 'check_login'
    | 'select_model'
    | 'verify_model'
    | 'check_composer'
    | 'insert_text'
    | 'verify_text'
    | 'click_send'
    | 'verify_submission';
  message: string;
  selectedModel?: string;
  dryRun?: boolean;
  error?: string;
  timestamp: number;
}

export type ExtensionMessage =
  | { action: 'get_status' }
  | { action: 'get_logs' }
  | { action: 'get_config' }
  | { action: 'update_config'; config: Partial<AutomationConfig> }
  | { action: 'trigger_check'; triggerReason?: string }
  | { action: 'run_test_now'; mode: 'interactive' | 'live_send' | 'dry_run' }
  | { action: 'reset_state' }
  | { action: 'clear_logs' }
  | { action: 'proxy_fetch'; url: string }
  | { action: 'dom_interact'; message: string; model?: string; dryRun: boolean }
  | { action: 'show_toast'; title: string; body: string; level?: 'info' | 'warn' | 'error' | 'success' };
