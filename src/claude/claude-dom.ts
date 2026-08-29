/**
 * Claude Web DOM Interaction Module
 */
import { DOMInteractionResult } from '../types/index.js';
import { logger } from '../logging/logger.js';
import { ModelSelector } from './model-selector.js';

export const DOM_SELECTORS = {
  // Input selectors
  INPUT_CONTENTEDITABLE: [
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"].ProseMirror',
    'fieldset div[contenteditable="true"]',
    'div[contenteditable="true"][data-placeholder]',
    'div[contenteditable="true"][translate="no"]',
    'div[contenteditable="true"]',
  ],
  INPUT_TEXTAREA: [
    'textarea[data-testid="chat-input"]',
    'textarea[placeholder*="Reply" i]',
    'textarea[placeholder*="Claude" i]',
    'textarea',
  ],

  // Send button selectors
  SEND_BUTTON: [
    'button[aria-label="Send message"]',
    'button[aria-label="Send Message"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label*="Send" i]',
    'button[data-testid="send-button"]',
    'fieldset button:not([disabled])',
    'form button[type="submit"]',
  ],

  // State indicators
  STOP_BUTTON: [
    'button[aria-label="Stop Response"]',
    'button[aria-label="Stop responding"]',
    'button[aria-label*="Stop" i]',
  ],
  LOGIN_INDICATORS: [
    'a[href*="/login"]',
    'a[href*="/auth"]',
    'button[data-testid="login-button"]',
    'button:has-text("Log In")',
    'button:has-text("Sign Up")',
  ],
  LOGGED_IN_INDICATORS: [
    '[data-testid="user-menu-button"]',
    '[data-testid="code-user-menu-button"]',
    '[data-testid="pin-sidebar-toggle"]',
    'nav[aria-label="Sidebar"]',
    'aside.dframe-sidebar',
  ],
  USER_MESSAGES: [
    '[data-testid="user-message"]',
    '[data-role="user"]',
    '.font-user-message',
  ],
};

export class ClaudeDOM {
  /**
   * Checks if Claude Web is currently in a logged out state.
   */
  public static isLoggedOut(doc: Document = document): boolean {
    const url = doc.location ? doc.location.pathname : '';
    if (url.startsWith('/login') || url.startsWith('/auth')) {
      return true;
    }

    for (const selector of DOM_SELECTORS.LOGIN_INDICATORS) {
      try {
        const el = doc.querySelector(selector);
        if (el) return true;
      } catch {
        // ignore selector errors
      }
    }
    return false;
  }

  /**
   * Checks if Claude Web is logged in.
   */
  public static isLoggedIn(doc: Document = document): boolean {
    if (this.isLoggedOut(doc)) return false;

    for (const selector of DOM_SELECTORS.LOGGED_IN_INDICATORS) {
      try {
        const el = doc.querySelector(selector);
        if (el) return true;
      } catch {
        // ignore
      }
    }
    // Also check if any chat input exists
    return Boolean(this.findChatInputElement(doc));
  }

  /**
   * Checks if Claude is actively generating a response.
   */
  public static isGenerating(doc: Document = document): boolean {
    for (const selector of DOM_SELECTORS.STOP_BUTTON) {
      try {
        const el = doc.querySelector(selector);
        if (el && !(el as HTMLButtonElement).disabled) return true;
      } catch {
        // ignore
      }
    }
    return false;
  }

  /**
   * Locates the chat input element (contenteditable or textarea).
   */
  public static findChatInputElement(doc: Document = document): HTMLElement | null {
    // Try contenteditable first
    for (const selector of DOM_SELECTORS.INPUT_CONTENTEDITABLE) {
      try {
        const elements = doc.querySelectorAll<HTMLElement>(selector);
        for (const el of elements) {
          const isEditable =
            el.getAttribute('contenteditable') === 'true' ||
            el.getAttribute('contenteditable') === '' ||
            Boolean((el as any).isContentEditable);
          if (isEditable) {
            return el;
          }
        }
      } catch {
        // ignore
      }
    }

    // Try textarea fallback
    for (const selector of DOM_SELECTORS.INPUT_TEXTAREA) {
      try {
        const el = doc.querySelector<HTMLTextAreaElement>(selector);
        if (el && !el.disabled) {
          return el;
        }
      } catch {
        // ignore
      }
    }

    return null;
  }

