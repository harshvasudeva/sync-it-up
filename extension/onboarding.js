SyncTabsTheme.initFromStorage().catch(() => {});

document.getElementById('btn-close').addEventListener('click', () => {
  window.close();
});

document.getElementById('btn-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('link-companion').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: 'https://github.com/user/synctabs-companion/releases' });
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes.synctabs_settings) return;
  SyncTabsTheme.setPreference(changes.synctabs_settings.newValue?.theme);
});
