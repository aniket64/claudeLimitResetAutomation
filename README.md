# Claude Web 5-Hour Reset Automation for Safari on macOS

A robust, local, privacy-respecting automation engineered specifically for **Claude Web on macOS Safari**. It continuously tracks your Claude 5-hour usage limit, accurately detects when your session window resets using multi-signal verification (rather than blindly assuming a static 5-hour timer), and automatically dispatches a pre-configured prompt message into Claude Web.

---

## Architecture Overview

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        macOS Safari Environment                        │
│                                                                        │
│   ┌──────────────────────────┐         ┌───────────────────────────┐   │
│   │     Claude Web Page      │         │   Safari Web Extension    │   │
│   │   (https://claude.ai)    │         │       (MV3 Bundle)        │   │
│   │                          │         │                           │   │
│   │  • Main-World Stream     │  Events │  • Popup Dashboard        │   │
│   │    Watcher               │────────▶│    (Interactive UI)       │   │
│   │  • Content Script        │         │  • Background Worker      │   │
│   │    Proxy Fetch (Cookies) │◀────────│  • Alarms & Scheduler     │   │
│   │  • DOM Interactor        │ IPC Msg │  • Multi-Signal Detector  │   │
│   │    (Lexical/ProseMirror) │         │  • State Persistence      │   │
│   └──────────────────────────┘         └───────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Optional Local Bridge)
┌────────────────────────────────────────────────────────────────────────┐
│               macOS CLI & Companion Controller (Node.js)               │
│                                                                        │
│   • Headless status inspection (`claude-reset status`)                 │
│   • Configuration manager (`claude-reset config`)                      │
│   • AppleScript Safari controller (`claude-reset test`)                │
│   • Sleep/Wake clock compensation & persistent file storage            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

1. **Multi-Signal Reset Detection (Not Just a Fixed Timer)**:
   - Reads exact reset ISO timestamp from Claude API (`/api/organizations/${orgId}/usage`).
   - Tracks session utilization percentage drops (e.g. 100% $\to$ 0%).
   - Detects forward-advancing 5-hour session windows.
   - Includes stabilization delays and re-verification before declaring `RESET_CONFIRMED`.
2. **Duplicate Prevention & Idempotency**:
   - Maintains persistent state records (`lastConfirmedReset`, `history`, `isSending` atomic lock).
   - Eliminates duplicate sends caused by browser refreshes, extension restarts, wake from sleep, or tab switching.
3. **Selector-Resilient DOM Engine**:
   - Works across Claude's ProseMirror / Lexical rich-text editor (`div[contenteditable="true"]`, `div[role="textbox"]`, `.ProseMirror`) and fallback textareas.
   - Dispatches synthetic `beforeinput`, `input`, and `change` events with DOM text content verification.
   - Accurately targets the Send button using semantic accessibility attributes (`aria-label="Send message"`, `data-testid="send-button"`).
4. **Safe Dry-Run & Test Modes**:
   - **Dry-Run Mode (`DRY_RUN = true`)**: Simulates the full workflow (detects reset, focuses Claude tab, enters message into chat input, verifies text in DOM, verifies send button is active, but **does not click send**).
   - **Run Test Now (Interactive & Live Send)**: Allows testing the DOM typing and submission workflow on demand with a single click.
5. **Safari MV3 Authentication Scoping (Proxy Architecture)**:
   - Avoids Safari MV3 service worker 403 cookie issues by routing credentialed API calls through the same-origin content script.
6. **Mac Sleep/Wake & Lifecycle Resilience**:
   - Compensates for clock drift and suspended timers when the Mac sleeps by reconciling elapsed time upon wake.
7. **Zero Remote Servers (100% Local & Private)**:
   - No analytics, no telemetry, no cloud servers, no credential harvesting. All state stays on your local Mac.

---

## Directory Structure

```text
claudeLimitResetAutomation/
├── src/
│   ├── background/
│   │   └── service-worker.ts      # Extension background worker, alarms, and lifecycle
│   ├── claude/
│   │   └── claude-dom.ts          # Resilient DOM selectors, input typing, and verification
│   ├── cli/
│   │   └── index.ts               # macOS terminal CLI controller and AppleScript bridge
│   ├── config/
│   │   └── defaults.ts            # Configuration constants and endpoint definitions
│   ├── content/
│   │   ├── content-script.ts      # Injected script for proxy fetch & DOM manipulation
│   │   └── injections/
│   │       └── stream-watcher.ts  # Main-world fetch stream listener
│   ├── logging/
│   │   └── logger.ts              # Multi-level structured logger (DEBUG, INFO, WARN, ERROR)
│   ├── notifications/
│   │   └── notifier.ts            # In-page toast and desktop notifications
│   ├── reset/
│   │   └── reset-detector.ts      # Multi-signal reset confirmation engine
│   ├── scheduler/
│   │   └── scheduler.ts           # State machine, polling scheduler, and retry backoff
│   ├── state/
│   │   └── state-manager.ts       # Atomic lock manager and persistent storage adapter
│   ├── types/
│   │   └── index.ts               # Normalized TypeScript data contracts
│   ├── ui/
│   │   ├── popup.html             # Glassmorphic dashboard popup interface
│   │   ├── popup.ts               # UI controller and live countdown ticker
│   │   └── styles.css             # Native macOS dark/light mode styles
│   └── manifest.json              # Safari Web Extension MV3 manifest
├── tests/
│   ├── claude-dom.test.ts         # DOM typing, send button, and dry-run tests
│   ├── reset-detector.test.ts     # Multi-signal reset detection tests
│   ├── scheduler.test.ts          # Scheduler, state machine, and auto-send tests
│   ├── state-manager.test.ts      # Idempotency, persistence, and lock tests
│   └── usage-parser.test.ts       # API limits array and scraper tests
├── scripts/
│   └── build-bundle.mjs           # Extension packager and asset copier
├── dist/                          # Compiled extension bundle ready for Safari
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Quick Start & Installation

### 1. Build the Extension Bundle

```bash
# Install dependencies
npm install

