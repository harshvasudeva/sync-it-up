// ─── SyncTabs Popup ───────────────────────────────────────────────────────────
// Store-compliant: fully functional in local-only mode. Server sync is optional.

const BROWSER_ICONS = {
  'Google Chrome': '🔵',
  'Microsoft Edge': '🟢',
  'Brave': '🟠',
  'Vivaldi': '🔴',
  'Opera': '🔴',
  'Chromium Browser': '⚪',
};

// Internal URL prefixes where send/incognito actions don't make sense
const INTERNAL_PROTOCOLS = ['chrome:', 'edge:', 'about:', 'chrome-extension:', 'brave:'];

const COMPANION_URL = 'https://github.com/harshvasudeva';
const AUTHOR_GITHUB = 'https://github.com/harshvasudeva';

SyncTabsTheme.initFromStorage().catch(() => {});

// ─── DOM Elements ─────────────────────────────────────────────────────────────
const connectionDot = document.getElementById('connection-dot');
const btnSync = document.getElementById('btn-sync');
const btnSettings = document.getElementById('btn-settings');
const selfBrowserIcon = document.getElementById('self-browser-icon');
const selfBrowserName = document.getElementById('self-browser-name');
const selfTabCount = document.getElementById('self-tab-count');
const selfTabsEl = document.getElementById('self-tabs');
const remoteBrowsersEl = document.getElementById('remote-browsers');
const emptyState = document.getElementById('empty-state');
const emptyNoServer = document.getElementById('empty-no-server');
const emptyNoBrowsers = document.getElementById('empty-no-browsers');
const serverStatus = document.getElementById('server-status');
const serverBanner = document.getElementById('server-banner');
const btnEnableSync = document.getElementById('btn-enable-sync');
const btnDismissBanner = document.getElementById('btn-dismiss-banner');
const linkCompanion = document.getElementById('link-companion');
const toastContainer = document.getElementById('toast-container');

// ─── State ────────────────────────────────────────────────────────────────────
let state = {
  connected: false,
  serverDetected: false,
  serverEnabled: true,
  hasHostPermission: false,
  browserId: null,
  browserName: null,
  myTabs: [],
  remoteBrowsers: {},
  snapshot: { tabs: [], time: null },
  settings: {},
};

// Session-scoped set of hidden remote tabs (cosmetic removal)
const hiddenRemoteTabs = new Set();

// Currently open send-dropdown (for dismissal)
let activeSendDropdown = null;

// ─── Initialize ───────────────────────────────────────────────────────────────
async function init() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'get-state' });
    if (response) {
      state = response;
      SyncTabsTheme.setPreference(state?.settings?.theme);
      render();
    }
  } catch (err) {
    console.error('[SyncTabs Popup] Init failed:', err);
    serverStatus.textContent = 'Extension error — try reopening';
  }
}

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  renderConnectionStatus();
  renderServerBanner();
  renderSelfBrowser();
  renderRemoteBrowsers();
}

function renderConnectionStatus() {
  const hasRemote = Object.keys(state.remoteBrowsers || {}).length > 0;
  if (state.connected) {
    connectionDot.className = 'dot dot-online';
    connectionDot.title = 'Connected to SyncTabs Companion';
    serverStatus.innerHTML = `<span class="mode-badge mode-sync">sync</span> ${state.browserName || 'This Browser'}`;
  } else if (state.serverDetected || hasRemote) {
    connectionDot.className = 'dot dot-stale';
    connectionDot.title = 'Server offline — showing cached data';
    serverStatus.innerHTML = `<span class="mode-badge mode-local">local</span> Server offline · cached data`;
  } else {
    connectionDot.className = 'dot dot-offline';
    connectionDot.title = 'Local-only mode';
    serverStatus.innerHTML = `<span class="mode-badge mode-local">local</span> ${state.browserName || 'This Browser'}`;
  }
}

function renderServerBanner() {
  const hasDismissed = sessionStorage.getItem('synctabs_banner_dismissed');
  const hasRemote = Object.keys(state.remoteBrowsers || {}).length > 0;
  serverBanner.style.display =
    (!state.connected && !hasRemote && !hasDismissed && state.serverEnabled) ? 'block' : 'none';
}

