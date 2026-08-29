/**
 * Structured Logger Module
 */
import { LogEntry, LogLevel } from '../types/index.js';
import { TIMING } from '../config/defaults.js';

export type LogListener = (entry: LogEntry) => void;

export class Logger {
  private static instance: Logger;
  private entries: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private debugEnabled: boolean = true;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  public subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getEntries(): LogEntry[] {
    return [...this.entries];
  }

  public setEntries(entries: LogEntry[]): void {
    this.entries = entries.slice(-TIMING.MAX_LOG_ENTRIES);
  }

  public clear(): void {
    this.entries = [];
  }

  public debug(message: string, details?: unknown): void {
    if (!this.debugEnabled) return;
    this.log('DEBUG', message, details);
  }

  public info(message: string, details?: unknown): void {
    this.log('INFO', message, details);
  }

  public warn(message: string, details?: unknown): void {
    this.log('WARN', message, details);
  }

  public error(message: string, details?: unknown): void {
    this.log('ERROR', message, details);
  }

  private log(level: LogLevel, message: string, details?: unknown): void {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
      level,
      message,
      details: this.sanitizeDetails(details),
    };

    this.entries.push(entry);
    if (this.entries.length > TIMING.MAX_LOG_ENTRIES) {
      this.entries.shift();
    }

    const formattedTime = new Date(entry.timestamp).toLocaleTimeString();
    const tag = `[${formattedTime}] [${level}]`;

    switch (level) {
      case 'DEBUG':
        console.debug(tag, message, entry.details ?? '');
        break;
      case 'INFO':
        console.info(tag, message, entry.details ?? '');
        break;
      case 'WARN':
        console.warn(tag, message, entry.details ?? '');
        break;
      case 'ERROR':
        console.error(tag, message, entry.details ?? '');
        break;
    }

    for (const listener of this.listeners) {
      try {
        listener(entry);
      } catch (err) {
        console.error('Error in log listener:', err);
      }
    }
  }

  private sanitizeDetails(details: unknown): Record<string, unknown> | string | number | boolean | null {
    if (details === undefined || details === null) return null;
    if (typeof details === 'string' || typeof details === 'number' || typeof details === 'boolean') {
      return details;
    }
    if (details instanceof Error) {
      return {
        name: details.name,
        message: details.message,
        stack: details.stack,
      };
    }
    try {
      return JSON.parse(JSON.stringify(details));
    } catch {
      return String(details);
    }
  }
}

export const logger = Logger.getInstance();
