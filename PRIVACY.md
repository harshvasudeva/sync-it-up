# Privacy Policy — SyncTabs

**Last updated:** February 2026

## Summary

SyncTabs does **not** collect, transmit, or store any personal data on external servers.
All data stays on your local machine.

## What data does SyncTabs access?

SyncTabs accesses:
- **Tab information:** URLs, titles, favicon URLs, and tab state (pinned, active) of your open browser tabs.
- **Storage:** The extension uses `chrome.storage.local` to save your tabs and settings.

## Where is data stored?

- **Extension storage:** Your tabs and settings are saved in the browser's local extension storage (`chrome.storage.local`). This data never leaves your browser.
- **Companion server (optional):** If you install the optional SyncTabs Companion app, tab data is transmitted over a **local WebSocket connection** (`127.0.0.1:9234` — your own machine) and stored in a JSON file on your computer.

## What data is transmitted?

- **Without Companion app:** No data is transmitted anywhere. The extension operates in local-only mode.
- **With Companion app:** Tab data (URLs, titles, favicons) is sent over **localhost only** (`127.0.0.1`) to the Companion server running on your own machine. No data is sent to any external server, cloud service, or third party.

## Third-party services

SyncTabs uses Google's favicon service (`https://www.google.com/s2/favicons`) to display website icons. This means Google may receive the domain names of websites you have open. This is the standard favicon service used by Chromium browsers and is optional (the extension works without it).

## Permissions explained

| Permission | Why |
|------------|-----|
| `tabs` | Required to read your open browser tabs (URLs, titles, favicon URLs) |
| `storage` | Required to save your tab data and extension settings locally |
| `alarms` | Required to periodically save tabs and reconnect to the sync server |
| `http://127.0.0.1:9234/*` (optional) | Required only if you want to use the Companion app for cross-browser sync. This connects to your own machine only. |

## Data retention

- Tab data is stored as long as the extension is installed.
- Uninstalling the extension deletes all locally stored data.
- Uninstalling the Companion app and deleting its data folder removes all server-side data.

## Changes to this policy

Any changes to this privacy policy will be reflected in the extension update and this document.

## Contact

If you have questions about this privacy policy, please open an issue on the project's GitHub repository.