function renderSelfBrowser() {
  const name = state.browserName || 'This Browser';
  selfBrowserIcon.textContent = BROWSER_ICONS[name] || '🌐';
  selfBrowserName.textContent = `${name} (this)`;
  selfTabCount.textContent = state.myTabs.length;
  selfTabsEl.innerHTML = '';

  if (state.myTabs.length === 0) {
    selfTabsEl.innerHTML = '<div class="empty-state"><p>No tabs found</p></div>';
    return;
  }

  // Group by window
  const windows = {};
  for (const tab of state.myTabs) {
    const wid = tab.windowId || 0;
    if (!windows[wid]) windows[wid] = [];
    windows[wid].push(tab);
  }

  const windowIds = Object.keys(windows);
  for (let i = 0; i < windowIds.length; i++) {
    const tabs = windows[windowIds[i]];
    if (windowIds.length > 1) {
      const isPrivate = tabs.some(t => t.incognito);
      const label = document.createElement('div');
      label.className = `window-label${isPrivate ? ' window-label-private' : ''}`;
      label.textContent = isPrivate
        ? `Private Window (${tabs.length} tabs)`
        : `Window ${i + 1} (${tabs.length} tabs)`;
      selfTabsEl.appendChild(label);
    }
    for (const tab of tabs) selfTabsEl.appendChild(createTabElement(tab, true));
  }
}

function renderRemoteBrowsers() {
  remoteBrowsersEl.innerHTML = '';
  const browsers = state.remoteBrowsers || {};
  const browserIds = Object.keys(browsers);

  // Filter out broken entries and self
  const validEntries = browserIds.filter(id => {
    if (!id || id === 'null' || id === 'undefined') return false;
    if (id === state.browserId) return false; // skip self
    const data = browsers[id];
    if (!data || !data.browserName) return false;
    return true;
  });

  // Empty state
  emptyState.style.display = 'none';
  emptyNoServer.style.display = 'none';
  emptyNoBrowsers.style.display = 'none';

  if (validEntries.length === 0) {
    emptyState.style.display = 'block';
    if (!state.connected && !state.serverDetected) {
      emptyNoServer.style.display = 'block';
    } else {
      emptyNoBrowsers.style.display = 'block';
    }
    return;
  }

  for (const id of validEntries) {
    const data = browsers[id];
    const name = data.browserName;
    const isOnline = data.online;
    const dotClass = isOnline ? 'dot-online' : 'dot-stale';
    const lastSeenStr = data.lastSeen ? formatLastSeen(data.lastSeen) : 'unknown';
    // Filter out hidden tabs
    const visibleTabs = (data.tabs || []).filter(t => !hiddenRemoteTabs.has(tabKey(t)));
    const tabCount = visibleTabs.length;
    const icon = BROWSER_ICONS[name] || '🌐';

    const section = document.createElement('section');
    section.className = 'section';
    section.innerHTML = `
      <div class="section-header">
        <div class="section-title">
          <span class="browser-icon">${icon}</span>
          <span>${name}</span>
          <span class="tab-count">${tabCount}</span>
          <span class="dot ${dotClass}" style="margin-left:6px"></span>
          <span class="last-seen">${isOnline ? 'online' : lastSeenStr}</span>
        </div>
        <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </div>
      <div class="tab-list"></div>
    `;

    const tabList = section.querySelector('.tab-list');
    if (tabCount === 0) {
      tabList.innerHTML = '<div class="empty-state"><p>No tabs saved</p></div>';
    } else {
      for (const tab of visibleTabs) tabList.appendChild(createTabElement(tab, false));
    }

    section.querySelector('.section-header').addEventListener('click', () => {
      section.classList.toggle('collapsed');
    });

    remoteBrowsersEl.appendChild(section);
  }
}

