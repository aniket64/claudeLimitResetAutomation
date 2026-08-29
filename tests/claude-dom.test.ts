import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeDOM } from '../src/claude/claude-dom.js';

describe('ClaudeDOM', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detects logged out state', () => {
    document.body.innerHTML = `
      <div>
        <a href="/login">Log in</a>
      </div>
    `;
    expect(ClaudeDOM.isLoggedOut(document)).toBe(true);
    expect(ClaudeDOM.isLoggedIn(document)).toBe(false);
  });

  it('detects logged in state', () => {
    document.body.innerHTML = `
      <div data-testid="user-menu-button">User Profile</div>
      <div contenteditable="true" role="textbox"></div>
    `;
    expect(ClaudeDOM.isLoggedOut(document)).toBe(false);
    expect(ClaudeDOM.isLoggedIn(document)).toBe(true);
  });

  it('detects when Claude is actively generating a response', () => {
    document.body.innerHTML = `
      <button aria-label="Stop Response">Stop</button>
    `;
    expect(ClaudeDOM.isGenerating(document)).toBe(true);
  });

  it('locates contenteditable chat input and inserts message', () => {
    document.body.innerHTML = `
      <div contenteditable="true" role="textbox" class="ProseMirror"></div>
    `;
    const input = ClaudeDOM.findChatInputElement(document);
    expect(input).not.toBeNull();

    const success = ClaudeDOM.insertTextIntoInput(input!, 'Hello Claude!');
    expect(success).toBe(true);
    expect(input?.textContent).toContain('Hello Claude!');
  });

  it('locates textarea fallback and inserts message', () => {
    document.body.innerHTML = `
      <textarea data-testid="chat-input"></textarea>
    `;
    const input = ClaudeDOM.findChatInputElement(document);
    expect(input).not.toBeNull();

    const success = ClaudeDOM.insertTextIntoInput(input!, 'Hello Textarea!');
    expect(success).toBe(true);
    expect((input as HTMLTextAreaElement).value).toBe('Hello Textarea!');
  });

  it('executes dry-run workflow without clicking send button', async () => {
    let sendClicked = false;
    document.body.innerHTML = `
      <div data-testid="user-menu-button">Profile</div>
      <div contenteditable="true" role="textbox"></div>
      <button aria-label="Send message">Send</button>
    `;

    const sendBtn = document.querySelector('button[aria-label="Send message"]');
    sendBtn?.addEventListener('click', () => {
      sendClicked = true;
    });

    const result = await ClaudeDOM.executeSendWorkflow('Test message', 'default', true, document);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(sendClicked).toBe(false); // Must NOT click in dry run
    expect(document.querySelector('[contenteditable="true"]')?.textContent).toContain('Test message');
  });

  it('executes live send workflow and clicks send button', async () => {
    let sendClicked = false;
    document.body.innerHTML = `
      <div data-testid="user-menu-button">Profile</div>
      <div contenteditable="true" role="textbox"></div>
      <button aria-label="Send message">Send</button>
    `;

    const sendBtn = document.querySelector('button[aria-label="Send message"]');
    sendBtn?.addEventListener('click', () => {
      sendClicked = true;
    });

    const result = await ClaudeDOM.executeSendWorkflow('Live prompt', 'default', false, document);

    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(false);
    expect(sendClicked).toBe(true);
  });

  it('handles missing input safely', async () => {
    document.body.innerHTML = `
      <div data-testid="user-menu-button">Profile</div>
      <!-- No input present -->
    `;

    const result = await ClaudeDOM.executeSendWorkflow('Test', 'default', false, document);
    expect(result.success).toBe(false);
    expect(result.error).toBe('INPUT_NOT_FOUND');
  });
});
