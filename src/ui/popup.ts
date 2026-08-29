/**
 * Popup Dashboard Controller
 */
import { AutomationConfig, LogEntry, NormalizedUsageState, PersistentState } from '../types/index.js';

let currentConfig: AutomationConfig | null = null;
let currentUsage: NormalizedUsageState | null = null;
let currentState: PersistentState | null = null;
let countdownTimer: ReturnType<typeof setInterval> | null = null;

// DOM Elements
const masterToggle = document.getElementById('master-toggle') as HTMLInputElement;
const statusDot = document.getElementById('status-dot') as HTMLElement;
const statusText = document.getElementById('status-text') as HTMLElement;
const usagePercent = document.getElementById('usage-percent') as HTMLElement;
const usageProgress = document.getElementById('usage-progress') as HTMLElement;
const weeklyPercent = document.getElementById('weekly-percent') as HTMLElement;
const nextResetCountdown = document.getElementById('next-reset-countdown') as HTMLElement;
const nextResetTime = document.getElementById('next-reset-time') as HTMLElement;
const lastResetTime = document.getElementById('last-reset-time') as HTMLElement;
const lastMessageStatus = document.getElementById('last-message-status') as HTMLElement;
const nextActionDesc = document.getElementById('next-action-desc') as HTMLElement;

// Form Inputs
const inputMessage = document.getElementById('config-message') as HTMLInputElement;
const selectModel = document.getElementById('config-model') as HTMLSelectElement;
const selectInterval = document.getElementById('config-interval') as HTMLSelectElement;
const checkAutoSend = document.getElementById('config-auto-send') as HTMLInputElement;
const checkDryRun = document.getElementById('config-dry-run') as HTMLInputElement;
const checkNotifications = document.getElementById('config-notifications') as HTMLInputElement;
const btnSaveSettings = document.getElementById('btn-save-settings') as HTMLButtonElement;

// Action Buttons
const btnTestDryRun = document.getElementById('btn-test-dryrun') as HTMLButtonElement;
const btnTestSend = document.getElementById('btn-test-send') as HTMLButtonElement;
const btnCheckNow = document.getElementById('btn-check-now') as HTMLButtonElement;
const btnToggleLogs = document.getElementById('btn-toggle-logs') as HTMLButtonElement;
const logsContainer = document.getElementById('logs-container') as HTMLElement;
const logsContent = document.getElementById('logs-content') as HTMLElement;
const btnClearLogs = document.getElementById('btn-clear-logs') as HTMLButtonElement;
const btnCloseLogs = document.getElementById('btn-close-logs') as HTMLButtonElement;