  /**
   * Locates the Send button.
   */
  public static findSendButton(doc: Document = document): HTMLButtonElement | null {
    for (const selector of DOM_SELECTORS.SEND_BUTTON) {
      try {
        const buttons = doc.querySelectorAll<HTMLButtonElement>(selector);
        for (const btn of buttons) {
          if (btn.tagName.toLowerCase() === 'button') {
            return btn;
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
  }

  /**
   * Inserts text into the chat input element reliably across ProseMirror/Lexical/Textarea.
   */
  public static insertTextIntoInput(inputEl: HTMLElement, text: string): boolean {
    inputEl.focus();

    if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
      inputEl.value = text;
      inputEl.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      inputEl.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      return inputEl.value === text;
    }

    // For contenteditable ProseMirror / Lexical
    try {
      // 1. Try document.execCommand if available in browser context
      if (typeof document !== 'undefined' && typeof document.execCommand === 'function') {
        const selection = window.getSelection();
        if (selection) {
          const range = document.createRange();
          range.selectNodeContents(inputEl);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        const execSuccess = document.execCommand('insertText', false, text);
        if (execSuccess && inputEl.textContent?.includes(text)) {
          return true;
        }
      }
    } catch {
      // fallback to manual DOM events
    }

    // 2. Synthetic DOM events fallback
    try {
      // Clear existing content
      inputEl.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = text;
      inputEl.appendChild(p);

      // Dispatch beforeinput and input events
      const beforeInputEvt = new CustomEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        detail: { inputType: 'insertText', data: text },
      });
      inputEl.dispatchEvent(beforeInputEvt);

      const inputEvt = new CustomEvent('input', {
        bubbles: true,
        cancelable: true,
        detail: { inputType: 'insertText', data: text },
      });
      inputEl.dispatchEvent(inputEvt);

      inputEl.dispatchEvent(new Event('change', { bubbles: true }));

      return Boolean(inputEl.textContent?.includes(text));
    } catch (err) {
      logger.error('Failed to insert text into contenteditable:', err);
      return false;
    }
  }

  /**
   * Executes the full automated send workflow on the provided document.
   */
  public static async executeSendWorkflow(
    message: string,
    model: string = 'haiku',
    dryRun: boolean = false,
    doc: Document = document
  ): Promise<DOMInteractionResult> {
    logger.info(`Starting Claude DOM send workflow (model=${model}, dryRun=${dryRun})...`);

    // 1. Check Login State
    if (this.isLoggedOut(doc)) {
      const err = 'Claude login required. Automation paused.';
      logger.warn(err);
      return {
        success: false,
        step: 'check_login',
        message: err,
        dryRun,
        error: 'LOGIN_REQUIRED',
        timestamp: Date.now(),
      };
    }

    // 2. Check Generating State
    if (this.isGenerating(doc)) {
      const err = 'Claude is currently generating a response. Waiting for completion.';
      logger.warn(err);
      return {
        success: false,
        step: 'check_composer',
        message: err,
        dryRun,
        error: 'CLAUDE_BUSY',
        timestamp: Date.now(),
      };
    }

    // 2.5. Select & Verify Claude Model (e.g. Haiku)
    let selectedModel = 'default';
    if (model && model.toLowerCase() !== 'default') {
      logger.info(`Selecting Claude model: "${model}"...`);
      const modelRes = await ModelSelector.selectModel(model, doc);
      if (!modelRes.success) {
        const modelErr = modelRes.error || `Failed to select model "${model}".`;
        logger.error(modelErr);
        return {
          success: false,
          step: 'select_model',
          message: `Model selection failed: ${modelErr}. Send aborted for safety.`,
          selectedModel: modelRes.model,
          dryRun,
          error: modelRes.error || 'MODEL_SELECTION_FAILED',
          timestamp: Date.now(),
        };
      }
      selectedModel = modelRes.model;
      logger.info(`[INFO] Model "${selectedModel}" selected and verified.`);
    }

    // 3. Find Input
    const inputEl = this.findChatInputElement(doc);
    if (!inputEl) {
      const err = 'Could not find Claude chat input field.';
      logger.error(err);
      return {
        success: false,
        step: 'insert_text',
        message: err,
        dryRun,
        error: 'INPUT_NOT_FOUND',
        timestamp: Date.now(),
      };
    }

    // 4. Insert Text
    const inserted = this.insertTextIntoInput(inputEl, message);
    if (!inserted) {
      const err = 'Failed to set text in Claude chat input.';
      logger.error(err);
      return {
        success: false,
        step: 'insert_text',
        message: err,
        dryRun,
        error: 'TEXT_INSERTION_FAILED',
        timestamp: Date.now(),
      };
    }

    // 5. Verify Text Content in DOM
    const actualText = inputEl.textContent || (inputEl as HTMLTextAreaElement).value || '';
    if (!actualText.includes(message)) {
      const err = `Text verification failed. Expected '${message}', found '${actualText}'.`;
      logger.error(err);
      return {
        success: false,
        step: 'verify_text',
        message: err,
        dryRun,
        error: 'TEXT_VERIFICATION_FAILED',
        timestamp: Date.now(),
      };
    }

    // 6. Find Send Button
    const sendButton = this.findSendButton(doc);
    if (!sendButton) {
      const err = 'Could not find Claude Send button in DOM.';
      logger.error(err);
      return {
        success: false,
        step: 'click_send',
        message: err,
        dryRun,
        error: 'SEND_BUTTON_NOT_FOUND',
        timestamp: Date.now(),
      };
    }

    // 7. Check if Dry-Run
    if (dryRun) {
      logger.info(`[DRY-RUN] Verification complete. Message '${message}' ready in input. Send button found. NOT clicking.`);
      return {
        success: true,
        step: 'verify_text',
        message: `[DRY-RUN] Simulation successful. Input populated and Send button verified.`,
        dryRun: true,
        timestamp: Date.now(),
      };
    }

    // 8. Click Send Button
    sendButton.focus();
    sendButton.click();
    sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    // 9. Verify Submission (brief wait)
    await new Promise((resolve) => setTimeout(resolve, 500));

    logger.info('Message submitted successfully to Claude Web.');
    return {
      success: true,
      step: 'verify_submission',
      message: 'Message successfully sent and submitted.',
      dryRun: false,
      timestamp: Date.now(),
    };
  }
}
