//go:build windows

package startup

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const (
	registryKey = `SOFTWARE\Microsoft\Windows\CurrentVersion\Run`
	valueName   = "SyncTabsCompanion"
)

// IsRegistered checks if the auto-start registry value exists.
func IsRegistered() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, registryKey, registry.QUERY_VALUE)
	if err != nil {
		return false
	}
	defer k.Close()
	_, _, err = k.GetStringValue(valueName)
	return err == nil
}

// Register adds HKCU\...\Run\SyncTabsCompanion pointing to the current exe.
func Register() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("get executable path: %w", err)
	}
	exePath, err = filepath.Abs(exePath)
	if err != nil {
		return fmt.Errorf("abs path: %w", err)
	}

	k, err := registry.OpenKey(registry.CURRENT_USER, registryKey, registry.SET_VALUE)
	if err != nil {
		return fmt.Errorf("open registry key: %w", err)
	}
	defer k.Close()

	// Quote the path to handle spaces
	quoted := fmt.Sprintf(`"%s"`, exePath)
	return k.SetStringValue(valueName, quoted)
}

// Unregister removes the auto-start registry value.
func Unregister() error {
	k, err := registry.OpenKey(registry.CURRENT_USER, registryKey, registry.SET_VALUE)
	if err != nil {
		// Key doesn't exist = already unregistered
		return nil
	}
	defer k.Close()
	err = k.DeleteValue(valueName)
	if err == registry.ErrNotExist {
		return nil
	}
	return err
}

// SyncWithConfig ensures the registry matches the config.AutoStart value.
// Called on startup to reconcile any out-of-sync state.
func SyncWithConfig(autoStart bool) {
	if autoStart && !IsRegistered() {
		_ = Register()
	} else if !autoStart && IsRegistered() {
		_ = Unregister()
	}
}
