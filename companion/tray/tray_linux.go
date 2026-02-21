//go:build linux

package tray

import (
	"os"
	"os/exec"

	"github.com/harshvasudeva/synctabs-companion/logger"
)

// openFolder opens the data folder using xdg-open (default file manager)
func openFolder(path string) {
	if err := exec.Command("xdg-open", path).Start(); err != nil {
		logger.Warn("Failed to open folder: %v", err)
	}
}

// openInNotepad opens the log file with default text editor using xdg-open
func openInNotepad(path string) {
	if path == "" {
		logger.Warn("Log path not set")
		return
	}
	// Use xdg-open to open with default text editor
	if err := exec.Command("xdg-open", path).Start(); err != nil {
		logger.Warn("Failed to open log file: %v", err)
	}
}

// showNotification shows a Linux desktop notification using notify-send
func showNotification(title, message string) {
	// Try notify-send (available on most Linux desktops)
	if err := exec.Command("notify-send", "-u", "normal", "-t", "5000", title, message).Start(); err != nil {
		// Fallback: just log it if notify-send is not available
		logger.Info("Notification: %s — %s", title, message)
	}
}

// getAutoStartLabel returns the platform-specific auto-start menu label
func getAutoStartLabel() string {
	// Check if we're in a systemd user session
	if os.Getenv("XDG_CURRENT_DESKTOP") != "" {
		return "Start with desktop session"
	}
	return "Start on login"
}