// ─── Tab Element ──────────────────────────────────────────────────────────────
function createTabElement(tab, isLocal) {
  const item = document.createElement(isLocal ? 'div' : 'a');
  item.className = 'tab-item';

  if (!isLocal && tab.url && !isInternalUrl(tab.url)) {
    item.href = tab.url;
    item.target = '_blank';
    item.rel = 'noopener';
  }

  if (isLocal) {
    item.addEventListener('click', (e) => {
      // Don't switch tab if an action button was clicked
      if (e.target.closest('.tab-actions')) return;
      if (tab.id) {
        chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId) chrome.windows.update(tab.windowId, { focused: true });
      }
    });
    item.style.cursor = 'pointer';
  }

  // Favicon
  const faviconUrl = tab.favIconUrl || getFaviconFromUrl(tab.url);
  let favicon;
  if (faviconUrl && !faviconUrl.startsWith('chrome://') && !faviconUrl.startsWith('edge://') && !faviconUrl.startsWith('chrome-extension://') && !faviconUrl.startsWith('extension://') && !faviconUrl.startsWith('brave://')) {
    favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = faviconUrl;
    favicon.onerror = function () { this.replaceWith(createFaviconPlaceholder(tab.title)); };
  } else {
    favicon = createFaviconPlaceholder(tab.title);
  }

  const info = document.createElement('div');
  info.className = 'tab-info';
  const title = document.createElement('div');
  title.className = 'tab-title';
  title.textContent = tab.title || 'New Tab';
  const url = document.createElement('div');
  url.className = 'tab-url';
  url.textContent = simplifyUrl(tab.url);
  info.appendChild(title);
  info.appendChild(url);

  item.appendChild(favicon);
  item.appendChild(info);

  if (tab.pinned) {
    const pin = document.createElement('span');
    pin.className = 'tab-pinned-icon';
    pin.textContent = '📌';
    pin.title = 'Pinned';
    item.appendChild(pin);
  }
  if (tab.active && isLocal) {
    const dot = document.createElement('span');
    dot.className = 'tab-active-dot';
    dot.title = 'Active tab';
    item.appendChild(dot);
  }

  // ─── Action Buttons ───────────────────────────────────────────────────
  const actions = document.createElement('div');
  actions.className = 'tab-actions';

  const isInternal = isInternalUrl(tab.url);
  const hasRemote = Object.keys(state.remoteBrowsers || {}).length > 0;

  // Copy URL (always available if there's a URL)
  if (tab.url && !isInternal) {
    actions.appendChild(createActionBtn('copy', 'Copy URL', SVG_COPY, () => handleCopyUrl(tab)));
  }

  // Open in Incognito (not for internal URLs)
  if (tab.url && !isInternal) {
    actions.appendChild(createActionBtn('incognito', 'Open in private window', SVG_INCOGNITO, () => handleOpenIncognito(tab)));
  }

  // Send to another browser (only for local tabs when server is connected and has remote browsers)
  if (isLocal && state.connected && hasRemote && tab.url && !isInternal) {
    actions.appendChild(createActionBtn('send', 'Send to another browser', SVG_SEND, (e) => handleSendTab(e, tab)));
  }

  // Close / Remove
  if (isLocal) {
    actions.appendChild(createActionBtn('close', 'Close tab', SVG_CLOSE, () => handleCloseTab(tab, item)));
  } else {
    actions.appendChild(createActionBtn('close', 'Hide from list', SVG_CLOSE, () => handleHideRemoteTab(tab, item)));
  }

  item.appendChild(actions);
  return item;
}

function createActionBtn(action, title, svgHtml, onClick) {
  const btn = document.createElement('button');
  btn.className = 'tab-action-btn';
  btn.dataset.action = action;
  btn.title = title;
  btn.innerHTML = svgHtml;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick(e);
  });
  return btn;
}

function createFaviconPlaceholder(title) {
  const el = document.createElement('div');
  el.className = 'tab-favicon-placeholder';
  el.textContent = (title || '?')[0].toUpperCase();
  return el;
}

// ─── Action SVG Icons (14x14, matching existing stroke style) ────────────────
const SVG_COPY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
</svg>`;

const SVG_INCOGNITO = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
</svg>`;

const SVG_SEND = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 12h16"/>
  <path d="M14 6l6 6-6 6"/>
</svg>`;

const SVG_CLOSE = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="18" y1="6" x2="6" y2="18"/>
  <line x1="6" y1="6" x2="18" y2="18"/>
</svg>`;

