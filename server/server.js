const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT = 9234;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'tabs.json');
const PENDING_FILE = path.join(DATA_DIR, 'pending-tabs.json');
const VERBOSE = process.argv.includes('--verbose');
const STALE_DAYS = 30;

// ─── Security Limits ─────────────────────────────────────────────────────────
const MAX_TABS_PER_BROWSER = 500;
const MAX_URL_LENGTH = 2048;
const MAX_TITLE_LENGTH = 500;
const MAX_PENDING_PER_BROWSER = 50;
const MAX_MESSAGE_SIZE = 512 * 1024; // 512 KB
const RATE_LIMIT_WINDOW_MS = 10000;  // 10 seconds
const RATE_LIMIT_MAX_MESSAGES = 50;

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Persistent Tab Store ─────────────────────────────────────────────────────
// { [browserId]: { browserName, tabs[], lastSeen, online } }
let store = loadStore();

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      const cutoff = Date.now() - STALE_DAYS * 86400000;
      const cleaned = {};
      for (const [id, data] of Object.entries(parsed)) {
        if (!id || id === 'null' || id === 'undefined') {
          console.log(`[Cleanup] Removed invalid entry: "${id}"`);
          continue;
        }
        const lastSeen = data.lastSeen ? new Date(data.lastSeen).getTime() : 0;
        if (lastSeen < cutoff) {
          console.log(`[Cleanup] Removed stale entry: ${data.browserName} (${id}) - last seen ${data.lastSeen}`);
          continue;
        }
        cleaned[id] = { ...data, online: false };
      }
      return cleaned;
    }
  } catch (err) {
    console.error('[Store] Failed to load:', err.message);
  }
  return {};
}

function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
    if (VERBOSE) console.log('[Store] Saved');
  } catch (err) {
    console.error('[Store] Save failed:', err.message);
  }
}

let saveTimeout = null;
function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveStore, 500);
}

// ─── Pending Tabs Store ──────────────────────────────────────────────────────
// { [targetBrowserId]: PendingTab[] }
let pendingTabs = loadPendingTabs();

function loadPendingTabs() {
  try {
    if (fs.existsSync(PENDING_FILE)) {
      const raw = fs.readFileSync(PENDING_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // Clean old entries
      const cutoff = Date.now() - STALE_DAYS * 86400000;
      const cleaned = {};
      for (const [id, tabs] of Object.entries(parsed)) {
        if (!id || id === 'null') continue;
        const valid = (tabs || []).filter(t => {
          const sentAt = t.sentAt ? new Date(t.sentAt).getTime() : 0;
          return sentAt > cutoff && t.url;
        });
        if (valid.length > 0) cleaned[id] = valid;
      }
      return cleaned;
    }
  } catch (err) {
    console.error('[PendingTabs] Failed to load:', err.message);
  }
  return {};
}

function savePendingTabs() {
  try {
    fs.writeFileSync(PENDING_FILE, JSON.stringify(pendingTabs, null, 2), 'utf-8');
    if (VERBOSE) console.log('[PendingTabs] Saved');
  } catch (err) {
    console.error('[PendingTabs] Save failed:', err.message);
  }
}

let savePendingTimeout = null;
function debouncedSavePending() {
  if (savePendingTimeout) clearTimeout(savePendingTimeout);
  savePendingTimeout = setTimeout(savePendingTabs, 500);
}

// ─── Input Validation ────────────────────────────────────────────────────────
function validateTabArray(tabs) {
  if (!Array.isArray(tabs)) return [];
  return tabs.slice(0, MAX_TABS_PER_BROWSER).map(t => ({
    id: typeof t.id === 'number' ? t.id : 0,
    url: typeof t.url === 'string' ? t.url.slice(0, MAX_URL_LENGTH) : '',
    title: typeof t.title === 'string' ? t.title.slice(0, MAX_TITLE_LENGTH) : 'New Tab',
    favIconUrl: typeof t.favIconUrl === 'string' ? t.favIconUrl.slice(0, MAX_URL_LENGTH) : '',
    pinned: !!t.pinned,
    windowId: typeof t.windowId === 'number' ? t.windowId : 0,
    active: !!t.active,
    lastAccessed: typeof t.lastAccessed === 'number' ? t.lastAccessed : Date.now(),
    incognito: !!t.incognito,
  }));
}

function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'ftp:'].includes(parsed.protocol);
  } catch { return false; }
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────
function isRateLimited(ws) {
  const now = Date.now();
  if (!ws._msgTimestamps) ws._msgTimestamps = [];
  ws._msgTimestamps.push(now);
  ws._msgTimestamps = ws._msgTimestamps.filter(t => t > now - RATE_LIMIT_WINDOW_MS);
  return ws._msgTimestamps.length > RATE_LIMIT_MAX_MESSAGES;
}

