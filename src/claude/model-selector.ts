/**
 * Dedicated Claude Model Selector Module
 * Handles safe detection, dropdown opening, Haiku option selection, and post-selection verification.
 */
import { ModelSelectionResult, SupportedClaudeModel } from '../types/index.js';
import { logger } from '../logging/logger.js';

export const MODEL_SELECTORS = {
  // Trigger button selectors
  TRIGGER_BUTTONS: [
    'button[data-testid="model-selector-dropdown"]',
    'button[data-testid="model-selector"]',
    'button[aria-haspopup="menu"][aria-label*="model" i]',
    'button[aria-haspopup="menu"][aria-label*="Claude" i]',
    'button[aria-haspopup="listbox"]',
    'button[data-testid*="model-select" i]',
    'button[aria-label*="Sonnet" i]',
    'button[aria-label*="Haiku" i]',
    'button[aria-label*="Opus" i]',
  ],

  // Menu / Dropdown container selectors
  MENU_CONTAINERS: [
    '[role="menu"]',
    '[role="listbox"]',
    'div[data-radix-popper-content-wrapper]',
    'div[data-radix-menu-content]',
    'div[role="dialog"]',
    '.model-selector-menu',
  ],

  // Model option items
  MENU_ITEMS: [
    '[role="menuitem"]',
    '[role="option"]',
    'button[data-testid*="model"]',
    'div[data-testid*="model"]',
    'button',
  ],
};

export class ModelSelector {
  /**
   * Identifies the currently selected model by inspecting visible trigger buttons / labels.
   */
  public static getCurrentSelectedModel(doc: Document = document): string {
    const trigger = this.findModelSelectorButton(doc);
    if (!trigger) return 'unknown';

    const text = (trigger.textContent || '').toLowerCase();
    const ariaLabel = (trigger.getAttribute('aria-label') || '').toLowerCase();
    const combined = `${text} ${ariaLabel}`;

    if (combined.includes('haiku')) return 'haiku';
    if (combined.includes('sonnet')) return 'sonnet';
    if (combined.includes('opus')) return 'opus';

    return 'unknown';
  }

  /**
   * Finds the model selector dropdown trigger button in the DOM.
   */
  public static findModelSelectorButton(doc: Document = document): HTMLButtonElement | null {
    for (const selector of MODEL_SELECTORS.TRIGGER_BUTTONS) {
      try {
        const buttons = doc.querySelectorAll<HTMLButtonElement>(selector);
        for (const btn of buttons) {
          if (btn && !btn.disabled) {
            return btn;
          }
        }
      } catch {
        // ignore
      }
    }

    // Fallback: search buttons near composer or header that contain Claude model names
    const allButtons = doc.querySelectorAll<HTMLButtonElement>('button');
    for (const btn of allButtons) {
      const txt = (btn.textContent || '').toLowerCase();
      if ((txt.includes('claude') || txt.includes('sonnet') || txt.includes('haiku') || txt.includes('opus')) && !btn.disabled) {
        return btn;
      }
    }

    return null;
  }

  /**
   * Helper to extract numeric version from model label (e.g. "Claude 3.5 Haiku" -> 3.5)
   */
  private static extractModelVersion(text: string): number {
    const match = text.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 0;
  }

