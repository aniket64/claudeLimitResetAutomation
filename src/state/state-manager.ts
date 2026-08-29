/**
 * State and Persistence Management
 */
import { AutomationConfig, AutomationStatus, NormalizedUsageState, PersistentState, ResetEventRecord } from '../types/index.js';
import { DEFAULT_CONFIG, INITIAL_STATE, STORAGE_KEYS } from '../config/defaults.js';
import { logger } from '../logging/logger.js';

export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    const val = this.store.get(key);
    return val !== undefined ? (JSON.parse(JSON.stringify(val)) as T) : null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.parse(JSON.stringify(value)));
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export class ChromeStorageAdapter implements StorageAdapter {
  async get<T>(key: string): Promise<T | null> {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return null;
    }
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (items) => {
        if (chrome.runtime.lastError) {
          logger.warn(`Chrome storage get error for ${key}:`, chrome.runtime.lastError.message);
          resolve(null);
        } else {
          resolve((items[key] as T) || null);
        }
      });
    });
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [key]: value }, () => {
        if (chrome.runtime.lastError) {
          logger.error(`Chrome storage set error for ${key}:`, chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  async remove(key: string): Promise<void> {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, () => resolve());
    });
  }
}

export class StateManager {
  private static instance: StateManager;
  private storage: StorageAdapter;
  private config: AutomationConfig = { ...DEFAULT_CONFIG };
  private state: PersistentState = { ...INITIAL_STATE };
  private usage: NormalizedUsageState | null = null;
  private initialized = false;

  private stateChangeListeners: Set<(state: PersistentState) => void> = new Set();
  private configChangeListeners: Set<(config: AutomationConfig) => void> = new Set();
  private usageChangeListeners: Set<(usage: NormalizedUsageState | null) => void> = new Set();

  public constructor(storage?: StorageAdapter) {
    if (storage) {
      this.storage = storage;
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      this.storage = new ChromeStorageAdapter();
    } else {
      this.storage = new MemoryStorageAdapter();
    }
  }

  public static getInstance(): StateManager {
    if (!StateManager.instance) {
      StateManager.instance = new StateManager();
    }
    return StateManager.instance;
  }

  public setStorageAdapter(storage: StorageAdapter): void {
    this.storage = storage;
  }

  public async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const storedConfig = await this.storage.get<AutomationConfig>(STORAGE_KEYS.CONFIG);
      if (storedConfig) {
        this.config = { ...DEFAULT_CONFIG, ...storedConfig };
      }

      const storedState = await this.storage.get<PersistentState>(STORAGE_KEYS.STATE);
      if (storedState) {
        this.state = { ...INITIAL_STATE, ...storedState, isSending: false }; // Clear any hanging isSending lock on startup
      }

      const storedUsage = await this.storage.get<NormalizedUsageState>(STORAGE_KEYS.USAGE);
      if (storedUsage) {
        this.usage = storedUsage;
      }

