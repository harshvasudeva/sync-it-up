//go:build darwin

package startup

import (
	"fmt"
	"os"
	"path/filepath"
)

const plistName = "com.synctabs.companion.plist"

func plistPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", plistName)
}

func IsRegistered() bool {
	_, err := os.Stat(plistPath())
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

	dir := filepath.Dir(plistPath())
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}

	plist := fmt.Sprintf(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key>
	<string>com.synctabs.companion</string>
	<key>ProgramArguments</key>
	<array>
		<string>%s</string>
	</array>
	<key>RunAtLoad</key>
	<true/>
	<key>KeepAlive</key>
	<false/>
</dict>
</plist>
`, exePath)

	return os.WriteFile(plistPath(), []byte(plist), 0644)
}

func Unregister() error {
	err := os.Remove(plistPath())
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
