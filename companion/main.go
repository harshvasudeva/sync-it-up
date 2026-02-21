package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/harshvasudeva/synctabs-companion/config"
	"github.com/harshvasudeva/synctabs-companion/logger"
	"github.com/harshvasudeva/synctabs-companion/server"
	"github.com/harshvasudeva/synctabs-companion/startup"
	"github.com/harshvasudeva/synctabs-companion/tray"
)

type instanceCheckResult int

const (
	portFree instanceCheckResult = iota
	instanceAlreadyRunning
	portInUseByOther
)

func main() {
	// ─── 1. Load Configuration ────────────────────────────────────────
	if err := config.Load(); err != nil {
		showFatalDialog("SyncTabs Companion", "Failed to load configuration: "+err.Error())
		os.Exit(1)
	}
	cfg := config.Get()

	// ─── 2. Initialize Logger ─────────────────────────────────────────
	if err := logger.Init(cfg.DataFolder, cfg.LogLevel); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to init logger: %v\n", err)
	}
	logger.Info("SyncTabs Companion v%s starting", config.AppVersion)
	logger.Info("Data folder: %s", cfg.DataFolder)
	logger.Info("Port: %d", cfg.Port)

	// ─── 3. Single-Instance Check ─────────────────────────────────────
	switch checkSingleInstance(cfg.Port) {
	case instanceAlreadyRunning:
		logger.Info("Another instance is already running — exiting silently")
		os.Exit(0)
	case portInUseByOther:
		msg := fmt.Sprintf(
			"Port %d is already in use by another application.\n"+
				"Change the port in the SyncTabs config and restart.",
			cfg.Port,
		)
		logger.Error(msg)
		showFatalDialog("SyncTabs Companion — Port Conflict", msg)
		os.Exit(1)
	case portFree:
		// Good to go
	}

	// ─── 4. Sync Auto-Start with Config ──────────────────────────────
	startup.SyncWithConfig(cfg.AutoStart)

	// ─── 5. Create and Start Server ───────────────────────────────────
	srv, err := server.New(cfg)
	if err != nil {
		msg := "Failed to create server: " + err.Error()
		logger.Error(msg)
		showFatalDialog("SyncTabs Companion", msg)
		os.Exit(1)
	}

	go func() {
		if err := srv.Start(); err != nil {
			logger.Error("Server stopped: %v", err)
		}
	}()

	// Give server a moment to bind before showing tray
	time.Sleep(150 * time.Millisecond)
	logger.Info("Server started on ws://127.0.0.1:%d", cfg.Port)

	// ─── 6. Run Tray (blocks until quit) ─────────────────────────────
	// systray.Run MUST be called from the main goroutine on Windows.
	tray.Run(srv)
}

// checkSingleInstance probes the health endpoint to detect running instances.
func checkSingleInstance(port int) instanceCheckResult {
	url := fmt.Sprintf("http://127.0.0.1:%d/health", port)
	client := &http.Client{Timeout: 1 * time.Second}

	resp, err := client.Get(url)
	if err != nil {
		// Connection refused = port is free
		return portFree
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		var result map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&result); err == nil {
			if app, _ := result["app"].(string); app == "synctabs-companion" {
				return instanceAlreadyRunning
			}
		}
		return portInUseByOther
	}

	return portInUseByOther
}
