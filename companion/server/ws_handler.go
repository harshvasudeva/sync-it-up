package server

import (
	"encoding/json"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/harshvasudeva/synctabs-companion/config"
	"github.com/harshvasudeva/synctabs-companion/logger"
)

const (
	MaxMessageSize      = 512 * 1024 // 512 KB
	RateLimitWindow     = 10 * time.Second
	RateLimitMaxMessages = 50
)

// clientConn holds per-connection state.
type clientConn struct {
	ws            *websocket.Conn
	browserId     string
	msgTimestamps []time.Time
	mu            sync.Mutex // protects ws writes AND msgTimestamps
}

// isRateLimited checks if this connection exceeds 50 msgs in 10 seconds.
func (c *clientConn) isRateLimited() bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-RateLimitWindow)

	filtered := c.msgTimestamps[:0]
	for _, t := range c.msgTimestamps {
		if t.After(cutoff) {
			filtered = append(filtered, t)
		}
	}
	filtered = append(filtered, now)
	c.msgTimestamps = filtered
	return len(filtered) > RateLimitMaxMessages
}

// sendJSON marshals msg and writes it to the websocket (thread-safe).
func (c *clientConn) sendJSON(msg interface{}) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.ws.WriteJSON(msg)
}

// connectionRegistry maps browserId -> *clientConn
type connectionRegistry struct {
	mu    sync.RWMutex
	conns map[string]*clientConn
}

func newConnectionRegistry() *connectionRegistry {
	return &connectionRegistry{
		conns: make(map[string]*clientConn),
	}
}

func (r *connectionRegistry) set(browserId string, conn *clientConn) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.conns[browserId] = conn
}

func (r *connectionRegistry) get(browserId string) (*clientConn, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	c, ok := r.conns[browserId]
	return c, ok
}

func (r *connectionRegistry) delete(browserId string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.conns, browserId)
}

// broadcast sends msg to all connections except excludeId.
func (r *connectionRegistry) broadcast(excludeId string, msg interface{}) {
	r.mu.RLock()
	targets := make([]*clientConn, 0, len(r.conns))
	for id, conn := range r.conns {
		if id != excludeId {
			targets = append(targets, conn)
		}
	}
	r.mu.RUnlock()

	for _, conn := range targets {
		if err := conn.sendJSON(msg); err != nil {
			logger.Debug("Broadcast send error: %v", err)
		}
	}
}

// count returns the number of live connections.
func (r *connectionRegistry) count() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.conns)
}

// names returns a list of browser names for connected clients.
func (r *connectionRegistry) names(state *StateStore) []string {
	r.mu.RLock()
	ids := make([]string, 0, len(r.conns))
	for id := range r.conns {
		ids = append(ids, id)
	}
	r.mu.RUnlock()

	names := make([]string, 0, len(ids))
	for _, id := range ids {
		if data, ok := state.Get(id); ok {
			names = append(names, data.BrowserName)
		}
	}
	return names
}

// inboundMsg is the discriminated union for all inbound WS messages.
type inboundMsg struct {
	Type            string          `json:"type"`
	BrowserID       string          `json:"browserId"`
	BrowserName     string          `json:"browserName"`
	Tabs            json.RawMessage `json:"tabs"`
	TargetBrowserID string          `json:"targetBrowserId"`
	Tab             json.RawMessage `json:"tab"`
}

