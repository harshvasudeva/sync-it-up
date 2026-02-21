// ─── SyncTabs Background Service Worker ───────────────────────────────────────
// Works fully standalone (local tab persistence).
// Optionally connects to local SyncTabs Companion server for cross-browser sync.
// Store-compliant: no mandatory external dependencies.

// ─── Default Settings ─────────────────────────────────────────────────────────
const DEFAULTS = {
  serverUrl: 'ws://127.0.0.1:9234',
  serverEnabled: true,
  reconnectMs: 5000,
  syncDebounceMs: 1000,
  serverAutoDetect: true,
};

const HEARTBEAT_ALARM = 'synctabs-heartbeat';
const SERVER_DETECT_ALARM = 'synctabs-server-detect';

let ws = null;
let browserId = null;
let browserName = null;
let tabSyncTimeout = null;
let isConnected = false;
let settings = { ...DEFAULTS };
let serverDetected = false;
let reconnectTimer = null;
let initDone = false;
let initPromise = null;

// ─── Initialization Gate ──────────────────────────────────────────────────────
// Every handler must await this before using browserId/browserName.
function waitForInit() {
  if (initDone) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      await loadSettings();
      await getOrCreateBrowserId();
      initDone = true;
      console.log(`[SyncTabs] Initialized: ${browserName} (${browserId})`);
    })();
  }
  return initPromise;
}

// ─── Settings ─────────────────────────────────────────────────────────────────
async function loadSettings() {
  const result = await chrome.storage.local.get('synctabs_settings');
  if (result.synctabs_settings) {
    settings = { ...DEFAULTS, ...result.synctabs_settings };
  }
}

async function saveSettings(partial) {
  settings = { ...settings, ...partial };
  await chrome.storage.local.set({ synctabs_settings: settings });
}

// ─── Browser Detection ────────────────────────────────────────────────────────
function detectBrowser() {
  const ua = navigator.userAgent;
  // Order matters: more specific brands first
  if (ua.includes('Edg/')) return 'Microsoft Edge';
  if (ua.includes('Brave')) return 'Brave';
  if (ua.includes('Vivaldi')) return 'Vivaldi';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Chrome/')) return 'Google Chrome';
  return 'Chromium Browser';
}

// ─── Unique Browser ID ────────────────────────────────────────────────────────
async function getOrCreateBrowserId() {
  const result = await chrome.storage.local.get(['synctabs_browser_id', 'synctabs_browser_name']);
  if (result.synctabs_browser_id) {
    browserId = result.synctabs_browser_id;
    // Always re-detect; UA can change after browser update
    browserName = detectBrowser();
    // Persist updated name
    if (browserName !== result.synctabs_browser_name) {
      await chrome.storage.local.set({ synctabs_browser_name: browserName });
    }
    return;
  }
  // First-time install
  const detected = detectBrowser();
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  browserId = `${detected.replace(/\s+/g, '-').toLowerCase()}-${hex}`;
  browserName = detected;
  await chrome.storage.local.set({
    synctabs_browser_id: browserId,
    synctabs_browser_name: browserName,
  });
}

// ─── URL Validation ──────────────────────────────────────────────────────────
function isValidUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'ftp:'].includes(parsed.protocol);
  } catch { return false; }
}

// ─── Tab Collection ───────────────────────────────────────────────────────────
async function collectTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    // Build a window incognito map for labeling
    const windowIncognito = {};
    const windowIds = [...new Set(tabs.map(t => t.windowId))];
    for (const wid of windowIds) {
      try {
        const win = await chrome.windows.get(wid);
        windowIncognito[wid] = win.incognito;
      } catch { windowIncognito[wid] = false; }
    }
    return tabs.map(t => ({
      id: t.id,
      url: t.url || t.pendingUrl || '',
      title: t.title || 'New Tab',
      favIconUrl: t.favIconUrl || '',
      pinned: t.pinned,
      windowId: t.windowId,
      active: t.active,
      lastAccessed: t.lastAccessed || Date.now(),
      incognito: windowIncognito[t.windowId] || false,
    }));
  } catch (err) {
    console.error('[SyncTabs] Failed to collect tabs:', err);
    return [];
  }
}

// ─── Local Persistence ────────────────────────────────────────────────────────
async function saveTabsLocally(tabs) {
  await chrome.storage.local.set({
    synctabs_my_tabs: tabs,
    synctabs_my_last_seen: new Date().toISOString(),
  });
}

async function saveRemoteBrowsers(browsers) {
  await chrome.storage.local.set({ synctabs_remote_browsers: browsers });
}

async function getRemoteBrowsers() {
  const result = await chrome.storage.local.get('synctabs_remote_browsers');
  return result.synctabs_remote_browsers || {};
}

