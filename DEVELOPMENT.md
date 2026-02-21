# Development Guide — SyncTabs

This guide covers building, developing, and contributing to SyncTabs.

---

## Icon Generation

### Overview
Two scripts generate the browser extension icon (sync arrows) in multiple sizes:

| Script | Dependencies | Output | Use Case |
|--------|-------------|--------|----------|
| `generate-icons.js` | `canvas` npm package | PNG files | Faster, higher quality, recommended |
| `create-icons.js` | None (pure Node.js) | PNG files | Zero dependencies, offline-friendly |

Both create the same icon in 3 sizes:
- `icon16.png` — Browser toolbar icon
- `icon48.png` — Extension popup icon
- `icon128.png` — Chrome Web Store listing

### Running Icon Generation

#### Using `generate-icons.js` (recommended)
```bash
npm install canvas
node generate-icons.js
```

**Pros:**
- Faster rendering
- Better anti-aliasing
- Uses standard canvas API

**Cons:**
- Requires `canvas` package (native dependencies)

#### Using `create-icons.js` (zero dependencies)
```bash
node create-icons.js
```

**Pros:**
- No npm dependencies
- Works offline
- Manual PNG encoding (educational)

**Cons:**
- Slower
- Less anti-aliasing

### Icon Design
Both scripts create a **sync-arrows icon**:
- **Background:** Dark navy rounded square
- **Ring:** Two blue arc segments with 2 arrowheads pointing clockwise
- **Colors:**
  - Background: `#1a1b26` (dark navy)
  - Accent: `#7aa2f7` (bright blue)

Generated files are output to: `extension/icons/`

---

## Packing the Extension (.crx)

### What is .crx?
A `.crx` file is a signed, packaged Chrome extension that can be installed directly without needing the source folder.

**When to use:**
- ✅ Distributing to specific users
- ✅ Self-hosted updates
- ✅ Pre-release testing
- ❌ NOT for Chrome Web Store (submit `extension/` folder)

### Create a .crx Package

#### Windows
```batch
pack-extension.bat
```

#### macOS / Linux
```bash
chmod +x pack-extension.sh
./pack-extension.sh
```

**Requirements:**
- `extension.pem` file (your private key — stored locally, never in git)
- Chrome or Chromium installed

**Output:**
```
dist/synctabs-extension.crx
```

### Installation Options

**Option 1: Drag & Drop**
```
Drag dist/synctabs-extension.crx into chrome://extensions/
```

**Option 2: Manual Install**
```
chrome://extensions/ → Load unpacked → select extension/ folder
```

**Option 3: Chrome Web Store**
```
Submit extension/ folder directly (no .crx needed)
```

### Generate Your .pem Key

If you don't have `extension.pem`:

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Pack extension**
4. Select the `extension/` folder
5. Leave "Private key file" blank for first time
6. Chrome generates `extension.crx` + `extension.pem`
7. Save the `.pem` file locally (keep it safe!)

### Security Notes

- ✅ Keep `extension.pem` on your machine only
- ✅ Added to `.gitignore` (already configured)
- ❌ Never commit to git
- ❌ Never share publicly
- If compromised, generate a new key (old extension ID becomes invalid)

---

## Building the Companion App

