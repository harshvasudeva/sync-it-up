package server

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/harshvasudeva/synctabs-companion/config"
	"github.com/harshvasudeva/synctabs-companion/logger"
)

const MaxPendingPerBrowser = 50

// PendingTab represents a tab queued for offline delivery.
type PendingTab struct {
	URL               string `json:"url"`
	Title             string `json:"title"`
	FavIconURL        string `json:"favIconUrl"`
	SenderBrowserID   string `json:"senderBrowserId"`
	SenderBrowserName string `json:"senderBrowserName"`
	SentAt            string `json:"sentAt"`
}

// PendingStore holds pending tabs backed by pending-tabs.json
type PendingStore struct {
	mu     sync.RWMutex
	data   map[string][]PendingTab // targetBrowserId -> []PendingTab
	folder string
	saveCh chan struct{}
}

// NewPendingStore creates a PendingStore and loads from disk.
func NewPendingStore(dataFolder string) (*PendingStore, error) {
	p := &PendingStore{
		data:   make(map[string][]PendingTab),
		folder: dataFolder,
		saveCh: make(chan struct{}, 1),
	}
	if err := p.Load(); err != nil {
		return nil, err
	}
	go p.startSaveWorker()
	return p, nil
}

func (p *PendingStore) pendingPath() string {
	return filepath.Join(p.folder, "pending-tabs.json")
}

// Load reads pending-tabs.json, filters null IDs and stale entries.
func (p *PendingStore) Load() error {
	if err := os.MkdirAll(p.folder, 0755); err != nil {
		return err
	}

	data, err := os.ReadFile(p.pendingPath())
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}

	raw := make(map[string][]PendingTab)
	if err := json.Unmarshal(data, &raw); err != nil {
		logger.Warn("pending-tabs.json corrupt, starting fresh: %v", err)
		return nil
	}

	p.mu.Lock()
	defer p.mu.Unlock()

	cutoff := time.Now().AddDate(0, 0, -config.StaleDays)

	for id, tabs := range raw {
		if id == "" || id == "null" || id == "undefined" {
			continue
		}
		// Filter stale tabs
		fresh := tabs[:0]
		for _, tab := range tabs {
			if tab.SentAt != "" {
				if t, err := time.Parse(time.RFC3339, tab.SentAt); err == nil {
					if t.Before(cutoff) {
						continue
					}
				}
			}
			fresh = append(fresh, tab)
		}
		if len(fresh) > 0 {
			p.data[id] = fresh
		}
	}

	return nil
}

// Save writes pending-tabs.json atomically.
func (p *PendingStore) Save() error {
	p.mu.RLock()
	snapshot := make(map[string][]PendingTab, len(p.data))
	for k, v := range p.data {
		cp := make([]PendingTab, len(v))
		copy(cp, v)
		snapshot[k] = cp
	}
	p.mu.RUnlock()

	data, err := json.MarshalIndent(snapshot, "", "  ")
	if err != nil {
		return err
	}

	if err := os.MkdirAll(p.folder, 0755); err != nil {
		return err
	}

	tmp := p.pendingPath() + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	return os.Rename(tmp, p.pendingPath())
}

// DebouncedSave triggers a save after 500ms.
func (p *PendingStore) DebouncedSave() {
	select {
	case p.saveCh <- struct{}{}:
	default:
	}
}

func (p *PendingStore) startSaveWorker() {
	for range p.saveCh {
		time.Sleep(500 * time.Millisecond)
		for {
			select {
			case <-p.saveCh:
			default:
				goto save
			}
		}
	save:
		if err := p.Save(); err != nil {
			logger.Error("Pending save failed: %v", err)
		}
	}
}

// Enqueue adds a pending tab for a target browser.
// Returns error if queue is full (MaxPendingPerBrowser).
func (p *PendingStore) Enqueue(targetBrowserId string, tab PendingTab) error {
	p.mu.Lock()
	defer p.mu.Unlock()

	queue := p.data[targetBrowserId]
	if len(queue) >= MaxPendingPerBrowser {
		return fmt.Errorf("pending queue full for browser %s", targetBrowserId)
	}
	p.data[targetBrowserId] = append(queue, tab)
	p.DebouncedSave()
	return nil
}

// Deliver pops and returns all pending tabs for a browser.
func (p *PendingStore) Deliver(targetBrowserId string) []PendingTab {
	p.mu.Lock()
	defer p.mu.Unlock()

	tabs, ok := p.data[targetBrowserId]
	if !ok || len(tabs) == 0 {
		return nil
	}
	delete(p.data, targetBrowserId)
	p.DebouncedSave()
	return tabs
}

// UpdateDataFolder moves the store to a new folder path.
func (p *PendingStore) UpdateDataFolder(newFolder string) error {
	p.mu.Lock()
	oldFolder := p.folder
	p.folder = newFolder
	p.mu.Unlock()

	if err := os.MkdirAll(newFolder, 0755); err != nil {
		return err
	}

	oldPath := filepath.Join(oldFolder, "pending-tabs.json")
	newPath := filepath.Join(newFolder, "pending-tabs.json")
	if _, err := os.Stat(oldPath); err == nil {
		if err := os.Rename(oldPath, newPath); err != nil {
			logger.Warn("Could not move pending-tabs.json: %v", err)
		}
	}

	return p.Save()
}
