package server

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/harshvasudeva/synctabs-companion/config"
	"github.com/harshvasudeva/synctabs-companion/logger"
)

// Tab mirrors the validated tab shape from server.js
type Tab struct {
	ID           int    `json:"id"`
	URL          string `json:"url"`
	Title        string `json:"title"`
	FavIconURL   string `json:"favIconUrl"`
	Pinned       bool   `json:"pinned"`
	WindowID     int    `json:"windowId"`
	Active       bool   `json:"active"`
	LastAccessed float64 `json:"lastAccessed"`
	Incognito    bool   `json:"incognito"`
}

// BrowserData is the per-browser entry in tabs.json
type BrowserData struct {
	BrowserName string `json:"browserName"`
	Tabs        []Tab  `json:"tabs"`
	LastSeen    string `json:"lastSeen"`
	Online      bool   `json:"online"`
}

// StateStore holds in-memory browser state backed by tabs.json
type StateStore struct {
	mu     sync.RWMutex
	data   map[string]*BrowserData
	folder string
	saveCh chan struct{}
}

// NewStateStore creates a StateStore and loads from disk.
func NewStateStore(dataFolder string) (*StateStore, error) {
	s := &StateStore{
		data:   make(map[string]*BrowserData),
		folder: dataFolder,
		saveCh: make(chan struct{}, 1),
	}
	if err := s.Load(); err != nil {
		return nil, err
	}
	go s.startSaveWorker()
	return s, nil
}

func (s *StateStore) tabsPath() string {
	return filepath.Join(s.folder, "tabs.json")
}

// Load reads tabs.json, scrubs null/stale entries, sets all online=false.
func (s *StateStore) Load() error {
	if err := os.MkdirAll(s.folder, 0755); err != nil {
		return err
	}

	data, err := os.ReadFile(s.tabsPath())
	if os.IsNotExist(err) {
		return nil // empty store on first run
	}
	if err != nil {
		return err
	}

	// Parse as map[string]BrowserData
	raw := make(map[string]json.RawMessage)
	if err := json.Unmarshal(data, &raw); err != nil {
		logger.Warn("tabs.json corrupt, starting fresh: %v", err)
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	cutoff := time.Now().AddDate(0, 0, -config.StaleDays)

	for id, rawEntry := range raw {
		// Skip null/invalid IDs
		if id == "" || id == "null" || id == "undefined" {
			continue
		}

		var entry BrowserData
		if err := json.Unmarshal(rawEntry, &entry); err != nil {
			continue
		}

		// Skip entries with no browser name
		if entry.BrowserName == "" {
			continue
		}

		// Skip stale entries
		if entry.LastSeen != "" {
			if t, err := time.Parse(time.RFC3339, entry.LastSeen); err == nil {
				if t.Before(cutoff) {
					logger.Debug("Removing stale entry: %s (%s)", entry.BrowserName, id)
					continue
				}
			}
		}

		// Mark all as offline on load
		entry.Online = false
		s.data[id] = &entry
	}

	logger.Info("Loaded %d browser(s) from tabs.json", len(s.data))
	return nil
}

// Save writes tabs.json atomically.
func (s *StateStore) Save() error {
	s.mu.RLock()
	snapshot := make(map[string]*BrowserData, len(s.data))
	for k, v := range s.data {
		cp := *v
		snapshot[k] = &cp
	}
	s.mu.RUnlock()

	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}

	if err := os.MkdirAll(s.folder, 0755); err != nil {
		return err
	}

	tmp := s.tabsPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, s.tabsPath())
}

// DebouncedSave triggers a save after 500ms.
func (s *StateStore) DebouncedSave() {
	select {
	case s.saveCh <- struct{}{}:
	default:
	}
}

func (s *StateStore) startSaveWorker() {
	for range s.saveCh {
		time.Sleep(500 * time.Millisecond)
		// Drain extra signals accumulated during sleep
		for {
			select {
			case <-s.saveCh:
			default:
				goto save
			}
		}
	save:
		if err := s.Save(); err != nil {
			logger.Error("State save failed: %v", err)
		}
	}
}