// ─── HTTP Server (health endpoint) ───────────────────────────────────────────
const httpServer = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const summary = {};
    for (const [id, data] of Object.entries(store)) {
      if (!id || id === 'null' || id === 'undefined') continue;
      summary[id] = {
        browserName: data.browserName,
        tabCount: (data.tabs || []).length,
        online: data.online,
        lastSeen: data.lastSeen,
      };
    }
    res.end(JSON.stringify({ status: 'ok', browsers: summary }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// ─── WebSocket Server ─────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server: httpServer, maxPayload: MAX_MESSAGE_SIZE });
const connections = new Map(); // browserId -> ws

wss.on('connection', (ws) => {
  let clientId = null;

  ws.on('message', (raw) => {
    // Rate limiting
    if (isRateLimited(ws)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limited' }));
      return;
    }

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (VERBOSE) console.log('[MSG]', msg.type, msg.browserId || '');

    switch (msg.type) {
      case 'register': {
        // ─── VALIDATION: reject null/empty browserIds ─────────────────
        if (!msg.browserId || msg.browserId === 'null' || msg.browserId === 'undefined') {
          console.warn('[!] Rejected register with invalid browserId:', msg.browserId);
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid browserId' }));
          ws.close(4000, 'Invalid browserId');
          return;
        }
        if (!msg.browserName) {
          console.warn('[!] Rejected register with empty browserName from:', msg.browserId);
          ws.send(JSON.stringify({ type: 'error', message: 'Missing browserName' }));
          ws.close(4001, 'Missing browserName');
          return;
        }

        clientId = msg.browserId;

        // If another socket is already connected with this ID, close the old one
        const existing = connections.get(clientId);
        if (existing && existing !== ws && existing.readyState === WebSocket.OPEN) {
          console.log(`[~] Replacing stale connection for ${clientId}`);
          existing.close(4002, 'Replaced by new connection');
        }
        connections.set(clientId, ws);

        // ─── DEDUPLICATION: merge stale entries with same browserName ────
        for (const [oldId, oldData] of Object.entries(store)) {
          if (oldId === clientId) continue;
          if (!oldId || oldId === 'null') continue;
          if (oldData.browserName !== msg.browserName) continue;
          if (oldData.online) continue;
          const oldConn = connections.get(oldId);
          if (oldConn && oldConn.readyState === WebSocket.OPEN) continue;
          console.log(`[Dedup] Removing stale entry "${oldId}" (replaced by "${clientId}" for ${msg.browserName})`);
          delete store[oldId];
          connections.delete(oldId);
        }

        if (!store[clientId]) {
          store[clientId] = {
            browserName: msg.browserName,
            tabs: [],
            lastSeen: new Date().toISOString(),
            online: true,
          };
        } else {
          store[clientId].browserName = msg.browserName;
          store[clientId].online = true;
          store[clientId].lastSeen = new Date().toISOString();
        }
        debouncedSave();

        // Send full state (excluding self)
        ws.send(JSON.stringify({
          type: 'full-state',
          browsers: buildStateForClient(clientId),
        }));

        broadcastPresence(clientId, true);
        console.log(`[+] ${store[clientId].browserName} (${clientId}) connected`);

        // ─── Deliver pending tabs ────────────────────────────────────
        if (pendingTabs[clientId] && pendingTabs[clientId].length > 0) {
          ws.send(JSON.stringify({ type: 'pending-tabs', tabs: pendingTabs[clientId] }));
          console.log(`[Send] Delivered ${pendingTabs[clientId].length} pending tab(s) to ${clientId}`);
          delete pendingTabs[clientId];
          debouncedSavePending();
        }
        break;
      }

      case 'tabs-update': {
        if (!clientId || !store[clientId]) return;
        store[clientId].tabs = validateTabArray(msg.tabs);
        store[clientId].lastSeen = new Date().toISOString();
        debouncedSave();

        broadcast(clientId, {
          type: 'browser-tabs-updated',
          browserId: clientId,
          browserName: store[clientId].browserName,
          tabs: store[clientId].tabs,
          lastSeen: store[clientId].lastSeen,
          online: true,
        });
        break;
      }

      case 'request-state': {
        if (!clientId) return;
        ws.send(JSON.stringify({
          type: 'full-state',
          browsers: buildStateForClient(clientId),
        }));
        break;
      }

      case 'send-tab': {
        if (!clientId || !store[clientId]) return;

        // Validate payload
        if (!msg.targetBrowserId || !msg.tab || !msg.tab.url) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid send-tab payload' }));
          return;
        }
        if (!isValidUrl(msg.tab.url)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid URL' }));
          return;
        }

        const pendingTab = {
          url: String(msg.tab.url).slice(0, MAX_URL_LENGTH),
          title: String(msg.tab.title || '').slice(0, MAX_TITLE_LENGTH),
          favIconUrl: String(msg.tab.favIconUrl || '').slice(0, MAX_URL_LENGTH),
          senderBrowserId: clientId,
          senderBrowserName: store[clientId].browserName,
          sentAt: new Date().toISOString(),
        };

        const targetWs = connections.get(msg.targetBrowserId);
        if (targetWs && targetWs.readyState === WebSocket.OPEN) {
          // Target online — deliver immediately
          targetWs.send(JSON.stringify({ type: 'pending-tabs', tabs: [pendingTab] }));
          ws.send(JSON.stringify({ type: 'send-tab-ack', status: 'delivered', targetBrowserId: msg.targetBrowserId }));
          console.log(`[Send] Tab from ${clientId} → ${msg.targetBrowserId} (delivered)`);
        } else {
          // Target offline — queue
          if (!pendingTabs[msg.targetBrowserId]) pendingTabs[msg.targetBrowserId] = [];
          if (pendingTabs[msg.targetBrowserId].length >= MAX_PENDING_PER_BROWSER) {
            ws.send(JSON.stringify({ type: 'error', message: 'Pending queue full for target browser' }));
            return;
          }
          pendingTabs[msg.targetBrowserId].push(pendingTab);
          debouncedSavePending();
          ws.send(JSON.stringify({ type: 'send-tab-ack', status: 'queued', targetBrowserId: msg.targetBrowserId }));
          console.log(`[Send] Tab from ${clientId} → ${msg.targetBrowserId} (queued)`);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    if (clientId && store[clientId]) {
      store[clientId].online = false;
      store[clientId].lastSeen = new Date().toISOString();
      connections.delete(clientId);
      debouncedSave();
      broadcastPresence(clientId, false);
      console.log(`[-] ${store[clientId].browserName} (${clientId}) disconnected`);
    }
  });

  ws.on('error', (err) => console.error('[WS Error]', err.message));
});

function buildStateForClient(excludeId) {
  const result = {};
  for (const [id, data] of Object.entries(store)) {
    if (id === excludeId) continue;
    if (!id || id === 'null' || id === 'undefined') continue;
    if (!data || !data.browserName) continue;
    result[id] = {
      browserName: data.browserName,
      tabs: data.tabs || [],
      lastSeen: data.lastSeen,
      online: data.online,
    };
  }
  return result;
}

function broadcast(excludeId, message) {
  const payload = JSON.stringify(message);
  for (const [id, client] of connections) {
    if (id !== excludeId && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastPresence(id, online) {
  broadcast(id, {
    type: 'presence',
    browserId: id,
    browserName: store[id]?.browserName,
    online,
    lastSeen: store[id]?.lastSeen,
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
httpServer.listen(PORT, '127.0.0.1', () => {
  const n = Object.keys(store).length;
  const p = Object.values(pendingTabs).reduce((sum, arr) => sum + arr.length, 0);
  console.log(`[SyncTabs Server] ws://127.0.0.1:${PORT}`);
  console.log(`[SyncTabs Server] Health: http://127.0.0.1:${PORT}/health`);
  console.log(`[SyncTabs Server] ${n} browser(s) in store, ${p} pending tab(s)`);
});

// Graceful shutdown
function shutdown() {
  console.log('\n[SyncTabs Server] Shutting down...');
  saveStore();
  savePendingTabs();
  wss.close();
  httpServer.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
