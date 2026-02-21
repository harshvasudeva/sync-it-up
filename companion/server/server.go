package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/harshvasudeva/synctabs-companion/config"
	"github.com/harshvasudeva/synctabs-companion/logger"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin: func(r *http.Request) bool {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			return false
		}
		return host == "127.0.0.1" || host == "::1"
	},
}

// Server holds all server state.
type Server struct {
	mu        sync.Mutex
	state     *StateStore
	pending   *PendingStore
	reg       *connectionRegistry
	httpSrv   *http.Server
	listener  net.Listener
	cfg       config.Config
	startTime time.Time
}

// New creates a Server with the given config.
func New(cfg config.Config) (*Server, error) {
	state, err := NewStateStore(cfg.DataFolder)
	if err != nil {
		return nil, fmt.Errorf("state store: %w", err)
	}

	pending, err := NewPendingStore(cfg.DataFolder)
	if err != nil {
		return nil, fmt.Errorf("pending store: %w", err)
	}

	s := &Server{
		state:   state,
		pending: pending,
		reg:     newConnectionRegistry(),
		cfg:     cfg,
	}
	return s, nil
}

// Start binds to 127.0.0.1:port and begins serving. Blocks until Stop() is called.
func (s *Server) Start() error {
	s.mu.Lock()
	addr := fmt.Sprintf("127.0.0.1:%d", s.cfg.Port)

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("listen %s: %w", addr, err)
	}
	s.listener = ln

	mux := http.NewServeMux()
	s.registerRoutes(mux)

	s.httpSrv = &http.Server{
		Handler: mux,
		// NOTE: Do NOT set ReadTimeout/WriteTimeout here.
		// They set deadlines on the underlying TCP connection which
		// kills long-lived WebSocket connections after the timeout.
	}
	s.startTime = time.Now()
	s.mu.Unlock()

	logger.Info("Server listening on ws://%s", addr)

	if err := s.httpSrv.Serve(ln); err != nil && err != http.ErrServerClosed {
		return err
	}
	return nil
}

// Stop gracefully shuts down the HTTP/WS server.
func (s *Server) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.httpSrv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = s.httpSrv.Shutdown(ctx)
		s.httpSrv = nil
	}
	if s.listener != nil {
		_ = s.listener.Close()
		s.listener = nil
	}
}

// Restart stops and starts with a new config.
func (s *Server) Restart(newCfg config.Config) error {
	logger.Info("Restarting server on port %d", newCfg.Port)
	s.Stop()

	s.mu.Lock()
	oldDataFolder := s.cfg.DataFolder
	s.cfg = newCfg
	s.mu.Unlock()

	// Update data stores if folder changed
	if newCfg.DataFolder != oldDataFolder {
		if err := s.state.UpdateDataFolder(newCfg.DataFolder); err != nil {
			logger.Error("Failed to update state folder: %v", err)
		}
		if err := s.pending.UpdateDataFolder(newCfg.DataFolder); err != nil {
			logger.Error("Failed to update pending folder: %v", err)
		}
	}

	go func() {
		if err := s.Start(); err != nil {
			logger.Error("Server restart failed: %v", err)
		}
	}()
	return nil
}

// ConnectedCount returns number of live WebSocket connections.
func (s *Server) ConnectedCount() int {
	return s.reg.count()
}

// BrowserNames returns names of currently connected browsers.
func (s *Server) BrowserNames() []string {
	return s.reg.names(s.state)
}

// StartTime returns when the server started.
func (s *Server) StartTime() time.Time {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.startTime
}

// CurrentPort returns the current port.
func (s *Server) CurrentPort() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.cfg.Port
}

// GetState returns the state store (for config API).
func (s *Server) GetState() *StateStore {
	return s.state
}

// GetPending returns the pending store (for config API).
func (s *Server) GetPending() *PendingStore {
	return s.pending
}

func (s *Server) registerRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/", s.requireLocalhost(s.handleWebSocket))
	mux.HandleFunc("/health", s.requireLocalhost(s.handleHealth))
	mux.HandleFunc("/config", s.requireLocalhost(s.handleConfig))
	mux.HandleFunc("/status", s.requireLocalhost(s.handleStatus))
}

// requireLocalhost rejects non-loopback connections.
func (s *Server) requireLocalhost(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil || (host != "127.0.0.1" && host != "::1") {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Warn("WS upgrade failed: %v", err)
		return
	}
	ws.SetReadLimit(MaxMessageSize)

	s.mu.Lock()
	cfg := s.cfg
	s.mu.Unlock()

	go HandleConnection(ws, s.state, s.pending, s.reg, cfg)
}

// writeJSON writes v as JSON to w.
func writeJSON(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	enc := json.NewEncoder(w)
	if err := enc.Encode(v); err != nil {
		logger.Error("JSON encode error: %v", err)
	}
}