// ─── Action Handlers ──────────────────────────────────────────────────────────
async function handleCopyUrl(tab) {
  try {
    await navigator.clipboard.writeText(tab.url);
    showToast('URL copied!');
  } catch {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = tab.url;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
    showToast('URL copied!');
  }
}

async function handleCloseTab(tab, itemEl) {
  try {
    await chrome.tabs.remove(tab.id);
    // Optimistic removal from DOM (background will re-sync in ~1s)
    itemEl.style.transition = 'opacity 0.15s, height 0.15s';
    itemEl.style.opacity = '0';
    itemEl.style.height = '0';
    itemEl.style.overflow = 'hidden';
    itemEl.style.padding = '0 14px';
    setTimeout(() => itemEl.remove(), 150);
    showToast('Tab closed');
  } catch (err) {
    showToast('Failed to close tab', 'error');
  }
}

function handleHideRemoteTab(tab, itemEl) {
  hiddenRemoteTabs.add(tabKey(tab));
  itemEl.style.transition = 'opacity 0.15s, height 0.15s';
  itemEl.style.opacity = '0';
  itemEl.style.height = '0';
  itemEl.style.overflow = 'hidden';
  itemEl.style.padding = '0 14px';
  setTimeout(() => itemEl.remove(), 150);
  showToast('Hidden from list');
}

async function handleOpenIncognito(tab) {
  try {
    await chrome.windows.create({ url: tab.url, incognito: true });
  } catch (err) {
    const msg = (err.message || '').toLowerCase();
    if (msg.includes('incognito') || msg.includes('private')) {
      showToast('Enable "Allow in Incognito" in extension settings', 'warning');
    } else {
      showToast('Failed to open private window', 'error');
    }
  }
}

function handleSendTab(e, tab) {
  // Close any existing dropdown
  dismissSendDropdown();

  const browsers = state.remoteBrowsers || {};
  const entries = Object.entries(browsers).filter(([id, d]) => {
    if (!id || id === 'null' || id === state.browserId) return false;
    return d && d.browserName;
  });

  if (entries.length === 0) {
    showToast('No other browsers available', 'warning');
    return;
  }

  // Create dropdown
  const dropdown = document.createElement('div');
  dropdown.className = 'send-dropdown';

  for (const [id, data] of entries) {
    const item = document.createElement('div');
    item.className = 'send-dropdown-item';
    const dotClass = data.online ? 'dot-online' : 'dot-stale';
    const icon = BROWSER_ICONS[data.browserName] || '🌐';
    item.innerHTML = `<span>${icon}</span><span>${data.browserName}</span><span class="dot ${dotClass}"></span>`;
    item.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      dismissSendDropdown();
      try {
        const result = await chrome.runtime.sendMessage({
          type: 'send-tab',
          targetBrowserId: id,
          tab: { url: tab.url, title: tab.title, favIconUrl: tab.favIconUrl },
        });
        if (result && result.ok) {
          showToast('Tab sent!');
        } else {
          showToast(result?.error || 'Failed to send tab', 'error');
        }
      } catch {
        showToast('Failed to send tab', 'error');
      }
    });
    dropdown.appendChild(item);
  }

  // Position dropdown near the send button
  const btn = e.currentTarget;
  const actionsContainer = btn.closest('.tab-actions');
  actionsContainer.style.position = 'relative';
  actionsContainer.appendChild(dropdown);
  activeSendDropdown = dropdown;
}

function dismissSendDropdown() {
  if (activeSendDropdown) {
    activeSendDropdown.remove();
    activeSendDropdown = null;
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function isInternalUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return INTERNAL_PROTOCOLS.includes(u.protocol);
  } catch { return true; }
}

function tabKey(tab) {
  return `${tab.url || ''}::${tab.title || ''}`;
}

function getFaviconFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (INTERNAL_PROTOCOLS.includes(u.protocol)) return null;
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch { return null; }
}

function simplifyUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.hostname + (u.pathname !== '/' ? u.pathname : '');
  } catch { return url; }
}

