//go:build linux

package startup

import (
	"fmt"
	"os"
	"path/filepath"
)

// Uses XDG autostart spec: ~/.config/autostart/<name>.desktop
const desktopName = "synctabs-companion.desktop"

func desktopPath() string {
	// Respect XDG_CONFIG_HOME if set
	configHome := os.Getenv("XDG_CONFIG_HOME")
	if configHome == "" {
		home, _ := os.UserHomeDir()
		configHome = filepath.Join(home, ".config")
	}
	return filepath.Join(configHome, "autostart", desktopName)
}

func IsRegistered() bool {
	_, err := os.Stat(desktopPath())
	return err == nil
}

func Register() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable path: %w", err)
	}
	exePath, err = filepath.Abs(exePath)
	if err != nil {
		return fmt.Errorf("abs path: %w", err)
	}

	dir := filepath.Dir(desktopPath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	desktop := fmt.Sprintf(`[Desktop Entry]
Type=Application
Name=SyncTabs Companion
Exec=%s
Icon=synctabs
Comment=Cross-browser tab sync companion
Categories=Utility;
X-GNOME-Autostart-enabled=true
`, exePath)

	return os.WriteFile(desktopPath(), []byte(desktop), 0644)
}

func Unregister() error {
	err := os.Remove(desktopPath())
	if os.IsNotExist(err) {
		return nil
	}
	return err
}

func SyncWithConfig(autoStart bool) {
	if autoStart && !IsRegistered() {
		_ = Register()
	} else if !autoStart && IsRegistered() {
		_ = Unregister()
	}
}