// Register handles the 'register' WS message:
//  1. Deduplicates stale entries with same browserName (exact port of server.js lines 214-225)
//  2. Creates or updates the entry
//  3. Returns BuildStateForClient(browserId) for the full-state response
func (s *StateStore) Register(browserId, browserName string) map[string]BrowserData {
	s.mu.Lock()

	// Dedup: find offline entries with same browserName, remove them
	for id, entry := range s.data {
		if id != browserId && entry.BrowserName == browserName && !entry.Online {
			logger.Debug("Deduplicating stale entry for %s (old id: %s)", browserName, id)
			delete(s.data, id)
		}
	}

	now := time.Now().Format(time.RFC3339)
	if existing, ok := s.data[browserId]; ok {
		existing.BrowserName = browserName
		existing.Online = true
		existing.LastSeen = now
	} else {
		s.data[browserId] = &BrowserData{
			BrowserName: browserName,
			Tabs:        []Tab{},
			LastSeen:    now,
			Online:      true,
		}
	}

	s.mu.Unlock()
	s.DebouncedSave()
	return s.BuildStateForClient(browserId)
}

// UpdateTabs updates the tab list for a browser.
func (s *StateStore) UpdateTabs(browserId string, tabs []Tab) {
	s.mu.Lock()
	if entry, ok := s.data[browserId]; ok {
		entry.Tabs = tabs
		entry.LastSeen = time.Now().Format(time.RFC3339)
	}
	s.mu.Unlock()
	s.DebouncedSave()
}

// SetOffline marks a browser as offline.
func (s *StateStore) SetOffline(browserId string) {
	s.mu.Lock()
	if entry, ok := s.data[browserId]; ok {
		entry.Online = false
		entry.LastSeen = time.Now().Format(time.RFC3339)
	}
	s.mu.Unlock()
	s.DebouncedSave()
}

// BuildStateForClient returns all entries except excludeId, filtering nulls.
func (s *StateStore) BuildStateForClient(excludeId string) map[string]BrowserData {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]BrowserData)
	for id, entry := range s.data {
		if id == "" || id == "null" || id == excludeId {
			continue
		}
		result[id] = *entry
	}
	return result
}

// Get returns a copy of one browser's data.
func (s *StateStore) Get(browserId string) (BrowserData, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.data[browserId]
	if !ok {
		return BrowserData{}, false
	}
	return *entry, true
}

// GetAll returns a snapshot of all entries.
func (s *StateStore) GetAll() map[string]BrowserData {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]BrowserData, len(s.data))
	for id, entry := range s.data {
		result[id] = *entry
	}
	return result
}

// UpdateDataFolder moves the store to a new folder path.
func (s *StateStore) UpdateDataFolder(newFolder string) error {
	s.mu.Lock()
	oldFolder := s.folder
	s.folder = newFolder
	s.mu.Unlock()

	if err := os.MkdirAll(newFolder, 0755); err != nil {
		return err
	}

	// Move tabs.json to new location
	oldPath := filepath.Join(oldFolder, "tabs.json")
	newPath := filepath.Join(newFolder, "tabs.json")
	if _, err := os.Stat(oldPath); err == nil {
		if err := os.Rename(oldPath, newPath); err != nil {
			// If rename fails (cross-device), copy then delete
			logger.Warn("Could not move tabs.json: %v (will save fresh)", err)
		}
	}

	// Save current state to new location
	return s.Save()
}

// validateTabArray mirrors server.js validateTabArray()
func validateTabArray(tabs []Tab, maxTabs int) []Tab {
	if len(tabs) > maxTabs {
		tabs = tabs[:maxTabs]
	}
	now := float64(time.Now().UnixMilli())
	for i := range tabs {
		if len(tabs[i].URL) > 2048 {
			tabs[i].URL = tabs[i].URL[:2048]
		}
		if len(tabs[i].Title) > 500 {
			tabs[i].Title = tabs[i].Title[:500]
		}
		if len(tabs[i].FavIconURL) > 2048 {
			tabs[i].FavIconURL = tabs[i].FavIconURL[:2048]
		}
		if tabs[i].Title == "" {
			tabs[i].Title = "New Tab"
		}
		if tabs[i].LastAccessed == 0 {
			tabs[i].LastAccessed = now
		}
	}
	return tabs
}
