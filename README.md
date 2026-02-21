# SyncTabs — Cross-Browser Tab Sync

> See and switch to every open tab across all your Chromium browsers — from one place, in real time.

![Version](https://img.shields.io/badge/version-1.0.0-blue) ![MV3](https://img.shields.io/badge/Manifest-V3-green) ![Platforms](https://img.shields.io/badge/companion-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen) ![Browsers](https://img.shields.io/badge/browsers-Chrome%20%7C%20Edge%20%7C%20Brave%20%7C%20Opera-blueviolet)

---

## What It Does

Install SyncTabs in every Chromium browser you use. The popup instantly shows:

- **Your current browser's tabs** — all windows, all tabs, with favicons
- **Every other browser's tabs** — grouped by browser name
- **Tabs from closed browsers** — their last session is always visible
- **One click** on any remote tab opens it in your current browser

No account. No cloud. No subscription. Everything stays on your machine.

---

## Two Modes

| Feature | Local Mode *(default, zero setup)* | Sync Mode *(with Companion app)* |
|---------|:---:|:---:|
| View & switch your own tabs | ✅ | ✅ |
| Tabs survive browser close | ✅ | ✅ |
| Tabs grouped by window | ✅ | ✅ |
| Active + pinned tab indicators | ✅ | ✅ |
| **See tabs from other browsers** | ❌ | ✅ |
| **Real-time sync across browsers** | ❌ | ✅ |
| **"Last seen" for offline browsers** | ❌ | ✅ |
| **Click to open remote tab here** | ❌ | ✅ |

---

## Quick Start

### Step 1 — Install the Extension (in each browser)

**From browser stores** *(recommended — auto-updates)*

| Browser | Store |
|---------|-------|
| Google Chrome | [Chrome Web Store](#) *(coming soon)* |
| Microsoft Edge | [Edge Add-ons](#) *(coming soon)* |
| Brave / Vivaldi / Opera | Use the Chrome Web Store link |

**Or sideload manually** (no store needed):

1. Download this repo → unzip
2. Go to `chrome://extensions` in your browser
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `extension/` folder
5. Pin the SyncTabs icon to your toolbar

> Repeat in every browser where you want tabs visible.

---

### Step 2 — Install the Companion App *(for cross-browser sync)*

The Companion is a lightweight background app (~10 MB). It runs a local WebSocket server on `localhost:9234`. It **never connects to the internet**.

**Download from [GitHub Releases](https://github.com/harshvasudeva/sync-it-up/releases/latest):**

| Platform | File |
|----------|------|
| Windows | `synctabs-companion-windows-amd64.exe` |
| macOS (Apple Silicon) | `synctabs-companion-darwin-arm64` |
| macOS (Intel) | `synctabs-companion-darwin-amd64` |
| Linux (x64) | `synctabs-companion-linux-amd64` |
| Linux (.deb) | `synctabs-companion_1.0.0_amd64.deb` |

#### Windows

1. Download `synctabs-companion-windows-amd64.exe`
2. Double-click to run — a tray icon appears in your taskbar
3. Right-click the tray icon → **Start with Windows** to auto-start on login

> Windows may show a SmartScreen warning on first run (unsigned binary). Click **More info → Run anyway**.

#### macOS

```bash
# Make executable
chmod +x synctabs-companion-darwin-arm64

# Remove quarantine (required for unsigned apps)
xattr -d com.apple.quarantine synctabs-companion-darwin-arm64

# Run
./synctabs-companion-darwin-arm64
```

A tray icon appears in your menu bar. Right-click → **Start with Login** to auto-start.

#### Linux

```bash
# Option A: .deb package (Ubuntu/Debian)
sudo dpkg -i synctabs-companion_1.0.0_amd64.deb
synctabs-companion &

# Option B: Binary
chmod +x synctabs-companion-linux-amd64
./synctabs-companion-linux-amd64 &
```

---

### Alternative: Run Dev Server (for development)

If you're working on the extension or companion code, you can run the **Node.js development server** instead:

```bash
# Windows
start-server.bat

# macOS / Linux
./start-server.sh
```

This will:
1. Check for Node.js installation
2. Install dependencies (`npm install`)
3. Start the server on `localhost:9234`

Press **Ctrl+C** to stop.

> **Note:** The dev server is useful for development. For production use, download the compiled Go companion app from [GitHub Releases](https://github.com/harshvasudeva/sync-it-up/releases) instead.

---

### Step 3 — Grant Permission (one-time, per browser)

The extension needs permission to talk to `localhost:9234`:

1. Click the SyncTabs icon → open popup
2. Click **Settings** (gear icon)
3. Click **Grant localhost permission**
4. Confirm in the browser prompt

The extension auto-detects the Companion within a few seconds. The status dot turns **green**.

---

## Using SyncTabs

### Popup

Click the toolbar icon to open it.

- **Header** — your browser name · connection status dot (🟢 syncing · 🟡 offline/cached · ⚫ local only)
- **This Browser** — your current windows and tabs (collapsible)
- **Remote Browsers** — one card per other browser, with online/offline badge + last-seen time
- Click any remote tab to **open it here**
- Hover a remote tab for a **Send Tab** button (pushes it to that browser)

### Tray Icon (Companion)

Right-click the tray icon for:

| Menu Item | Action |
|-----------|--------|
| Status | Live count of connected browsers |
| Open Data Folder | Browse saved tab data |
| View Logs | Open log file in Notepad |
| Restart Server | Restart the WebSocket server |
| Start with Windows | Toggle auto-start on login |
| Settings... | Note: configure via extension options |
| Quit | Stop the Companion |

### Settings (Extension)

Open via gear icon in the popup, or right-click toolbar icon → **Options**.

- Enable / disable sync
- Server URL (default `ws://127.0.0.1:9234`)
- Grant localhost permission
- Test Connection
- Clear cached remote tab data

---

## How It Works

```
 Browser A (Chrome)          SyncTabs Companion           Browser B (Edge)
 ┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
 │  Extension      │◄───WS───│  localhost:9234   │───WS───►│  Extension      │
 │  (background.js)│         │                  │         │  (background.js)│
 └─────────────────┘         │  tabs.json       │         └─────────────────┘
                              │  (persists last  │
 Browser C (Brave)            │   session even   │
 ┌─────────────────┐         │   when closed)   │
 │  Extension      │◄───WS───│                  │
 └─────────────────┘         └──────────────────┘
```

- Each browser extension maintains a WebSocket connection to the Companion
- Tab changes are pushed in real-time to all other connected browsers
- The Companion persists tab data so closed-browser sessions remain visible
- Everything is `127.0.0.1` only — nothing leaves your machine

---

## Privacy & Permissions

| Permission | Why |
|------------|-----|
| `tabs` | Read your open tabs to display them |
| `storage` | Save tab snapshots locally |
| `alarms` | Periodic heartbeat to stay connected |
| `http://127.0.0.1:9234/*` | **Optional** — only when sync is enabled |

Full details: [PRIVACY.md](PRIVACY.md)

---

## Troubleshooting

**Status dot is grey (LOCAL mode)**
No Companion running. Install and start it, then grant localhost permission in the extension settings.

**Status dot is yellow (offline/cached)**
Companion was detected before but is not running now. Start the Companion and click **Test Connection** in settings.

**Companion shows SmartScreen warning (Windows)**
The binary is unsigned. Click **More info → Run anyway**. The source code is fully public for review.

**Extension shows wrong browser name (e.g. "Google Chrome" for Brave)**
Browser detection uses the user-agent. Some browsers hide their identity. Each browser still has a unique ID and syncs correctly.

**Port 9234 already in use**
Another app is using the port. Edit `%APPDATA%\SyncTabs\config.json` and change the `port` value. Set the same value in extension Settings → Server URL.

**Tabs not updating in real time**
Chromium service workers can be suspended when idle. The extension reconnects automatically. If tabs seem stale, click the refresh button in the popup.

---

## Data & Storage

The Companion stores data at:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\SyncTabs\data\` |
| macOS | `~/Library/Application Support/SyncTabs/data/` |
| Linux | `~/.local/share/SyncTabs/data/` |

Files:
- `tabs.json` — last known tabs for each browser
- `pending-tabs.json` — tabs queued for offline delivery
- `synctabs-companion.log` — application log
- `../config.json` — port, log level, data folder, auto-start

---

## Project Structure

```
Extension-synctabs/
├── extension/              # Browser extension (all browsers)
│   ├── manifest.json
│   ├── background.js       # Service worker: tab monitoring + WebSocket
│   ├── popup.html/js/css   # Main UI
│   ├── options.html/js     # Settings page
│   └── icons/
├── companion/              # Go companion app (replaces old Node.js server)
│   ├── main.go
│   ├── config/             # Config loading + persistence
│   ├── server/             # WebSocket + HTTP server
│   ├── tray/               # System tray icon + menu
│   ├── startup/            # OS auto-start registration
│   └── logger/
├── PRIVACY.md
└── README.md
```

---

## Building from Source

Requires [Go 1.21+](https://go.dev/dl/).

```bash
cd companion

# Windows
GOOS=windows GOARCH=amd64 go build -ldflags "-H windowsgui" -o synctabs-companion-windows-amd64.exe .

# macOS (Apple Silicon)
GOOS=darwin GOARCH=arm64 go build -o synctabs-companion-darwin-arm64 .

# macOS (Intel)
GOOS=darwin GOARCH=amd64 go build -o synctabs-companion-darwin-amd64 .

# Linux
GOOS=linux GOARCH=amd64 go build -o synctabs-companion-linux-amd64 .
```

> macOS and Linux builds require CGo and must be compiled on the target OS (or via GitHub Actions).

---

## License

MIT — see [LICENSE](LICENSE)

---

*Developed by [Harsh Vasudeva](https://github.com/harshvasudeva)*