  /**
   * Finds the Haiku option in the open model dropdown menu.
   * Dynamically resolves the latest available Haiku variant (e.g. 3.7 > 3.5 > 3.0 > unversioned).
   */
  public static findHaikuOptionInMenu(doc: Document = document): HTMLElement | null {
    // 1. First look inside visible popup/menu containers
    for (const containerSelector of MODEL_SELECTORS.MENU_CONTAINERS) {
      try {
        const containers = doc.querySelectorAll<HTMLElement>(containerSelector);
        for (const container of containers) {
          const candidates = container.querySelectorAll<HTMLElement>(MODEL_SELECTORS.MENU_ITEMS.join(','));
          const haikuMatches: HTMLElement[] = [];

          for (const el of candidates) {
            const txt = (el.textContent || '').toLowerCase();
            const testId = (el.getAttribute('data-testid') || '').toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            if (txt.includes('haiku') || testId.includes('haiku') || ariaLabel.includes('haiku')) {
              haikuMatches.push(el);
            }
          }

          if (haikuMatches.length > 0) {
            // Sort dynamically by highest version number descending
            haikuMatches.sort((a, b) => {
              const vA = this.extractModelVersion(a.textContent || '');
              const vB = this.extractModelVersion(b.textContent || '');
              return vB - vA;
            });
            return haikuMatches[0];
          }
        }
      } catch {
        // ignore
      }
    }

    // 2. Fallback search across the full document
    const allElements = doc.querySelectorAll<HTMLElement>('[role="menuitem"], [role="option"], button, div');
    const matches: HTMLElement[] = [];
    for (const el of allElements) {
      const txt = (el.textContent || '').toLowerCase();
      const testId = (el.getAttribute('data-testid') || '').toLowerCase();
      if (
        (txt.includes('haiku') || testId.includes('haiku')) &&
        (el.offsetParent !== null || el.offsetParent === undefined)
      ) {
        matches.push(el);
      }
    }

    if (matches.length > 0) {
      matches.sort((a, b) => {
        const vA = this.extractModelVersion(a.textContent || '');
        const vB = this.extractModelVersion(b.textContent || '');
        return vB - vA;
      });
      return matches[0];
    }

    return null;
  }

  /**
   * Executes the full safe model selection workflow:
   * 1. Check if Haiku is already selected -> return immediately
   * 2. Open model selector dropdown
   * 3. Locate Haiku option
   * 4. Click Haiku
   * 5. Verify that Haiku is active in the DOM
   */
  public static async selectModel(
    targetModel: SupportedClaudeModel = 'haiku',
    doc: Document = document
  ): Promise<ModelSelectionResult> {
    const normalizedTarget = targetModel.toLowerCase();
    logger.info(`Initiating Claude model selection: target="${normalizedTarget}"...`);

    // 1. Check Current Model
    const currentModel = this.getCurrentSelectedModel(doc);
    logger.debug(`Currently active model detected as: "${currentModel}"`);

    if (currentModel === normalizedTarget) {
      logger.info(`Model "${normalizedTarget}" is already selected.`);
      return {
        success: true,
        model: normalizedTarget,
        previousModel: currentModel,
      };
    }

    // 2. Find Trigger Button
    const triggerBtn = this.findModelSelectorButton(doc);
    if (!triggerBtn) {
      const err = 'MODEL_SELECTOR_NOT_FOUND: Could not locate model dropdown trigger button in DOM.';
      logger.warn(err);
      return {
        success: false,
        model: currentModel,
        error: err,
        step: 'open_menu',
      };
    }

    // 3. Open Dropdown Menu
    logger.info('Opening Claude model selector dropdown menu...');
    triggerBtn.focus();
    triggerBtn.click();
    triggerBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Wait for dropdown animation
    await new Promise((r) => setTimeout(r, 400));

    // 4. Locate Target Model Option (e.g. Haiku)
    const haikuOption = this.findHaikuOptionInMenu(doc);
    if (!haikuOption) {
      const err = `HAIKU_NOT_AVAILABLE: Could not find "${normalizedTarget}" option in model dropdown.`;
      logger.error(err);
      // Close dropdown by pressing Escape or clicking outside
      triggerBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return {
        success: false,
        model: currentModel,
        error: err,
        step: 'select_option',
      };
    }

    const optionText = haikuOption.textContent?.trim() || 'Haiku';
    logger.info(`Found model option: "${optionText}". Selecting...`);

    // 5. Click Option
    haikuOption.focus();
    haikuOption.click();
    haikuOption.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Wait for state to settle
    await new Promise((r) => setTimeout(r, 400));

    // 6. Verify Selection
    const verifiedModel = this.getCurrentSelectedModel(doc);
    const triggerText = (this.findModelSelectorButton(doc)?.textContent || '').toLowerCase();

    if (verifiedModel === normalizedTarget || triggerText.includes(normalizedTarget)) {
      logger.info(`✅ Model successfully switched and verified: "${normalizedTarget}".`);
      return {
        success: true,
        model: normalizedTarget,
        previousModel: currentModel,
      };
    }

    const unverifiedErr = `MODEL_SELECTION_UNVERIFIED: Clicked "${optionText}" but verified model is "${verifiedModel}".`;
    logger.error(unverifiedErr);
    return {
      success: false,
      model: verifiedModel,
      previousModel: currentModel,
      error: unverifiedErr,
      step: 'verify',
    };
  }
}