async function sendExtensionMessage<T = any>(message: any): Promise<T> {
  return new Promise((resolve, reject) => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
      reject(new Error('Extension runtime unavailable'));
      return;
    }
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

async function refreshStatus(): Promise<void> {
  try {
    const res = await sendExtensionMessage({ action: 'get_status' });
    if (res && res.success) {
      currentConfig = res.config;
      currentState = res.state;
      currentUsage = res.usage;
      renderUI();
      renderLogs(res.logs || []);
    }
  } catch (err) {
    statusText.textContent = 'ERROR';
    statusDot.className = 'status-dot error';
    nextActionDesc.textContent = 'Could not connect to extension background service worker.';
  }
}

function renderUI(): void {
  if (!currentConfig || !currentState) return;

  // Master switch & state
  masterToggle.checked = currentConfig.enabled;

  const stateStr = currentState.state || 'WAITING';
  statusText.textContent = currentConfig.enabled ? stateStr : 'DISABLED';

  statusDot.className = 'status-dot';
  if (!currentConfig.enabled) {
    statusDot.classList.add('disabled');
  } else if (stateStr === 'MESSAGE_SENT' || stateStr === 'ACTIVE') {
    statusDot.classList.add('active');
  } else if (stateStr === 'ERROR' || stateStr === 'LOGIN_REQUIRED') {
    statusDot.classList.add('error');
  } else {
    statusDot.classList.add('waiting');
  }

  // Next action description
  nextActionDesc.textContent = currentState.stateReason || 'Monitoring Claude reset schedule...';

  // Usage Cards
  if (currentUsage) {
    const pct = currentUsage.usagePercent ?? 0;
    usagePercent.textContent = `${pct}%`;
    usageProgress.style.width = `${pct}%`;

    const weeklyPct = currentUsage.allModelsPercent ?? 0;
    weeklyPercent.textContent = `${weeklyPct}%`;

    // Last Reset & Message info
    if (currentState.lastConfirmedReset) {
      const d = new Date(currentState.lastConfirmedReset);
      lastResetTime.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      lastResetTime.textContent = 'None yet';
    }

    if (currentState.lastMessageSentAt) {
      const msgTime = new Date(currentState.lastMessageSentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      lastMessageStatus.textContent = `Sent at ${msgTime}`;
    } else {
      lastMessageStatus.textContent = 'Idle';
    }
  }

  // Populate config fields
  inputMessage.value = currentConfig.message;
  selectModel.value = currentConfig.model || 'haiku';
  selectInterval.value = String(currentConfig.checkIntervalSec);
  checkAutoSend.checked = currentConfig.autoSendAfterReset;
  checkDryRun.checked = currentConfig.dryRun;
  checkNotifications.checked = currentConfig.desktopNotifications;

  updateCountdownDisplay();
}

function updateCountdownDisplay(): void {
  if (!currentUsage || !currentUsage.resetTimestamp) {
    nextResetCountdown.textContent = '--:--:--';
    nextResetTime.textContent = 'No active reset countdown';
    return;
  }

  const resetMs = new Date(currentUsage.resetTimestamp).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((resetMs - now) / 1000));

  if (diffSec <= 0) {
    nextResetCountdown.textContent = 'RESET READY';
    nextResetTime.textContent = 'Usage window reset eligible!';
    return;
  }

  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;

  nextResetCountdown.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const targetDate = new Date(resetMs);
  nextResetTime.textContent = `Resets at ${targetDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function renderLogs(logs: LogEntry[]): void {
  logsContent.innerHTML = '';
  if (!logs || logs.length === 0) {
    logsContent.innerHTML = '<div class="log-entry log-DEBUG">No activity logs recorded yet.</div>';
    return;
  }

  logs.slice(-50).forEach((entry) => {
    const row = document.createElement('div');
    row.className = `log-entry log-${entry.level}`;
    const timeStr = new Date(entry.timestamp).toLocaleTimeString();
    row.textContent = `[${timeStr}] ${entry.message}`;
    logsContent.appendChild(row);
  });

  logsContent.scrollTop = logsContent.scrollHeight;
}

// Event Listeners
masterToggle.addEventListener('change', async () => {
  const enabled = masterToggle.checked;
  await sendExtensionMessage({
    action: 'update_config',
    config: { enabled },
  });
  await refreshStatus();
});

btnSaveSettings.addEventListener('click', async () => {
  btnSaveSettings.textContent = 'Saving...';
  await sendExtensionMessage({
    action: 'update_config',
    config: {
      message: inputMessage.value.trim() || 'Hi',
      model: selectModel.value || 'haiku',
      checkIntervalSec: parseInt(selectInterval.value, 10) || 60,
      autoSendAfterReset: checkAutoSend.checked,
      dryRun: checkDryRun.checked,
      desktopNotifications: checkNotifications.checked,
    },
  });
  btnSaveSettings.textContent = 'Saved!';
  setTimeout(() => {
    btnSaveSettings.textContent = 'Save Settings';
  }, 1200);
  await refreshStatus();
});

btnTestDryRun.addEventListener('click', async () => {
  btnTestDryRun.disabled = true;
  btnTestDryRun.textContent = 'Running...';
  try {
    const res = await sendExtensionMessage({ action: 'run_test_now', mode: 'dry_run' });
    if (res?.success) {
      alert('Dry-run test succeeded! Chat input was populated and verified in Claude DOM.');
    } else {
      alert(`Dry-run test result: ${res?.result?.message || res?.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Error: ${(err as Error).message}`);
  } finally {
    btnTestDryRun.disabled = false;
    btnTestDryRun.textContent = '🧪 Test (Dry-Run)';
    await refreshStatus();
  }
});

btnTestSend.addEventListener('click', async () => {
  const confirmed = confirm(`Are you sure you want to immediately send "${inputMessage.value}" to your active Claude tab?`);
  if (!confirmed) return;

  btnTestSend.disabled = true;
  btnTestSend.textContent = 'Sending...';
  try {
    const res = await sendExtensionMessage({ action: 'run_test_now', mode: 'live_send' });
    if (res?.success) {
      alert(`Message "${inputMessage.value}" successfully submitted to Claude!`);
    } else {
      alert(`Send test failed: ${res?.result?.message || res?.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Error: ${(err as Error).message}`);
  } finally {
    btnTestSend.disabled = false;
    btnTestSend.textContent = '⚡ Test (Live Send)';
    await refreshStatus();
  }
});

btnCheckNow.addEventListener('click', async () => {
  btnCheckNow.textContent = 'Checking...';
  await sendExtensionMessage({ action: 'trigger_check', triggerReason: 'popup_manual_check' });
  await refreshStatus();
  btnCheckNow.textContent = '🔄 Check Now';
});

btnToggleLogs.addEventListener('click', () => {
  logsContainer.classList.toggle('hidden');
});

btnCloseLogs.addEventListener('click', () => {
  logsContainer.classList.add('hidden');
});

btnClearLogs.addEventListener('click', async () => {
  await sendExtensionMessage({ action: 'clear_logs' });
  renderLogs([]);
});

// Initialize Popup
refreshStatus();
countdownTimer = setInterval(() => {
  updateCountdownDisplay();
}, 1000);
