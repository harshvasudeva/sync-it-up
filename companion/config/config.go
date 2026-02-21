package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

const AppName = "SyncTabs Companion"

// AppVersion can be overridden at build time via -ldflags
var AppVersion = "1.0.0"

const DefaultPort = 9234
const StaleDays = 30

// Config holds all companion configuration.
type Config struct {
	Port              int    `json:"port"`
	DataFolder        string `json:"dataFolder"`
	LogLevel          string `json:"logLevel"`
	MaxTabsPerBrowser int    `json:"maxTabsPerBrowser"`
	AutoStart         bool   `json:"autoStart"`
	Version           string `json:"version"`
}

var (
	current Config
	mu      sync.RWMutex
	cfgPath string
)

// AppDataDir returns %APPDATA%\SyncTabs
func AppDataDir() string {
	appData := os.Getenv("APPDATA")
	if appData == "" {
		appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
	}
	return filepath.Join(appData, "SyncTabs")
}

// ConfigPath returns the path to config.json
func ConfigPath() string {
	return cfgPath
}

// defaults returns the default Config
func defaults() Config {
	appData := AppDataDir()
	return Config{
		Port:              DefaultPort,
		DataFolder:        filepath.Join(appData, "data"),
		LogLevel:          "info",
		MaxTabsPerBrowser: 500,
		AutoStart:         false,
		Version:           AppVersion,
	}
}

// Load reads config.json, applying defaults for any missing fields.
// On first run, creates the directory and writes defaults.
func Load() error {
	appData := AppDataDir()
	cfgPath = filepath.Join(appData, "config.json")

	// Ensure directory exists
	if err := os.MkdirAll(appData, 0755); err != nil {
		return err
	}

	def := defaults()

	data, err := os.ReadFile(cfgPath)
	if os.IsNotExist(err) {
		// First run — write defaults
		mu.Lock()
		current = def
		mu.Unlock()
		return Save()
	}
	if err != nil {
		return err
	}

	// Start with defaults, then overlay with file values
	loaded := def
	if err := json.Unmarshal(data, &loaded); err != nil {
		// Corrupt config — reset to defaults
		mu.Lock()
		current = def
		mu.Unlock()
		return Save()
	}

	// Ensure version is always current
	loaded.Version = AppVersion

	// Ensure required fields have valid values
	if loaded.Port == 0 {
		loaded.Port = DefaultPort
	}
	if loaded.DataFolder == "" {
		loaded.DataFolder = def.DataFolder
	}
	if loaded.LogLevel == "" {
		loaded.LogLevel = "info"
	}
	if loaded.MaxTabsPerBrowser == 0 {
		loaded.MaxTabsPerBrowser = 500
	}

	mu.Lock()
	current = loaded
	mu.Unlock()
	return nil
}

// Save writes the current config atomically (write to .tmp, rename).
func Save() error {
	mu.RLock()
	c := current
	mu.RUnlock()

	c.Version = AppVersion

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}

	// Ensure parent dir exists
	if err := os.MkdirAll(filepath.Dir(cfgPath), 0755); err != nil {
		return err
	}

	tmp := cfgPath + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, cfgPath)
}

// Get returns a copy of the current config (thread-safe).
func Get() Config {
	mu.RLock()
	defer mu.RUnlock()
	return current
}

// Update merges a partial config map into current config and saves.
// Returns: restartNeeded (port changed), dataFolderChanged, err
// The _restart sentinel key is handled here — it triggers a restart signal
// without changing any config values.
func Update(partial map[string]interface{}) (restartNeeded bool, dataFolderChanged bool, err error) {
	mu.Lock()
	defer mu.Unlock()

	// Check for restart sentinel
	if _, hasRestart := partial["_restart"]; hasRestart {
		return true, false, nil
	}

	oldPort := current.Port
	oldDataFolder := current.DataFolder

	// JSON round-trip merge: marshal current → unmarshal partial on top
	currentJSON, err := json.Marshal(current)
	if err != nil {
		return false, false, err
	}

	// Unmarshal current into a map
	currentMap := make(map[string]interface{})
	if err := json.Unmarshal(currentJSON, &currentMap); err != nil {
		return false, false, err
	}

	// Overlay partial values
	for k, v := range partial {
		if k != "_restart" {
			currentMap[k] = v
		}
	}

	// Marshal merged map back to JSON
	mergedJSON, err := json.Marshal(currentMap)
	if err != nil {
		return false, false, err
	}

	// Unmarshal into Config struct
	var newCfg Config
	if err := json.Unmarshal(mergedJSON, &newCfg); err != nil {
		return false, false, err
	}

	// Validate
	if newCfg.Port < 1024 || newCfg.Port > 65535 {
		return false, false, os.ErrInvalid
	}
	if newCfg.MaxTabsPerBrowser < 1 || newCfg.MaxTabsPerBrowser > 10000 {
		newCfg.MaxTabsPerBrowser = 500
	}
	validLogLevels := map[string]bool{"debug": true, "info": true, "warn": true, "error": true}
	if !validLogLevels[newCfg.LogLevel] {
		newCfg.LogLevel = "info"
	}

	newCfg.Version = AppVersion
	current = newCfg

	restartNeeded = newCfg.Port != oldPort
	dataFolderChanged = newCfg.DataFolder != oldDataFolder

	return restartNeeded, dataFolderChanged, nil
}