function formatLastSeen(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.querySelector('#section-self .section-header').addEventListener('click', () => {
  document.getElementById('section-self').classList.toggle('collapsed');
});

btnSettings.addEventListener('click', () => chrome.runtime.openOptionsPage());

btnSync.addEventListener('click', async () => {
  btnSync.disabled = true;
  btnSync.style.animation = 'spin 0.8s linear infinite';
  try {
    const response = await chrome.runtime.sendMessage({ type: 'force-sync' });
    if (response) {
      state = response;
      render();
    }
    // Second fetch to catch any late-arriving server state
    await new Promise(r => setTimeout(r, 800));
    const fresh = await chrome.runtime.sendMessage({ type: 'get-state' });
    if (fresh) { state = fresh; render(); }
    if (state.connected) {
      showToast('Synced with server');
    } else {
      showToast('Tabs saved locally', 'warning');
    }
  } catch (err) {
    console.error('[SyncTabs] Sync failed:', err);
    showToast('Sync failed', 'error');
  } finally {
    btnSync.disabled = false;
    btnSync.style.animation = '';
  }
});

btnEnableSync.addEventListener('click', async () => {
  const originalText = btnEnableSync.textContent;
  btnEnableSync.disabled = true;
  btnEnableSync.textContent = 'Requesting…';
  try {
    // 1. Request host permission
    const granted = await chrome.permissions.request({ origins: ['http://127.0.0.1:9234/*'] });
    if (!granted) {
      showToast('Permission denied — sync requires local server access', 'error');
      return;
    }

    btnEnableSync.textContent = 'Connecting…';

    // 2. Tell background to probe + connect
    const result = await chrome.runtime.sendMessage({ type: 'reconnect' });

    if (result && result.reason === 'server-not-found') {
      showToast('Server not found — is the Companion app running?', 'error');
      return;
    }

    // 3. Poll for actual connection (up to 5s)
    let connected = false;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      const fresh = await chrome.runtime.sendMessage({ type: 'get-state' });
      if (fresh) {
        state = fresh;
        if (fresh.connected) { connected = true; break; }
      }
    }

    render();

    if (connected) {
      showToast('Connected! Syncing tabs across browsers');
    } else if (result && result.found) {
      showToast('Server found but connection pending — try the sync button', 'warning');
    } else {
      showToast('Could not connect — check the Companion app', 'error');
    }
  } catch (err) {
    console.error('[SyncTabs] Enable sync failed:', err);
    showToast('Failed to enable sync', 'error');
  } finally {
    btnEnableSync.disabled = false;
    btnEnableSync.textContent = originalText;
  }
});

btnDismissBanner.addEventListener('click', () => {
  sessionStorage.setItem('synctabs_banner_dismissed', '1');
  serverBanner.style.display = 'none';
});

linkCompanion?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: COMPANION_URL });
});

document.getElementById('footer-credit')?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: AUTHOR_GITHUB });
});

// Dismiss send dropdown on click outside or Escape
document.addEventListener('click', (e) => {
  if (activeSendDropdown && !e.target.closest('.send-dropdown') && !e.target.closest('[data-action="send"]')) {
    dismissSendDropdown();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') dismissSendDropdown();
});

// Live updates from background
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'state-updated') {
    state.remoteBrowsers = msg.browsers;
    renderRemoteBrowsers();
  }
  if (msg.type === 'connection-status') {
    state.connected = msg.connected;
    state.serverDetected = msg.serverDetected || state.serverDetected;
    renderConnectionStatus();
    renderServerBanner();
  }
  if (msg.type === 'server-detected') {
    state.serverDetected = true;
    renderServerBanner();
  }
  if (msg.type === 'tabs-received') {
    showToast(`${msg.count} tab(s) received from ${msg.senderName}`);
  }
  if (msg.type === 'send-tab-ack') {
    if (msg.status === 'queued') {
      showToast('Tab queued (browser offline)');
    }
  }
});

// Spin animation
const style = document.createElement('style');
style.textContent = '@keyframes spin { from{transform:rotate(0)} to{transform:rotate(360deg)} }';
document.head.appendChild(style);

// ─── Start ────────────────────────────────────────────────────────────────────
init();