async function getLocalTabs() {
  const result = await chrome.storage.local.get(['synctabs_my_tabs', 'synctabs_my_last_seen']);
  return { tabs: result.synctabs_my_tabs || [], lastSeen: result.synctabs_my_last_seen || null };
}

// ─── Self-Deduplication ──────────────────────────────────────────────────────
// Filters out our own browser from the remote browsers cache.
// This prevents duplication when the browserId changed (reinstall, storage clear)
// or when the server's full-state hasn't been processed yet.
function filterSelfFromRemote(browsers) {
  if (!browsers || !browserId) return browsers || {};
  const filtered = {};
  for (const [id, data] of Object.entries(browsers)) {
    // Skip exact ID match
    if (id === browserId) continue;
    // Skip null/broken entries
    if (!id || id === 'null' || id === 'undefined') continue;
    filtered[id] = data;
  }
  return filtered;
}

// ─── Snapshots (persist on last window close) ─────────────────────────────────
async function saveSnapshot() {
  const tabs = await collectTabs();
  await chrome.storage.local.set({
    synctabs_snapshot: tabs,
    synctabs_snapshot_time: new Date().toISOString(),
  });
}

async function getSnapshot() {
  const result = await chrome.storage.local.get(['synctabs_snapshot', 'synctabs_snapshot_time']);
  return { tabs: result.synctabs_snapshot || [], time: result.synctabs_snapshot_time || null };
}

// ─── Server Auto-Detection ────────────────────────────────────────────────────
async function probeServer() {
  if (!settings.serverEnabled) return false;
  const hasPerm = await hasHostPermission();
  if (!hasPerm) return false;
  try {
    const httpUrl = settings.serverUrl.replace('ws://', 'http://').replace('wss://', 'https://');
    const resp = await fetch(`${httpUrl}/health`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data.status === 'ok') { serverDetected = true; return true; }
    }
  } catch { /* server not running or no permission */ }
  return false;
}

// ─── Host Permission ──────────────────────────────────────────────────────────
async function hasHostPermission() {
  try { return await chrome.permissions.contains({ origins: ['http://127.0.0.1:9234/*'] }); }
  catch { return false; }
}

// ─── WebSocket Connection ─────────────────────────────────────────────────────
async function connectWebSocket() {
  await waitForInit();  // ← CRITICAL: never connect before we have browserId

  if (!settings.serverEnabled) return;
  if (!browserId) { console.warn('[SyncTabs] No browserId — aborting connection'); return; }

  // Already connected — nothing to do
  if (ws && ws.readyState === WebSocket.OPEN) return;

  // Close stale CONNECTING socket (localhost should connect instantly)
  if (ws && ws.readyState === WebSocket.CONNECTING) {
    try { ws.close(); } catch {}
    ws = null;
  }

  const hasPerm = await hasHostPermission();
  if (!hasPerm) { console.log('[SyncTabs] No host permission — skipping'); return; }

  try { ws = new WebSocket(settings.serverUrl); }
  catch (err) { console.warn('[SyncTabs] WS creation failed:', err.message); scheduleReconnect(); return; }

  ws.onopen = async () => {
    console.log('[SyncTabs] Connected to server');
    isConnected = true;
    serverDetected = true;
    // Capture local reference — module-level `ws` may be replaced during awaits
    const socket = ws;
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'register', browserId, browserName }));
    const tabs = await collectTabs();
    await saveTabsLocally(tabs);
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: 'tabs-update', tabs }));
    notifyPopup({ type: 'connection-status', connected: true, serverDetected: true });
  };

  ws.onmessage = async (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    switch (msg.type) {
      case 'full-state': {
        // REPLACE local cache entirely — server is source of truth.
        // Filter out any entry that matches our own browserId (safety).
        const cleaned = {};
        for (const [id, data] of Object.entries(msg.browsers || {})) {
          if (id === browserId) continue;         // skip self
          if (!id || id === 'null') continue;     // skip broken entries
          cleaned[id] = data;
        }
        await saveRemoteBrowsers(cleaned);
        notifyPopup({ type: 'state-updated', browsers: cleaned });
        break;
      }
      case 'browser-tabs-updated': {
        if (msg.browserId === browserId) break;   // skip self
        if (!msg.browserId || msg.browserId === 'null') break;
        const remote = filterSelfFromRemote(await getRemoteBrowsers());
        remote[msg.browserId] = {
          browserName: msg.browserName,
          tabs: msg.tabs,
          lastSeen: msg.lastSeen,
          online: msg.online,
        };
        await saveRemoteBrowsers(remote);
        notifyPopup({ type: 'state-updated', browsers: remote });
        break;
      }
      case 'presence': {
        if (msg.browserId === browserId) break;
        if (!msg.browserId || msg.browserId === 'null') break;
        const remote2 = filterSelfFromRemote(await getRemoteBrowsers());
        if (remote2[msg.browserId]) {
          remote2[msg.browserId].online = msg.online;
          remote2[msg.browserId].lastSeen = msg.lastSeen;
          await saveRemoteBrowsers(remote2);
          notifyPopup({ type: 'state-updated', browsers: remote2 });
        }
        break;
      }
      case 'pending-tabs': {
        const tabs = msg.tabs || [];
        let opened = 0;
        for (const pt of tabs) {
          if (pt.url && isValidUrl(pt.url)) {
            chrome.tabs.create({ url: pt.url, active: false });
            opened++;
          }
        }
        if (opened > 0) {
          const sender = tabs[0]?.senderBrowserName || 'Another browser';
          notifyPopup({ type: 'tabs-received', count: opened, senderName: sender });
        }
        break;
      }
      case 'send-tab-ack': {
        notifyPopup({ type: 'send-tab-ack', status: msg.status, targetBrowserId: msg.targetBrowserId });
        break;
      }
    }
  };

  ws.onclose = () => {
    console.log('[SyncTabs] Disconnected');
    isConnected = false;
    ws = null;
    notifyPopup({ type: 'connection-status', connected: false, serverDetected });
    scheduleReconnect();
  };

  ws.onerror = () => { console.warn('[SyncTabs] WS error'); };
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    if (!isConnected && settings.serverEnabled) {
      const found = await probeServer();
      if (found) connectWebSocket();
    }
  }, settings.reconnectMs);
}

