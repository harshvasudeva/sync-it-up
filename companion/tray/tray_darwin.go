//go:build darwin

package tray

import (
	"fmt"
	"os/exec"

	"github.com/harshvasudeva/synctabs-companion/logger"
)

// openFolder opens the data folder in macOS Finder
func openFolder(path string) {
	if err := exec.Command("open", path).Start(); err != nil {
		logger.Warn("Failed to open folder: %v", err)
	}
}

// openInNotepad opens the log file in default text editor (nano in Terminal)
// On macOS, we use the system open command to open with default editor
func openInNotepad(path string) {
	if path == "" {
		logger.Warn("Log path not set")
		return
	}
	// Use 'open' to open with default editor, '-t' flag opens in text editor
	if err := exec.Command("open", "-t", path).Start(); err != nil {
		logger.Warn("Failed to open log file: %v", err)
	}
}

// showNotification shows a macOS notification using osascript (AppleScript)
func showNotification(title, message string) {
	script := fmt.Sprintf(
		`display notification "%s" with title "%s"`,
		message, title,
	)
	if err := exec.Command("osascript", "-e", script).Start(); err != nil {
		logger.Warn("Failed to show notification: %v", err)
	}
}

// getAutoStartLabel returns the platform-specific auto-start menu label
func getAutoStartLabel() string {
	return "Start with macOS"
}
