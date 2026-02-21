package tray

import (
	"fmt"
	"os/exec"
	"time"

	"fyne.io/systray"
	"github.com/harshvasudeva/synctabs-companion/config"
	"github.com/harshvasudeva/synctabs-companion/logger"
	"github.com/harshvasudeva/synctabs-companion/startup"
)

// ServerInterface avoids circular imports between tray and server packages.
type ServerInterface interface {
	ConnectedCount() int
	BrowserNames() []string
	Restart(cfg config.Config) error
	Stop()
}

var (
	mStatus    *systray.MenuItem
	mAutoStart *systray.MenuItem
	srv        ServerInterface
)

// Run initializes the tray and blocks until quit.
// MUST be called from the main goroutine on Windows.
func Run(s ServerInterface) {
	srv = s
	systray.Run(onReady, onExit)
}

func onReady() {
	systray.SetIcon(iconConnected)
	systray.SetTitle("SyncTabs Companion")
	systray.SetTooltip("SyncTabs Companion — Starting...")

	// Title (disabled)
	mTitle := systray.AddMenuItem("SyncTabs Companion", "SyncTabs Companion")
	mTitle.Disable()

	// Live status (disabled — just informational)
	mStatus = systray.AddMenuItem("● Starting...", "Server status")
	mStatus.Disable()

	systray.AddSeparator()

	mDataFolder := systray.AddMenuItem("Open Data Folder", "Open data folder in Explorer")
	mLogs := systray.AddMenuItem("View Logs", "Open log file in Notepad")
	mRestart := systray.AddMenuItem("Restart Server", "Restart the WebSocket server")

	systray.AddSeparator()

	mAutoStart = systray.AddMenuItem("Start with Windows", "Toggle Windows auto-start")
	if startup.IsRegistered() {
		mAutoStart.Check()
	}

	mSettings := systray.AddMenuItem("Settings...", "Configure via extension options")

	systray.AddSeparator()

	mQuit := systray.AddMenuItem("Quit", "Exit SyncTabs Companion")

	// Start status updater goroutine
	go statusUpdater()

	// Event loop
	go func() {
		for {
			select {
			case <-mDataFolder.ClickedCh:
				cfg := config.Get()
				openFolder(cfg.DataFolder)

			case <-mLogs.ClickedCh:
				openInNotepad(logger.LogPath())

			case <-mRestart.ClickedCh:
				go func() {
					mRestart.Disable()
					logger.Info("Tray: restart requested")
					cfg := config.Get()
					if err := srv.Restart(cfg); err != nil {
						logger.Error("Tray restart failed: %v", err)
					}
					time.Sleep(500 * time.Millisecond)
					mRestart.Enable()
					UpdateStatus()
				}()

			case <-mAutoStart.ClickedCh:
				toggleAutoStart()

			case <-mSettings.ClickedCh:
				showNotification("SyncTabs Settings",
					"Open SyncTabs in your browser and click the gear icon to access companion settings.")

			case <-mQuit.ClickedCh:
				systray.Quit()
			}
		}
	}()
}

func onExit() {
	logger.Info("Tray: exiting — shutting down server")
	srv.Stop()
}

// statusUpdater polls every 2 seconds and updates the status menu item.
func statusUpdater() {
	// Initial update after a short delay for server to start
	time.Sleep(500 * time.Millisecond)
	UpdateStatus()

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		UpdateStatus()
	}
}

// UpdateStatus refreshes the tray icon and status text. Safe to call from any goroutine.
func UpdateStatus() {
	count := srv.ConnectedCount()
	names := srv.BrowserNames()

	var statusText string
	if count == 0 {
		statusText = "● Running — no browsers connected"
		systray.SetIcon(iconDisconnected)
		systray.SetTooltip("SyncTabs Companion — No browsers connected")
	} else if count == 1 && len(names) > 0 {
		statusText = fmt.Sprintf("● Connected — %s", names[0])
		systray.SetIcon(iconConnected)
		systray.SetTooltip(fmt.Sprintf("SyncTabs — %s connected", names[0]))
	} else {
		browserList := ""
		for i, n := range names {
			if i > 0 {
				browserList += ", "
			}
			browserList += n
		}
		statusText = fmt.Sprintf("● Connected — %d browsers", count)
		systray.SetIcon(iconConnected)
		systray.SetTooltip(fmt.Sprintf("SyncTabs — %s", browserList))
	}
	mStatus.SetTitle(statusText)
}

func toggleAutoStart() {
	if startup.IsRegistered() {
		if err := startup.Unregister(); err != nil {
			logger.Warn("Failed to unregister auto-start: %v", err)
			return
		}
		mAutoStart.Uncheck()
		_, _, _ = config.Update(map[string]interface{}{"autoStart": false})
		_ = config.Save()
		logger.Info("Auto-start disabled via tray")
	} else {
		if err := startup.Register(); err != nil {
			logger.Warn("Failed to register auto-start: %v", err)
			return
		}
		mAutoStart.Check()
		_, _, _ = config.Update(map[string]interface{}{"autoStart": true})
		_ = config.Save()
		logger.Info("Auto-start enabled via tray")
	}
}

func openFolder(path string) {
	if err := exec.Command("explorer.exe", path).Start(); err != nil {
		logger.Warn("Failed to open folder: %v", err)
	}
}

func openInNotepad(path string) {
	if path == "" {
		logger.Warn("Log path not set")
		return
	}
	if err := exec.Command("notepad.exe", path).Start(); err != nil {
		logger.Warn("Failed to open notepad: %v", err)
	}
}

// showNotification shows a Windows balloon notification using PowerShell.
func showNotification(title, message string) {
	script := fmt.Sprintf(
		`Add-Type -AssemblyName System.Windows.Forms; `+
			`$n=New-Object System.Windows.Forms.NotifyIcon; `+
			`$n.Icon=[System.Drawing.SystemIcons]::Information; `+
			`$n.Visible=$true; `+
			`$n.ShowBalloonTip(4000,'%s','%s',[System.Windows.Forms.ToolTipIcon]::Info); `+
			`Start-Sleep -s 5; `+
			`$n.Dispose()`,
		title, message,
	)
	if err := exec.Command("powershell", "-WindowStyle", "Hidden", "-Command", script).Start(); err != nil {
		logger.Warn("Failed to show notification: %v", err)
	}
}