// HandleConnection is called once per new WebSocket upgrade.
func HandleConnection(
	ws *websocket.Conn,
	state *StateStore,
	pending *PendingStore,
	reg *connectionRegistry,
	cfg config.Config,
) {
	conn := &clientConn{ws: ws}

	defer func() {
		ws.Close()
		handleDisconnect(conn, state, reg)
	}()

	ws.SetReadLimit(MaxMessageSize)

	for {
		_, raw, err := ws.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err,
				websocket.CloseNormalClosure,
				websocket.CloseGoingAway,
				websocket.CloseNoStatusReceived) {
				logger.Debug("WS read error: %v", err)
			}
			return
		}

		if int64(len(raw)) > MaxMessageSize {
			_ = conn.sendJSON(map[string]string{"type": "error", "message": "Message too large"})
			continue
		}

		if conn.isRateLimited() {
			_ = conn.sendJSON(map[string]string{"type": "error", "message": "Rate limited"})
			continue
		}

		var msg inboundMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}

		logger.Debug("[MSG] type=%s browserId=%s len=%d", msg.Type, msg.BrowserID, len(raw))

		switch msg.Type {
		case "register":
			handleRegister(conn, msg, state, pending, reg, cfg)
		case "tabs-update":
			handleTabsUpdate(conn, msg, state, reg, cfg)
		case "request-state":
			handleRequestState(conn, state)
		case "send-tab":
			handleSendTab(conn, msg, state, pending, reg)
		}
	}
}

func handleRegister(
	conn *clientConn,
	msg inboundMsg,
	state *StateStore,
	pending *PendingStore,
	reg *connectionRegistry,
	cfg config.Config,
) {
	// Validate
	if msg.BrowserID == "" || msg.BrowserID == "null" || msg.BrowserID == "undefined" {
		_ = conn.sendJSON(map[string]string{"type": "error", "message": "Invalid browserId"})
		return
	}
	if msg.BrowserName == "" {
		_ = conn.sendJSON(map[string]string{"type": "error", "message": "Missing browserName"})
		return
	}

	conn.browserId = msg.BrowserID

	// Close old connection for same browserId
	if existing, ok := reg.get(msg.BrowserID); ok && existing != conn {
		existing.ws.Close()
	}
	reg.set(msg.BrowserID, conn)

	// Register in state store (handles dedup internally)
	fullState := state.Register(msg.BrowserID, msg.BrowserName)

	// Send full-state (excluding self)
	_ = conn.sendJSON(map[string]interface{}{
		"type":     "full-state",
		"browsers": fullState,
	})

	// Broadcast presence to all others
	reg.broadcast(msg.BrowserID, map[string]interface{}{
		"type":        "presence",
		"browserId":   msg.BrowserID,
		"browserName": msg.BrowserName,
		"online":      true,
		"lastSeen":    time.Now().Format(time.RFC3339),
	})

	logger.Info("[+] %s (%s) connected", msg.BrowserName, msg.BrowserID)

	// Deliver pending tabs
	if tabs := pending.Deliver(msg.BrowserID); len(tabs) > 0 {
		_ = conn.sendJSON(map[string]interface{}{
			"type": "pending-tabs",
			"tabs": tabs,
		})
		logger.Info("[Deliver] %d pending tab(s) → %s", len(tabs), msg.BrowserName)
	}
}

func handleTabsUpdate(
	conn *clientConn,
	msg inboundMsg,
	state *StateStore,
	reg *connectionRegistry,
	cfg config.Config,
) {
	if conn.browserId == "" {
		logger.Warn("[tabs-update] Ignored — no browserId on connection")
		return
	}

	if len(msg.Tabs) == 0 {
		logger.Warn("[tabs-update] Empty/missing tabs field from %s", conn.browserId)
		return
	}

	var tabs []Tab
	if err := json.Unmarshal(msg.Tabs, &tabs); err != nil {
		logger.Warn("[tabs-update] Failed to parse tabs from %s: %v (raw: %.200s)", conn.browserId, err, string(msg.Tabs))
		return
	}

	logger.Debug("[tabs-update] %s sent %d tab(s)", conn.browserId, len(tabs))
	tabs = validateTabArray(tabs, cfg.MaxTabsPerBrowser)

	lastSeen := time.Now().Format(time.RFC3339)
	state.UpdateTabs(conn.browserId, tabs)

	data, ok := state.Get(conn.browserId)
	if !ok {
		return
	}

	reg.broadcast(conn.browserId, map[string]interface{}{
		"type":        "browser-tabs-updated",
		"browserId":   conn.browserId,
		"browserName": data.BrowserName,
		"tabs":        tabs,
		"lastSeen":    lastSeen,
		"online":      true,
	})
}

