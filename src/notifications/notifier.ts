/**
 * Multi-Platform Notification Dispatcher
 */
import { AutomationConfig } from '../types/index.js';
import { logger } from '../logging/logger.js';

export class Notifier {
  private static instance: Notifier;

  private constructor() {}

  public static getInstance(): Notifier {
    if (!Notifier.instance) {
      Notifier.instance = new Notifier();
    }
    return Notifier.instance;
  }

  /**
   * Displays an in-page toast notification inside Claude Web DOM.
   */
  public showInPageToast(
    title: string,
    message: string,
    type: 'info' | 'warn' | 'error' | 'success' = 'info',
    doc: Document = document
  ): void {
    try {
      const containerId = 'claude-auto-reset-toast-container';
      let container = doc.getElementById(containerId);

      if (!container) {
        container = doc.createElement('div');
        container.id = containerId;
        container.style.cssText = `
          position: fixed;
          top: 24px;
          right: 24px;
          z-index: 999999;
          display: flex;
          flex-direction: column;
          gap: 10px;
          pointer-events: none;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;
        doc.body.appendChild(container);
      }

      const toast = doc.createElement('div');
      toast.style.cssText = `
        min-width: 280px;
        max-width: 380px;
        padding: 12px 16px;
        background: ${type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : type === 'warn' ? '#f59e0b' : '#3b82f6'};
        color: #ffffff;
        border-radius: 8px;
        box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
        font-size: 13px;
        line-height: 1.4;
        pointer-events: auto;
        animation: toast-slide-in 0.25s ease-out;
        display: flex;
        flex-direction: column;
      `;

      const titleEl = doc.createElement('strong');
      titleEl.textContent = title;
      titleEl.style.marginBottom = '4px';

      const bodyEl = doc.createElement('span');
      bodyEl.textContent = message;

      toast.appendChild(titleEl);
      toast.appendChild(bodyEl);
      container.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
      }, 4500);
    } catch (e) {
      logger.warn('Failed to render in-page toast:', e);
    }
  }

  /**
   * Dispatches desktop notification via Chrome/Safari Extension API.
   */
  public async notifyDesktop(
    title: string,
    message: string,
    config?: AutomationConfig
  ): Promise<void> {
    if (config && !config.desktopNotifications) {
      return;
    }

    // Try browser extension notification API
    if (typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.create) {
      try {
        chrome.notifications.create(`claude-reset-${Date.now()}`, {
          type: 'basic',
          iconUrl: (chrome.runtime?.getURL && chrome.runtime.getURL('icons/icon128.png')) || '',
          title,
          message,
          priority: 2,
        });
        return;
      } catch (err) {
        logger.warn('chrome.notifications.create failed:', err);
      }
    }

    // Try Web Notification API
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification(title, { body: message });
        return;
      } catch (err) {
        logger.warn('Web Notification failed:', err);
      }
    }

    logger.info(`Notification: [${title}] ${message}`);
  }
}

export const notifier = Notifier.getInstance();
