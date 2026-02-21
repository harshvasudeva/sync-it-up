// ─── SyncTabs Options Page Logic ──────────────────────────────────────────────

const COMPANION_URL = 'https://github.com/harshvasudeva';
const AUTHOR_GITHUB = 'https://github.com/harshvasudeva';

// DOM elements
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const browserIdEl = document.getElementById('browser-id');
const toggleServer = document.getElementById('toggle-server');
const inputServerUrl = document.getElementById('input-server-url');
const toggleAutoDetect = document.getElementById('toggle-auto-detect');
const btnSave = document.getElementById('btn-save');
const btnTest = document.getElementById('btn-test');
const savedMsg = document.getElementById('saved-msg');
const btnGrantPerm = document.getElementById('btn-grant-permission');
const permStatus = document.getElementById('perm-status');
const btnClearRemote = document.getElementById('btn-clear-remote');
const linkCompanion = document.getElementById('link-companion');

// Initialize
async function init() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'get-state' });
    if (state) {
      // Connection status
      if (state.connected) {
        statusDot.className = 'status-dot online';
        statusText.textContent = `Connected to server — syncing as ${state.browserName}`;
      } else if (state.serverDetected) {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Server detected but not connected';
      } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Running in local-only mode';
      }

      browserIdEl.textContent = state.browserId || '—';

      // Settings
      const settings = state.settings || {};
      toggleServer.checked = settings.serverEnabled !== false;
      inputServerUrl.value = settings.serverUrl || 'ws://127.0.0.1:9234';
      toggleAutoDetect.checked = settings.serverAutoDetect !== false;

      // Permission status
      if (state.hasHostPermission) {
        permStatus.textContent = '✅ Localhost permission granted';
        btnGrantPerm.style.display = 'none';
      } else {
        permStatus.textContent = '⚠️ Localhost permission not granted';
        btnGrantPerm.style.display = 'inline-block';
      }
    }
  } catch (err) {
    statusText.textContent = 'Error communicating with extension';
  }
}

// Save settings
btnSave.addEventListener('click', async () => {
  const newSettings = {
    serverEnabled: toggleServer.checked,
    serverUrl: inputServerUrl.value.trim() || 'ws://127.0.0.1:9234',
    serverAutoDetect: toggleAutoDetect.checked
  };

  try {
    await chrome.runtime.sendMessage({ type: 'update-settings', settings: newSettings });
    savedMsg.classList.add('show');
    setTimeout(() => savedMsg.classList.remove('show'), 2000);
    // Refresh status after save
    setTimeout(init, 1000);
  } catch (err) {
    savedMsg.textContent = 'Error saving';
    savedMsg.classList.add('show');
    setTimeout(() => {
      savedMsg.textContent = 'Saved!';
      savedMsg.classList.remove('show');
    }, 2000);
  }
});

// Test connection
btnTest.addEventListener('click', async () => {
  btnTest.textContent = 'Testing...';
  btnTest.disabled = true;

  try {
    const result = await chrome.runtime.sendMessage({ type: 'reconnect' });
    if (result && result.found) {
      btnTest.textContent = '✓ Server found!';
      btnTest.style.color = 'var(--green)';
    } else {
      btnTest.textContent = '✗ Server not found';
      btnTest.style.color = 'var(--red)';
    }
  } catch {
    btnTest.textContent = '✗ Error';
    btnTest.style.color = 'var(--red)';
  }

  setTimeout(() => {
    btnTest.textContent = 'Test Connection';
    btnTest.style.color = '';
    btnTest.disabled = false;
    init(); // Refresh status
  }, 2500);
});

// Grant permission
btnGrantPerm.addEventListener('click', async () => {
  try {
    const granted = await chrome.permissions.request({
      origins: ['http://127.0.0.1:9234/*']
    });
    if (granted) {
      permStatus.textContent = '✅ Permission granted!';
      btnGrantPerm.style.display = 'none';
      // Tell background to try connecting
      await chrome.runtime.sendMessage({ type: 'reconnect' });
      setTimeout(init, 2000);
    } else {
      permStatus.textContent = '❌ Permission denied';
    }
  } catch (err) {
    permStatus.textContent = '❌ Permission request failed';
  }
});

// Clear remote data
btnClearRemote.addEventListener('click', async () => {
  if (confirm('Clear all cached remote browser tabs? They will re-sync when the server is connected.')) {
    await chrome.runtime.sendMessage({ type: 'clear-remote-browsers' });
    btnClearRemote.textContent = 'Cleared!';
    setTimeout(() => {
      btnClearRemote.textContent = 'Clear Remote Browser Data';
    }, 2000);
  }
});

// Companion link
linkCompanion.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: COMPANION_URL });
});

init();

// Footer credit
document.getElementById('footer-credit')?.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: AUTHOR_GITHUB });
});

// ─── Companion App Control Panel ───────────────────────────────────────────────