# Build TypeScript and package the extension to dist/
npm run build

# Run full automated test suite (28 tests)
npm test
```

### 2. Enable Developer Extensions in Safari

1. Open **Safari** on your Mac.
2. Go to **Safari** $\to$ **Settings...** (or press `Cmd + ,`).
3. Click the **Advanced** tab.
4. Check **"Show features for web developers"** (or **"Show Develop menu in menu bar"**).
5. In the menu bar at the top of your screen, click **Develop** $\to$ **Allow Unsigned Extensions** (enter your Mac password if prompted).

### 3. Load the Extension into Safari

You can load the compiled extension located in the `dist/` directory:

#### Method A: Using Safari Web Extension Developer Mode
1. In Safari, go to **Develop** $\to$ **Web Extension Background Pages** or load the folder `dist/` via Xcode command-line tools / Safari Extension Builder.

#### Method B: Using Safari Extension Companion (Stay / Userscripts / Xcode)
If you already use an extension manager or Xcode:
- Point Xcode / Extension converter to the `dist/` folder:
  ```bash
  xcrun safari-web-extension-converter ./dist
  ```
- Or run the CLI helper alongside Safari:
  ```bash
  npm run cli status
  ```

---

## Configuration Options

Open the Extension Popup in Safari or use the CLI to adjust configuration:

| Setting | Default | Description |
| :--- | :--- | :--- |
| `enabled` | `true` | Master ON/OFF toggle switch for automation. |
| `message` | `"Hi"` | Predefined message to send to Claude Web after reset. |
| `checkIntervalSec` | `60` | Polling check interval in seconds (15s, 30s, 60s, 120s, 300s). |
| `autoSendAfterReset` | `true` | Whether to automatically submit the prompt after reset. |
| `dryRun` | `false` | When `true`, simulates detection & input typing **without clicking Send**. |
| `desktopNotifications`| `true` | Shows desktop / in-page alert when reset is detected and message sent. |
| `debugLogging` | `true` | Enables verbose structured logging in popup & console. |

---

## Testing & Dry-Run Verification

### Testing via the Safari Popup Interface
1. Click the **Claude Reset Automation** icon in the Safari toolbar.
2. Click **"🧪 Test (Dry-Run)"**:
   - Automatically locates your active Claude tab.
   - Enters the configured message into the Claude chat input.
   - Verifies text in the DOM and checks that the Send button is ready.
   - **Does NOT click send.**
3. Click **"⚡ Test (Live Send)"**:
   - Confirms with a prompt, types the message into Claude Web, and clicks the Send button.

### Testing via macOS Terminal CLI
```bash
# Check current automation state and countdown
npm run cli status

# Update configuration
node dist/cli/index.js config message "Good morning Claude!"
node dist/cli/index.js config dryRun true

# Run manual Dry-Run test against Safari
npm run cli test

# Run manual Live Send test against Safari
node dist/cli/index.js test --send
```

---

## How Reset Detection Works

```text
Fetch Usage via Content Script Proxy (/api/organizations/{org}/usage)
                           │
                           ▼
          Normalized Usage Object Generated:
          • usagePercent: 98%
          • resetTimestamp: "2026-08-30T04:30:00.000Z"
          • secondsUntilReset: 1240
                           │
                           ▼
          ResetDetector Evaluates Signals:
          ┌────────────────────────────────────────────────────────┐
          │ 1. Current Time >= Reset Timestamp?                    │
          │ 2. Reset Timestamp Advanced to New Window?             │
          │ 3. Usage Dropped from High % to 0%?                    │
          │ 4. Has this exact reset window already been processed? │
          └────────────────────────────────────────────────────────┘
                           │
                           ▼
          Is Reset Confirmed & Not Duplicate?
               ├── YES ──▶ Acquire Send Lock
               │            └── Stabilize (3s delay)
               │            └── Focus Claude Web Tab
               │            └── Insert Message (ProseMirror/Lexical)
               │            └── Verify Input Content in DOM
               │            └── Click Send (or skip if Dry-Run)
               │            └── Record in Persistent History
               │            └── Release Send Lock
               │
               └── NO  ──▶ Calculate Next Check Interval
                            └── Schedule Next Polling Alarm
```

---

## Troubleshooting & FAQ

### 1. "Claude login required" Status
- **Cause**: The user is currently logged out of Claude Web or the session cookie has expired.
- **Solution**: Open `https://claude.ai` in Safari and log in. The extension will automatically detect the active login on its next check.

### 2. "No Claude tab found"
- **Cause**: No open `https://claude.ai` tab is present in Safari.
- **Solution**: Keep at least one tab with `https://claude.ai` open in Safari (it can be in the background or pinned).

### 3. Mac Woke Up From Sleep
- **Behavior**: The automation listens for system wake events and immediately checks the Claude usage API to see if the reset window elapsed while the laptop was closed.

### 4. Duplicate Sends Prevented
- **Behavior**: The extension compares the reset timestamp against `lastConfirmedReset` and its persistent history log. Even if the browser reloads 50 times, the message is sent **only once** per 5-hour reset window.

---

## License

MIT License. Designed for local developer automation.