// ─── Tab Change Monitoring ────────────────────────────────────────────────────
function debouncedTabSync() {
  if (tabSyncTimeout) clearTimeout(tabSyncTimeout);
  tabSyncTimeout = setTimeout(async () => {
    await waitForInit();
    const tabs = await collectTabs();
    await saveTabsLocally(tabs);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'tabs-update', tabs }));
    }
  }, settings.syncDebounceMs);
}

chrome.tabs.onCreated.addListener(debouncedTabSync);
chrome.tabs.onRemoved.addListener(debouncedTabSync);
chrome.tabs.onUpdated.addListener((_, info) => {
  if (info.url || info.title || info.status === 'complete') debouncedTabSync();
});
chrome.tabs.onMoved.addListener(debouncedTabSync);
chrome.tabs.onAttached.addListener(debouncedTabSync);
chrome.tabs.onDetached.addListener(debouncedTabSync);
chrome.tabs.onReplaced.addListener(debouncedTabSync);
chrome.windows.onCreated.addListener(debouncedTabSync);
chrome.windows.onRemoved.addListener(async () => { await saveSnapshot(); debouncedTabSync(); });

// ─── Popup / Options Communication ────────────────────────────────────────────
function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'get-state': {
      (async () => {
        await waitForInit();
        const remoteBrowsers = await getRemoteBrowsers();
        // Filter out self from remote browsers (defense against stale cache)
        const filtered = filterSelfFromRemote(remoteBrowsers);
        const localTabs = await getLocalTabs();
        const snapshot = await getSnapshot();
        const hasPerm = await hasHostPermission();
        sendResponse({
          connected: isConnected,
          serverDetected,
          serverEnabled: settings.serverEnabled,
          hasHostPermission: hasPerm,
          browserId,
          browserName,
          myTabs: localTabs.tabs,
          myLastSeen: localTabs.lastSeen,
          remoteBrowsers: filtered,
          snapshot,
          settings,
        });
      })();
      return true;
    }
    case 'force-sync': {
      (async () => {
        await waitForInit();
        // 1. Clear stale remote cache
        await saveRemoteBrowsers({});
        // 2. Collect + save local tabs
        const tabs = await collectTabs();
        await saveTabsLocally(tabs);
        // 3. If not connected, try reconnecting first
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          const hasPerm = await hasHostPermission();
          if (hasPerm && settings.serverEnabled) {
            const found = await probeServer();
            if (found) {
              await connectWebSocket();
              // Give onopen a moment to fire and register
              await new Promise(r => setTimeout(r, 300));
            }
          }
        }
        // 4. Push to server if connected
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'tabs-update', tabs }));
          // 5. Request fresh full-state from server (replaces remote cache)
          ws.send(JSON.stringify({ type: 'request-state' }));
          // Give server time to respond with full-state
          await new Promise(r => setTimeout(r, 300));
        }
        // 6. Return fresh state to popup (filter self from remote)
        const remoteBrowsers = await getRemoteBrowsers();
        const filtered = filterSelfFromRemote(remoteBrowsers);
        const localTabs = await getLocalTabs();
        const snapshot = await getSnapshot();
        const permCheck = await hasHostPermission();
        sendResponse({
          connected: isConnected,
          serverDetected,
          serverEnabled: settings.serverEnabled,
          hasHostPermission: permCheck,
          browserId,
          browserName,
          myTabs: localTabs.tabs,
          myLastSeen: localTabs.lastSeen,
          remoteBrowsers: filtered,
          snapshot,
          settings,
        });
      })();
      return true;
    }
    case 'reconnect': {
      (async () => {
        await waitForInit();
        const hasPerm = await hasHostPermission();
        if (!hasPerm) {
          sendResponse({ ok: false, found: false, reason: 'no-permission' });
          return;
        }
        const found = await probeServer();
        if (!found) {
          sendResponse({ ok: false, found: false, reason: 'server-not-found' });
          return;
        }
        // Close stale socket before reconnecting
        if (ws && ws.readyState !== WebSocket.OPEN) {
          try { ws.close(); } catch {}
          ws = null;
          isConnected = false;
        }
        await connectWebSocket();
        // Give onopen a moment to fire
        await new Promise(r => setTimeout(r, 500));
        sendResponse({ ok: isConnected, found: true, connected: isConnected });
      })();
      return true;
    }
    case 'update-settings': {
      (async () => {
        const oldEnabled = settings.serverEnabled;
        await saveSettings(msg.settings);
        if (settings.serverEnabled && !oldEnabled) {
          const found = await probeServer();
          if (found) connectWebSocket();
        } else if (!settings.serverEnabled && ws) {
          ws.close();
        }
        sendResponse({ ok: true, settings });
      })();
      return true;
    }
    case 'get-settings': {
      sendResponse({ settings });
      return false;
    }
    case 'clear-remote-browsers': {
      (async () => {
        await saveRemoteBrowsers({});
        sendResponse({ ok: true });
      })();
      return true;
    }
    case 'send-tab': {
      (async () => {
        await waitForInit();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'send-tab',
            targetBrowserId: msg.targetBrowserId,
            tab: msg.tab,
          }));
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'Not connected to server' });
        }
      })();
      return true;
    }

    // ─── Companion App Config API ────────────────────────────────────────────
    case 'get-companion-config': {
      (async () => {
        await waitForInit();
        try {
          const httpUrl = settings.serverUrl
            .replace('ws://', 'http://')
            .replace('wss://', 'https://');
          const resp = await fetch(`${httpUrl}/config`, {
            signal: AbortSignal.timeout(3000),
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const cfg = await resp.json();
          sendResponse({ ok: true, config: cfg });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
    }

    case 'set-companion-config': {
      (async () => {
        await waitForInit();
        try {
          const httpUrl = settings.serverUrl
            .replace('ws://', 'http://')
            .replace('wss://', 'https://');
          const resp = await fetch(`${httpUrl}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(msg.config),
            signal: AbortSignal.timeout(5000),
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const result = await resp.json();
          sendResponse({ ok: true, result });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
    }

    case 'get-companion-status': {
      (async () => {
        await waitForInit();
        try {
          const httpUrl = settings.serverUrl
            .replace('ws://', 'http://')
            .replace('wss://', 'https://');
          const resp = await fetch(`${httpUrl}/status`, {
            signal: AbortSignal.timeout(2000),
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const status = await resp.json();
          sendResponse({ ok: true, status });
        } catch (err) {
          sendResponse({ ok: false, error: err.message });
        }
      })();
      return true;
    }
  }
});

// ─── Alarms ───────────────────────────────────────────────────────────────────
chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
chrome.alarms.create(SERVER_DETECT_ALARM, { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  await waitForInit();  // ← gate on init

  if (alarm.name === HEARTBEAT_ALARM) {
    debouncedTabSync();
    if (!isConnected && settings.serverEnabled) {
      const found = await probeServer();
      if (found) connectWebSocket();
    }
  }
  if (alarm.name === SERVER_DETECT_ALARM) {
    if (settings.serverAutoDetect && !isConnected) {
      const found = await probeServer();
      if (found) {
        notifyPopup({ type: 'server-detected' });
        connectWebSocket();
      }
    }
  }
});

// ─── Install Event ────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
});

// ─── Startup ──────────────────────────────────────────────────────────────────
(async () => {
  await waitForInit();
  debouncedTabSync();

  if (settings.serverEnabled) {
    const found = await probeServer();
    if (found) {
      console.log('[SyncTabs] Local server detected — connecting');
      connectWebSocket();
    } else {
      console.log('[SyncTabs] No local server — local-only mode');
    }
  }
})();