      logger.setDebugEnabled(this.config.debugLogging);
      logger.info('StateManager initialized successfully.', {
        enabled: this.config.enabled,
        lastReset: this.state.lastConfirmedReset,
        state: this.state.state,
      });

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize StateManager from storage:', error);
      this.initialized = true; // allow runtime with defaults
    }
  }

  public getConfig(): AutomationConfig {
    return { ...this.config };
  }

  public async updateConfig(patch: Partial<AutomationConfig>): Promise<AutomationConfig> {
    this.config = { ...this.config, ...patch };
    logger.setDebugEnabled(this.config.debugLogging);
    await this.storage.set(STORAGE_KEYS.CONFIG, this.config);
    logger.info('Configuration updated:', patch);

    for (const listener of this.configChangeListeners) {
      try {
        listener(this.config);
      } catch (err) {
        logger.error('Error in config listener:', err);
      }
    }
    return this.config;
  }

  public getState(): PersistentState {
    return { ...this.state };
  }

  public async setStatus(status: AutomationStatus, reason?: string): Promise<void> {
    this.state.state = status;
    if (reason) this.state.stateReason = reason;
    await this.storage.set(STORAGE_KEYS.STATE, this.state);

    for (const listener of this.stateChangeListeners) {
      try {
        listener(this.state);
      } catch (err) {
        logger.error('Error in state listener:', err);
      }
    }
  }

  public async acquireSendLock(): Promise<boolean> {
    if (this.state.isSending) {
      logger.warn('Send lock acquisition rejected: Already sending.');
      return false;
    }
    this.state.isSending = true;
    await this.storage.set(STORAGE_KEYS.STATE, this.state);
    return true;
  }

  public async releaseSendLock(): Promise<void> {
    this.state.isSending = false;
    await this.storage.set(STORAGE_KEYS.STATE, this.state);
  }

  /**
   * Idempotency Check: Returns true if this reset timestamp has ALREADY been processed and sent.
   */
  public isResetAlreadyProcessed(resetTimestamp: string): boolean {
    if (!resetTimestamp) return false;
    if (this.state.lastConfirmedReset === resetTimestamp) {
      return true;
    }
    // Check history records
    const inHistory = this.state.history.some(
      (h) => h.resetTimestamp === resetTimestamp && h.success
    );
    return inHistory;
  }

  /**
   * Records a successful or dry-run message send event and updates lastConfirmedReset.
   */
  public async recordSendSuccess(
    resetTimestamp: string,
    message: string,
    dryRun: boolean,
    usageAtReset: number
  ): Promise<void> {
    const record: ResetEventRecord = {
      id: `reset-evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      resetTimestamp,
      usageAtReset,
      messageSent: message,
      dryRun,
      success: true,
    };

    this.state.lastConfirmedReset = resetTimestamp;
    this.state.lastMessageSentAt = Date.now();
    this.state.lastMessageId = record.id;
    this.state.lastMessageContent = message;
    this.state.state = 'MESSAGE_SENT';
    this.state.stateReason = dryRun
      ? `[DRY-RUN] Simulated message send for reset ${resetTimestamp}`
      : `Message successfully submitted for reset ${resetTimestamp}`;
    this.state.isSending = false;

    this.state.history.unshift(record);
    if (this.state.history.length > 50) {
      this.state.history = this.state.history.slice(0, 50);
    }

    await this.storage.set(STORAGE_KEYS.STATE, this.state);

    for (const listener of this.stateChangeListeners) {
      try {
        listener(this.state);
      } catch (err) {
        logger.error('Error in state listener:', err);
      }
    }
  }

  /**
   * Records a failed message send attempt.
   */
  public async recordSendFailure(
    resetTimestamp: string,
    message: string,
    dryRun: boolean,
    error: string,
    usageAtReset: number
  ): Promise<void> {
    const record: ResetEventRecord = {
      id: `reset-fail-${Date.now()}`,
      timestamp: Date.now(),
      resetTimestamp,
      usageAtReset,
      messageSent: message,
      dryRun,
      success: false,
      error,
    };

    this.state.state = 'ERROR';
    this.state.stateReason = `Send failed: ${error}`;
    this.state.isSending = false;
    this.state.history.unshift(record);
    if (this.state.history.length > 50) {
      this.state.history = this.state.history.slice(0, 50);
    }

    await this.storage.set(STORAGE_KEYS.STATE, this.state);

    for (const listener of this.stateChangeListeners) {
      try {
        listener(this.state);
      } catch (err) {
        logger.error('Error in state listener:', err);
      }
    }
  }

  public getUsage(): NormalizedUsageState | null {
    return this.usage ? { ...this.usage } : null;
  }

  public async setUsage(usage: NormalizedUsageState): Promise<void> {
    this.usage = usage;
    await this.storage.set(STORAGE_KEYS.USAGE, usage);

    for (const listener of this.usageChangeListeners) {
      try {
        listener(this.usage);
      } catch (err) {
        logger.error('Error in usage listener:', err);
      }
    }
  }

  public async resetState(): Promise<void> {
    this.state = { ...INITIAL_STATE };
    this.usage = null;
    await this.storage.remove(STORAGE_KEYS.STATE);
    await this.storage.remove(STORAGE_KEYS.USAGE);
    logger.info('Automation state reset to initial.');
    for (const listener of this.stateChangeListeners) {
      try {
        listener(this.state);
      } catch (err) {
        logger.error('Error in state listener:', err);
      }
    }
  }

  public onStateChange(listener: (state: PersistentState) => void): () => void {
    this.stateChangeListeners.add(listener);
    return () => this.stateChangeListeners.delete(listener);
  }

  public onConfigChange(listener: (config: AutomationConfig) => void): () => void {
    this.configChangeListeners.add(listener);
    return () => this.configChangeListeners.delete(listener);
  }

  public onUsageChange(listener: (usage: NormalizedUsageState | null) => void): () => void {
    this.usageChangeListeners.add(listener);
    return () => this.usageChangeListeners.delete(listener);
  }
}

export const stateManager = StateManager.getInstance();
