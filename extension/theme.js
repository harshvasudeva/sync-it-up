// ─── SyncTabs Theme Helper ────────────────────────────────────────────────────
// Supports explicit light/dark themes and system preference tracking.

(() => {
  const STORAGE_KEY = 'synctabs_settings';
  const VALID_THEMES = new Set(['dark', 'light', 'system']);
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  let currentPreference = 'dark';
  let systemListenerAttached = false;

  function normalizePreference(theme) {
    return VALID_THEMES.has(theme) ? theme : 'dark';
  }

  function resolveTheme(preference) {
    return preference === 'system' ? (mediaQuery.matches ? 'dark' : 'light') : preference;
  }

  function applyTheme(preference) {
    const resolvedTheme = resolveTheme(preference);
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.style.colorScheme = resolvedTheme;
    return resolvedTheme;
  }

  function handleSystemThemeChange() {
    if (currentPreference === 'system') applyTheme(currentPreference);
  }

  function attachSystemListener() {
    if (systemListenerAttached) return;
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemThemeChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      mediaQuery.addListener(handleSystemThemeChange);
    }
    systemListenerAttached = true;
  }

  function detachSystemListener() {
    if (!systemListenerAttached) return;
    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', handleSystemThemeChange);
    } else if (typeof mediaQuery.removeListener === 'function') {
      mediaQuery.removeListener(handleSystemThemeChange);
    }
    systemListenerAttached = false;
  }

  function setPreference(theme) {
    currentPreference = normalizePreference(theme);
    applyTheme(currentPreference);
    if (currentPreference === 'system') attachSystemListener();
    else detachSystemListener();
    return currentPreference;
  }

  async function initFromStorage() {
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      return setPreference(result?.[STORAGE_KEY]?.theme);
    } catch {
      return setPreference('dark');
    }
  }

  window.SyncTabsTheme = {
    initFromStorage,
    setPreference,
  };
})();
