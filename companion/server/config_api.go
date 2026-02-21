package server

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/harshvasudeva/synctabs-companion/config"
	"github.com/harshvasudeva/synctabs-companion/logger"
	"github.com/harshvasudeva/synctabs-companion/startup"
)

// handleHealth responds to GET /health
// Adds "app": "synctabs-companion" for single-instance detection.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	all := s.state.GetAll()
	summary := make(map[string]interface{}, len(all))
	for id, data := range all {
		summary[id] = map[string]interface{}{
			"browserName": data.BrowserName,
			"tabCount":    len(data.Tabs),
			"online":      data.Online,
			"lastSeen":    data.LastSeen,
		}
	}
	writeJSON(w, map[string]interface{}{
		"status":   "ok",
		"app":      "synctabs-companion",
		"browsers": summary,
	})
}

// handleConfig responds to GET and POST /config
func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, config.Get())

	case http.MethodPost:
		var partial map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&partial); err != nil {
			http.Error(w, "Invalid JSON: "+err.Error(), http.StatusBadRequest)
			return
		}

		// Check for restart sentinel before config update
		if _, hasRestart := partial["_restart"]; hasRestart {
			newCfg := config.Get()
			go func() {
				time.Sleep(100 * time.Millisecond)
				if err := s.Restart(newCfg); err != nil {
					logger.Error("Restart failed: %v", err)
				}
			}()
			writeJSON(w, map[string]interface{}{
				"ok":            true,
				"config":        newCfg,
				"restartNeeded": true,
			})
			return
		}

		restartNeeded, dataFolderChanged, err := config.Update(partial)
		if err != nil {
			http.Error(w, "Invalid config: "+err.Error(), http.StatusBadRequest)
			return
		}

		newCfg := config.Get()

		// Save config to disk
		if err := config.Save(); err != nil {
			logger.Error("Failed to save config: %v", err)
		}

		// Apply log level change immediately (no restart needed)
		if _, ok := partial["logLevel"]; ok {
			logger.SetLevel(newCfg.LogLevel)
			logger.Info("Log level changed to %s", newCfg.LogLevel)
		}

		// Apply autoStart change immediately
		if val, ok := partial["autoStart"]; ok {
			if as, ok := val.(bool); ok {
				if as {
					if err := startup.Register(); err != nil {
						logger.Warn("Failed to register auto-start: %v", err)
					} else {
						logger.Info("Auto-start enabled")
					}
				} else {
					if err := startup.Unregister(); err != nil {
						logger.Warn("Failed to unregister auto-start: %v", err)
					} else {
						logger.Info("Auto-start disabled")
					}
				}
			}
		}

		// Handle data folder migration (if not restarting)
		if dataFolderChanged && !restartNeeded {
			if err := s.state.UpdateDataFolder(newCfg.DataFolder); err != nil {
				logger.Error("Failed to move state data: %v", err)
			}
			if err := s.pending.UpdateDataFolder(newCfg.DataFolder); err != nil {
				logger.Error("Failed to move pending data: %v", err)
			}
		}

		writeJSON(w, map[string]interface{}{
			"ok":            true,
			"config":        newCfg,
			"restartNeeded": restartNeeded,
		})

		// Port change: restart server after responding
		if restartNeeded {
			go func() {
				time.Sleep(200 * time.Millisecond)
				logger.Info("Port changed to %d, restarting server...", newCfg.Port)
				if err := s.Restart(newCfg); err != nil {
					logger.Error("Restart failed: %v", err)
				}
			}()
		}

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// StatusResponse is the shape of GET /status
type StatusResponse struct {
	Status      string   `json:"status"`
	App         string   `json:"app"`
	Version     string   `json:"version"`
	UptimeSeconds float64 `json:"uptimeSeconds"`
	Port        int      `json:"port"`
	Connections int      `json:"connections"`
	ConnectedBrowsers []string `json:"connectedBrowsers"`
	LogLevel    string   `json:"logLevel"`
	DataFolder  string   `json:"dataFolder"`
}

// handleStatus responds to GET /status
func (s *Server) handleStatus(w http.ResponseWriter, r *http.Request) {
	cfg := config.Get()
	writeJSON(w, StatusResponse{
		Status:            "ok",
		App:               "synctabs-companion",
		Version:           config.AppVersion,
		UptimeSeconds:     time.Since(s.StartTime()).Seconds(),
		Port:              s.CurrentPort(),
		Connections:       s.ConnectedCount(),
		ConnectedBrowsers: s.BrowserNames(),
		LogLevel:          cfg.LogLevel,
		DataFolder:        cfg.DataFolder,
	})
}