const companionStatusDot    = document.getElementById('companion-status-dot');
const companionStatusText   = document.getElementById('companion-status-text');
const companionControls     = document.getElementById('companion-controls');
const companionUnavailable  = document.getElementById('companion-unavailable');
const companionPort         = document.getElementById('companion-port');
const companionDataFolder   = document.getElementById('companion-data-folder');
const companionLogLevel     = document.getElementById('companion-log-level');
const companionMaxTabs      = document.getElementById('companion-max-tabs');
const companionAutoStart    = document.getElementById('companion-auto-start');
const btnSaveCompanion      = document.getElementById('btn-save-companion');
const btnApplyPort          = document.getElementById('btn-apply-port');
const btnRestartCompanion   = document.getElementById('btn-restart-companion');
const btnCompanionLogs      = document.getElementById('btn-companion-logs');
const companionSavedMsg     = document.getElementById('companion-saved-msg');

let companionPollInterval = null;

async function loadCompanionStatus() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'get-companion-status' });
    if (result && result.ok && result.status) {
      const s = result.status;
      const upMin = Math.floor((s.uptimeSeconds || 0) / 60);
      companionStatusDot.className = 'status-dot online';
      companionStatusText.textContent =
        `Running v${s.version} · ${s.connections} browser(s) connected · uptime ${upMin}m`;
      companionControls.style.display = 'block';
      companionUnavailable.style.display = 'none';
      await loadCompanionConfig();
    } else {
      setCompanionOffline();
    }
  } catch {
    setCompanionOffline();
  }
}

function setCompanionOffline() {
  companionStatusDot.className = 'status-dot offline';
  companionStatusText.textContent = 'Companion not running';
  companionControls.style.display = 'none';
  companionUnavailable.style.display = 'block';
}

async function loadCompanionConfig() {
  try {
    const result = await chrome.runtime.sendMessage({ type: 'get-companion-config' });
    if (result && result.ok && result.config) {
      const cfg = result.config;
      companionPort.value         = cfg.port              || 9234;
      companionDataFolder.value   = cfg.dataFolder        || '';
      companionLogLevel.value     = cfg.logLevel          || 'info';
      companionMaxTabs.value      = cfg.maxTabsPerBrowser || 500;
      companionAutoStart.checked  = !!cfg.autoStart;
    }
  } catch (err) {
    console.error('[SyncTabs] Failed to load companion config:', err);
  }
}

// Save non-port settings
btnSaveCompanion.addEventListener('click', async () => {
  const partial = {
    dataFolder:        companionDataFolder.value.trim(),
    logLevel:          companionLogLevel.value,
    maxTabsPerBrowser: parseInt(companionMaxTabs.value, 10) || 500,
    autoStart:         companionAutoStart.checked,
  };

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'set-companion-config',
      config: partial,
    });
    if (result && result.ok) {
      companionSavedMsg.classList.add('show');
      setTimeout(() => companionSavedMsg.classList.remove('show'), 2000);
    } else {
      alert('Failed to save: ' + (result?.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

// Port change (separate Apply button — requires restart + re-grant permission)
btnApplyPort.addEventListener('click', async () => {
  const newPort = parseInt(companionPort.value, 10);
  if (isNaN(newPort) || newPort < 1024 || newPort > 65535) {
    alert('Invalid port. Must be between 1024 and 65535.');
    return;
  }

  const confirmed = confirm(
    `Change companion port to ${newPort}?\n\n` +
    `This will restart the companion server briefly.\n\n` +
    `You will also need to:\n` +
    `  1. Update "Server URL" above to ws://127.0.0.1:${newPort}\n` +
    `  2. Re-grant localhost permission for the new port`
  );
  if (!confirmed) return;

  try {
    const result = await chrome.runtime.sendMessage({
      type: 'set-companion-config',
      config: { port: newPort },
    });
    if (result && result.ok) {
      if (result.result && result.result.restartNeeded) {
        companionStatusText.textContent = 'Restarting on new port...';
        // Poll status after restart delay
        setTimeout(loadCompanionStatus, 3000);
      }
    } else {
      alert('Failed to change port: ' + (result?.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
});

// Restart companion
btnRestartCompanion.addEventListener('click', async () => {
  if (!confirm('Restart the SyncTabs Companion? Browsers will briefly disconnect.')) return;
  btnRestartCompanion.disabled = true;
  btnRestartCompanion.textContent = 'Restarting...';
  try {
    await chrome.runtime.sendMessage({
      type: 'set-companion-config',
      config: { _restart: true },
    });
    setTimeout(loadCompanionStatus, 2500);
  } catch {}
  setTimeout(() => {
    btnRestartCompanion.disabled = false;
    btnRestartCompanion.textContent = 'Restart Companion';
  }, 3000);
});

// Logs — must use tray
btnCompanionLogs.addEventListener('click', () => {
  alert('To view logs, right-click the SyncTabs icon in your system tray and select "View Logs".');
});

// Select styling for log level dropdown
if (companionLogLevel) {
  companionLogLevel.style.cssText =
    'padding:8px 10px;background:var(--bg);border:1px solid var(--border);' +
    'border-radius:6px;color:var(--text);font-size:13px;width:100%;cursor:pointer';
}

// Initial load + polling
loadCompanionStatus();
companionPollInterval = setInterval(loadCompanionStatus, 5000);
window.addEventListener('unload', () => {
  if (companionPollInterval) clearInterval(companionPollInterval);
});