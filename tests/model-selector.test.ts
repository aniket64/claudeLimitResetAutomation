import { describe, it, expect, beforeEach } from 'vitest';
import { ModelSelector } from '../src/claude/model-selector.js';
import { ClaudeDOM } from '../src/claude/claude-dom.js';

describe('ModelSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('correctly detects active model from trigger button text and aria-label', () => {
    document.body.innerHTML = `
      <button data-testid="model-selector-dropdown" aria-label="Selected model: Claude 3.5 Sonnet">
        <span>Claude 3.5 Sonnet</span>
      </button>
    `;
    expect(ModelSelector.getCurrentSelectedModel(document)).toBe('sonnet');

    document.body.innerHTML = `
      <button data-testid="model-selector-dropdown" aria-label="Selected model: Claude 3.5 Haiku">
        <span>Claude 3.5 Haiku</span>
      </button>
    `;
    expect(ModelSelector.getCurrentSelectedModel(document)).toBe('haiku');
  });

  it('returns immediately with success if Haiku is already selected', async () => {
    let clicked = false;
    document.body.innerHTML = `
      <button data-testid="model-selector-dropdown" aria-label="Claude 3.5 Haiku">
        <span>Claude 3.5 Haiku</span>
      </button>
    `;
    const btn = document.querySelector('button');
    btn?.addEventListener('click', () => {
      clicked = true;
    });

    const result = await ModelSelector.selectModel('haiku', document);
    expect(result.success).toBe(true);
    expect(result.model).toBe('haiku');
    expect(clicked).toBe(false); // No unnecessary dropdown open
  });

  it('opens menu and selects Haiku when Sonnet is currently active', async () => {
    document.body.innerHTML = `
      <button data-testid="model-selector-dropdown" aria-label="Claude 3.5 Sonnet">
        <span>Claude 3.5 Sonnet</span>
      </button>
      <div role="menu" style="display:none;">
        <div role="menuitem" data-testid="model-sonnet">Claude 3.5 Sonnet</div>
        <div role="menuitem" data-testid="model-haiku">Claude 3.5 Haiku</div>
      </div>
    `;

    const triggerBtn = document.querySelector('button')!;
    const menu = document.querySelector('div[role="menu"]') as HTMLElement;
    const haikuItem = document.querySelector('[data-testid="model-haiku"]') as HTMLElement;

    // Simulate dropdown open on trigger click
    triggerBtn.addEventListener('click', () => {
      menu.style.display = 'block';
    });

    // Simulate selection on option click
    haikuItem.addEventListener('click', () => {
      triggerBtn.innerHTML = '<span>Claude 3.5 Haiku</span>';
      triggerBtn.setAttribute('aria-label', 'Claude 3.5 Haiku');
      menu.style.display = 'none';
    });

    const result = await ModelSelector.selectModel('haiku', document);
    expect(result.success).toBe(true);
    expect(result.model).toBe('haiku');
    expect(ModelSelector.getCurrentSelectedModel(document)).toBe('haiku');
  });

  it('handles multiple Haiku variants dynamically selecting the latest version', async () => {
    document.body.innerHTML = `
      <button data-testid="model-selector-dropdown">Claude 3.5 Sonnet</button>
      <div role="menu">
        <div role="menuitem">Claude 3 Haiku</div>
        <div role="menuitem">Claude 3.5 Haiku</div>
        <div role="menuitem">Claude 3.7 Haiku</div>
      </div>
    `;

    const option = ModelSelector.findHaikuOptionInMenu(document);
    expect(option).not.toBeNull();
    expect(option?.textContent).toContain('3.7 Haiku');
  });

  it('fails safely if model selector trigger is missing', async () => {
    document.body.innerHTML = `<div>No model selector</div>`;
    const result = await ModelSelector.selectModel('haiku', document);
    expect(result.success).toBe(false);
    expect(result.error).toContain('MODEL_SELECTOR_NOT_FOUND');
  });

  it('fails safely if Haiku option is not available on the current account/plan', async () => {
    document.body.innerHTML = `
      <button data-testid="model-selector-dropdown">Claude 3.5 Sonnet</button>
      <div role="menu">
        <div role="menuitem">Claude 3.5 Sonnet</div>
        <div role="menuitem">Claude 3.5 Opus</div>
      </div>
    `;

    const result = await ModelSelector.selectModel('haiku', document);
    expect(result.success).toBe(false);
    expect(result.error).toContain('HAIKU_NOT_AVAILABLE');
  });

  it('aborts message send if Haiku selection fails in ClaudeDOM.executeSendWorkflow', async () => {
    document.body.innerHTML = `
      <div data-testid="user-menu-button">Profile</div>
      <!-- Model selector with only Sonnet available -->
      <button data-testid="model-selector-dropdown">Claude 3.5 Sonnet</button>
      <div role="menu">
        <div role="menuitem">Claude 3.5 Sonnet</div>
      </div>
      <div contenteditable="true" role="textbox"></div>
      <button aria-label="Send message">Send</button>
    `;

    const result = await ClaudeDOM.executeSendWorkflow('Test message', 'haiku', false, document);
    expect(result.success).toBe(false);
    expect(result.step).toBe('select_model');
    expect(result.error).toContain('HAIKU_NOT_AVAILABLE');
    // Verify text was NOT inserted into composer
    expect(document.querySelector('[contenteditable="true"]')?.textContent).toBe('');
  });
});