func handleRequestState(conn *clientConn, state *StateStore) {
	if conn.browserId == "" {
		return
	}
	_ = conn.sendJSON(map[string]interface{}{
		"type":     "full-state",
		"browsers": state.BuildStateForClient(conn.browserId),
	})
}

func handleSendTab(
	conn *clientConn,
	msg inboundMsg,
	state *StateStore,
	pending *PendingStore,
	reg *connectionRegistry,
) {
	if conn.browserId == "" {
		return
	}

	// Parse the tab payload
	var tab struct {
		URL        string `json:"url"`
		Title      string `json:"title"`
		FavIconURL string `json:"favIconUrl"`
	}
	if err := json.Unmarshal(msg.Tab, &tab); err != nil || tab.URL == "" {
		_ = conn.sendJSON(map[string]string{"type": "error", "message": "Invalid send-tab payload"})
		return
	}
	if !isValidURL(tab.URL) {
		_ = conn.sendJSON(map[string]string{"type": "error", "message": "Invalid URL"})
		return
	}

	senderData, _ := state.Get(conn.browserId)
	pendingTab := PendingTab{
		URL:               truncate(tab.URL, 2048),
		Title:             truncate(tab.Title, 500),
		FavIconURL:        truncate(tab.FavIconURL, 2048),
		SenderBrowserID:   conn.browserId,
		SenderBrowserName: senderData.BrowserName,
		SentAt:            time.Now().Format(time.RFC3339),
	}

	if target, ok := reg.get(msg.TargetBrowserID); ok {
		// Target online — deliver immediately
		_ = target.sendJSON(map[string]interface{}{
			"type": "pending-tabs",
			"tabs": []PendingTab{pendingTab},
		})
		_ = conn.sendJSON(map[string]interface{}{
			"type":            "send-tab-ack",
			"status":          "delivered",
			"targetBrowserId": msg.TargetBrowserID,
		})
		logger.Info("[Send] %s → %s (delivered): %s", conn.browserId, msg.TargetBrowserID, tab.URL)
	} else {
		// Target offline — queue
		if err := pending.Enqueue(msg.TargetBrowserID, pendingTab); err != nil {
			_ = conn.sendJSON(map[string]string{"type": "error", "message": err.Error()})
			return
		}
		_ = conn.sendJSON(map[string]interface{}{
			"type":            "send-tab-ack",
			"status":          "queued",
			"targetBrowserId": msg.TargetBrowserID,
		})
		logger.Info("[Send] %s → %s (queued): %s", conn.browserId, msg.TargetBrowserID, tab.URL)
	}
}

func handleDisconnect(conn *clientConn, state *StateStore, reg *connectionRegistry) {
	if conn.browserId == "" {
		return
	}
	data, ok := state.Get(conn.browserId)
	if !ok {
		return
	}

	state.SetOffline(conn.browserId)
	reg.delete(conn.browserId)

	reg.broadcast(conn.browserId, map[string]interface{}{
		"type":        "presence",
		"browserId":   conn.browserId,
		"browserName": data.BrowserName,
		"online":      false,
		"lastSeen":    time.Now().Format(time.RFC3339),
	})
	logger.Info("[-] %s (%s) disconnected", data.BrowserName, conn.browserId)
}

// isValidURL mirrors server.js isValidUrl()
func isValidURL(rawURL string) bool {
	u, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(u.Scheme)
	return scheme == "http" || scheme == "https" || scheme == "ftp"
}

func truncate(s string, maxLen int) string {
	if len(s) > maxLen {
		return s[:maxLen]
	}
	return s
}
