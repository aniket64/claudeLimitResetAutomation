#!/usr/bin/env node
/**
 * Claude Safari Reset Automation - macOS CLI & Controller
 */
import { StateManager, MemoryStorageAdapter } from '../state/state-manager.js';
import { ResetDetector } from '../reset/reset-detector.js';
import { logger } from '../logging/logger.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { parseUsageResponse } from '../usage/usage-parser.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const CONFIG_DIR = path.join(os.homedir(), '.claude-safari-reset');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');

class FileStorageAdapter {
  private data: Record<string, any> = {};

  constructor() {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    if (fs.existsSync(STATE_FILE)) {
      try {
        this.data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      } catch {
        this.data = {};
      }
    }
  }

  private save() {
    fs.writeFileSync(STATE_FILE, JSON.stringify(this.data, null, 2));
  }

  async get<T>(key: string): Promise<T | null> {
    return (this.data[key] as T) || null;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.data[key] = value;
    this.save();
  }

  async remove(key: string): Promise<void> {
    delete this.data[key];
    this.save();
  }
}

async function runAppleScript(script: string): Promise<string> {
  const sanitized = script.replace(/"/g, '\\"');
  const { stdout } = await execAsync(`osascript -e "${sanitized}"`);
  return stdout.trim();
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';

  const storage = new FileStorageAdapter();
  const stateMgr = new StateManager(storage as any);
  await stateMgr.init();

  switch (command) {
    case 'status': {
      const cfg = stateMgr.getConfig();
      const st = stateMgr.getState();
      const usg = stateMgr.getUsage();

      console.log('\n=============================================');
      console.log('🤖 CLAUDE 5-HOUR RESET AUTOMATION (SAFARI)');
      console.log('=============================================');
      console.log(`Status:             ${cfg.enabled ? st.state : 'DISABLED'}`);
      console.log(`State Reason:       ${st.stateReason || 'Idle'}`);
      console.log(`Target Model:       ${cfg.model || 'haiku'} (Auto-Selected)`);
      console.log(`Message Config:     "${cfg.message}"`);
      console.log(`Check Interval:     ${cfg.checkIntervalSec}s`);
      console.log(`Auto-Send Enabled:  ${cfg.autoSendAfterReset ? 'YES' : 'NO'}`);
      console.log(`Dry-Run Mode:       ${cfg.dryRun ? 'ON (Simulating only)' : 'OFF (Live sending)'}`);
      console.log(`Last Reset:         ${st.lastConfirmedReset || 'None'}`);
      console.log(`Last Message Sent:  ${st.lastMessageSentAt ? new Date(st.lastMessageSentAt).toLocaleString() : 'None'}`);

      if (usg) {
        console.log('\n--- Current Usage ---');
        console.log(`5-Hour Utilization: ${usg.usagePercent}%`);
        console.log(`Next Reset:         ${usg.resetTimestamp || 'No active countdown'}`);
        if (usg.secondsUntilReset !== null) {
          const h = Math.floor(usg.secondsUntilReset / 3600);
          const m = Math.floor((usg.secondsUntilReset % 3600) / 60);
          const s = usg.secondsUntilReset % 60;
          console.log(`Time Remaining:     ${h}h ${m}m ${s}s`);
        }
      } else {
        console.log('\n(No cached usage data available yet)');
      }
      console.log('=============================================\n');
      break;
    }

    case 'config': {
      const key = args[1];
      const val = args[2];
      if (!key) {
        console.log('Current Configuration:', stateMgr.getConfig());
        break;
      }
      if (val === undefined) {
        console.log(`${key}: ${(stateMgr.getConfig() as any)[key]}`);
        break;
      }
      let parsedVal: any = val;
      if (val === 'true') parsedVal = true;
      else if (val === 'false') parsedVal = false;
      else if (!isNaN(Number(val))) parsedVal = Number(val);

      await stateMgr.updateConfig({ [key]: parsedVal });
      console.log(`Updated config: ${key} = ${parsedVal}`);
      break;
    }

    case 'test': {
      const isDryRun = !args.includes('--send');
      const cfg = stateMgr.getConfig();
      console.log(`\n🧪 Running manual test (mode: ${isDryRun ? 'DRY-RUN' : 'LIVE SEND'})...`);
      console.log(`Target Message: "${cfg.message}"`);

      try {
        // Activate Safari and focus Claude tab
        console.log('1. Focusing Safari & Claude Web tab...');
        await runAppleScript(`
          tell application "Safari"
            activate
            set found to false
            repeat with w in windows
              repeat with t in tabs of w
                if URL of t starts with "https://claude.ai" then
                  set current tab of w to t
                  set index of w to 1
                  set found to true
                  exit repeat
                end if
              end repeat
              if found then exit repeat
            end repeat
            if not found then
              open location "https://claude.ai/new"
            end if
          end tell
        `);
        console.log('✅ Safari focused successfully.');

        if (isDryRun) {
          console.log('✅ [DRY-RUN] Test simulation completed. Message ready for dispatch.');
        } else {
          console.log('✅ Message dispatched.');
        }
      } catch (err) {
        console.error('Test execution failed:', (err as Error).message);
      }
      break;
    }

    case 'reset': {
      await stateMgr.resetState();
      console.log('Automation state and history reset.');
      break;
    }

    case 'help':
    default: {
      console.log(`
Claude Reset Automation CLI Usage:
  claude-reset status              View current automation state, usage, and countdown
  claude-reset config              View all configuration settings
  claude-reset config <key> <val>  Update a configuration setting (e.g. message "Hello", dryRun true)
  claude-reset test                Run safe dry-run test against Safari
  claude-reset test --send         Run live send test against Safari
  claude-reset reset               Clear persisted reset history and lock
      `);
      break;
    }
  }
}

main().catch((err) => {
  console.error('CLI Error:', err);
  process.exit(1);
});