### Prerequisites
- **Go 1.21+** — [Download](https://golang.org/dl)
- **Platform-specific:**
  - **Windows:** No extra tools needed
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** GTK 3 dev libraries (`sudo apt-get install libgtk-3-dev libayatana-appindicator3-dev`)

### Build All Platforms

```bash
# Windows (from Windows)
cd companion
go build -ldflags "-H windowsgui -X github.com/harshvasudeva/synctabs-companion/config.AppVersion=1.0.0" -o synctabs-companion-windows-amd64.exe .

# macOS arm64 (Apple Silicon)
GOARCH=arm64 CGO_ENABLED=1 go build -ldflags "-X github.com/harshvasudeva/synctabs-companion/config.AppVersion=1.0.0" -o synctabs-companion-darwin-arm64 .

# macOS amd64 (Intel)
GOARCH=amd64 CGO_ENABLED=1 go build -ldflags "-X github.com/harshvasudeva/synctabs-companion/config.AppVersion=1.0.0" -o synctabs-companion-darwin-amd64 .

# Linux
go build -ldflags "-X github.com/harshvasudeva/synctabs-companion/config.AppVersion=1.0.0" -o synctabs-companion-linux-amd64 .
```

Or use the **GitHub Actions workflow** (automatic on tag push):
```bash
git tag -a v1.0.1 -m "Release message"
git push origin v1.0.1
```

This triggers `.github/workflows/release.yml` which builds all platforms and creates a GitHub Release.

---

## Project Structure

```
synctabs/
│
├── extension/                    # Chrome extension (Manifest V3)
│   ├── manifest.json            # Extension configuration
│   ├── background.js            # Service worker (tab monitoring)
│   ├── popup.js/html/css        # Extension popup
│   ├── options.js/html          # Settings page
│   ├── onboarding.html          # First-run intro
│   └── icons/                   # Generated icons (icon16, icon48, icon128)
│
├── companion/                    # Go companion app (WebSocket server)
│   ├── main.go                  # Entry point
│   ├── dialog_windows.go        # Windows dialogs (build tag: windows)
│   ├── dialog_other.go          # macOS/Linux fallback (build tag: !windows)
│   │
│   ├── tray/                    # System tray integration
│   │   ├── tray.go              # Cross-platform logic
│   │   ├── tray_windows.go      # Windows UI (explorer, notepad)
│   │   ├── tray_darwin.go       # macOS UI (Finder, AppleScript)
│   │   ├── tray_linux.go        # Linux UI (xdg-open, notify-send)
│   │   ├── icons.go             # Embedded tray icons
│   │   ├── icon_connected.ico   # Green tray icon
│   │   └── icon_disconnected.ico # Gray tray icon
│   │
│   ├── startup/                 # Auto-start on login
│   │   ├── startup.go           # Interface
│   │   ├── startup_windows.go   # Registry: HKCU\Run
│   │   ├── startup_darwin.go    # launchd plist
│   │   └── startup_linux.go     # XDG desktop entry
│   │
│   ├── server/                  # WebSocket server
│   │   ├── server.go            # HTTP/WS routes
│   │   ├── ws_handler.go        # Message handling
│   │   ├── state.go             # Tab state management
│   │   ├── data/                # Persistent storage
│   │   │   ├── tabs.json        # Browser tabs snapshot
│   │   │   └── pending-tabs.json # Queued messages
│   │
│   ├── config/                  # Configuration
│   ├── logger/                  # Logging utility
│   ├── go.mod & go.sum          # Dependencies
│   └── dist/                    # Build output directory
│
├── server/                       # Node.js dev server (legacy)
│   ├── server.js                # Express + WebSocket
│   ├── package.json             # Dependencies
│   ├── data/                    # Tab storage
│   └── node_modules/
│
├── .github/workflows/
│   └── release.yml              # CI/CD: build & release on tag push
│
├── generate-icons.js            # Icon generator (with `canvas` package)
├── create-icons.js              # Icon generator (pure Node.js)
├── start-server.bat             # Dev server launcher (Windows)
├── start-server.sh              # Dev server launcher (Unix)
│
├── README.md                    # User documentation
├── DEVELOPMENT.md               # This file
├── PRIVACY.md                   # Privacy statement
└── .gitignore                   # Excludes: *.pem, node_modules, binaries, etc.
```

---

## Key Technical Patterns

### Build Tags (Platform-Specific Code)
Go uses build tags to compile platform-specific files:

```go
//go:build windows
// +build windows

package mypackage

// Windows-only code here
```

Files included automatically:
- `startup_windows.go` → Windows builds only
- `startup_darwin.go` → macOS builds only
- `startup_linux.go` → Linux builds only
- `dialog_windows.go` → Windows builds only
- `dialog_other.go` → macOS/Linux builds only

### File Embedding
The companion app embeds binary files at compile time:

```go
//go:embed icon_connected.ico
var iconConnected []byte
```

This means:
- No separate icon files needed at runtime
- Icons are baked into the binary
- Binary size increases slightly (~1 KB per icon)

### WebSocket Server
The Go companion runs a localhost-only WebSocket server:

```go
// Listens on localhost:9234
// Protocol: JSON messages (tabs, sync commands)
// Security: localhost only, no cloud connection
```

### Cross-Platform Startup
Each OS has a different auto-start mechanism:

| OS | Method | Location |
|----|--------|----------|
| Windows | Registry | `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` |
| macOS | launchd | `~/Library/LaunchAgents/com.synctabs.companion.plist` |
| Linux | XDG | `~/.config/autostart/synctabs-companion.desktop` |

---

## Debugging

### View Logs
- **Windows:** `%APPDATA%\SyncTabs Companion\logs\synctabs.log`
- **macOS:** `~/Library/Application Support/SyncTabs Companion/logs/synctabs.log`
- **Linux:** `~/.local/share/synctabs-companion/logs/synctabs.log`

### Enable Debug Output
Set environment variable before running:
```bash
# Windows PowerShell
$env:DEBUG=1
./synctabs-companion-windows-amd64.exe

# Unix
DEBUG=1 ./synctabs-companion-linux-amd64
```

### Check WebSocket Connection
```bash
# Test localhost:9234 is responding
curl http://localhost:9234/health

# Should return: {"status":"ok"}
```

---

## Dependencies

### Extension
- **Manifest V3** — No external JS libraries
- Only uses native Chrome/Edge APIs

### Companion (Go)
- `fyne.io/systray@v1.11.0` — System tray (CGo required on macOS)
- `github.com/gorilla/websocket@v1.5.1` — WebSocket protocol
- `golang.org/x/sys@v0.15.0` — Windows registry access

### Dev Server (Node.js)
- `express` — HTTP server
- `ws` — WebSocket library
- `canvas` — Icon generation (optional)

---

## Security Considerations

### Extension Key (❌ Never Commit)
The `.pem` file is your **private extension signing key**:
- ✅ Excluded from git via `.gitignore`
- ✅ Stored locally only
- ❌ Never share or commit

If compromised, anyone could:
- Create fake "updates" to your extension
- Trick users into installing malicious versions
- Steal user data

### No Permissions Abuse
The extension requests **minimal permissions**:
- `tabs` — Read tab URLs and titles (required)
- `storage` — Save settings locally (required)
- No clipboard access, no file system access, no persistent cookies

### Localhost Only
The WebSocket server:
- ✅ Binds to `127.0.0.1:9234` (localhost only)
- ✅ Does not connect to the internet
- ✅ No data leaves the machine

---

## Contributing

1. **Fork** the repository
2. **Create a branch:** `git checkout -b feature/my-feature`
3. **Make changes** and test locally
4. **Commit:** Follow the commit message format
5. **Push** and open a Pull Request

### Commit Message Format
```
Type: Brief description

Longer explanation if needed.

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

**Types:**
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `refactor:` — Code cleanup
- `test:` — Tests
- `chore:` — Build, dependencies

---

## Future Enhancements

Planned features (not yet implemented):
- [ ] Chrome Web Store listing
- [ ] Microsoft Edge Add-ons listing
- [ ] Brave and other Chromium store listings
- [ ] Browser-specific tray icon menus
- [ ] Advanced sync filtering (tag-based groups)
- [ ] Tab search/filter in popup

---

## License & Credits

See the main repository for license and attribution.
