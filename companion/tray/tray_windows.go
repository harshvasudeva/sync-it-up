//go:build windows

package tray

import (
	"fmt"
	"os/exec"

	"github.com/harshvasudeva/synctabs-companion/logger"
)

// openFolder opens the data folder in Windows Explorer
func openFolder(path string) {
	if err := exec.Command("explorer.exe", path).Start(); err != nil {
		logger.Warn("Failed to open folder: %v", err)
	}
}

// openInNotepad opens the log file in Notepad
func openInNotepad(path string) {
	if path == "" {
		logger.Warn("Log path not set")
		return
	}
	if err := exec.Command("notepad.exe", path).Start(); err != nil {
		logger.Warn("Failed to open notepad: %v", err)
	}
}

// showNotification shows a Windows balloon notification using PowerShell
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

// getAutoStartLabel returns the platform-specific auto-start menu label
func getAutoStartLabel() string {
	return "Start with Windows"
}
