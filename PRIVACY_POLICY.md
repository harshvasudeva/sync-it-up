# Privacy Policy for SyncTabs

**Last Updated:** February 2026
**Effective Date:** February 21, 2026

---

## Overview

SyncTabs is a Chrome extension that helps you view and manage tabs across Chromium browsers. This privacy policy explains how we handle your data.

**TL;DR:** We don't collect, store, or transmit your personal data. Everything stays on your machine.

---

## 1. What Data We Collect

### Data We DO Collect (Locally Only)

**Tab Information:**
- Open tab titles and URLs
- Window information
- Tab favicons
- Tab active/pinned status
- Last accessed timestamps

**Settings:**
- Your extension preferences
- Server connection settings
- Browser name and ID (generated locally)

**All this data is stored ONLY on your machine.** Nothing is sent to cloud servers.

### Data We DON'T Collect

We **never** collect, request, or store:
- ❌ Personal information (name, email, address, phone)
- ❌ Browsing history beyond currently open tabs
- ❌ Search queries
- ❌ Passwords or credentials
- ❌ Financial information
- ❌ Health data
- ❌ Location data
- ❌ Device identifiers
- ❌ IP addresses (unless you manually configure a non-local server)
- ❌ Analytics or usage data
- ❌ Cookies or tracking data

---

## 2. How We Use Your Data

### Tab Data
- **Display Purpose:** To show your open tabs in the popup and options page
- **Local Sync:** To synchronize tabs across browsers (if Companion app is used)
- **Persistence:** To remember your tabs even after you close the browser
- **NO Other Use:** We never use tab data for ads, profiling, or analytics

### Settings Data
- **Functionality:** To remember your preferences and connection settings
- **NO Sharing:** Settings are never shared with anyone

### Browser ID
- **Local Identification:** To identify your browser in local sync
- **Uniqueness:** Generated randomly on first install
- **Persistence:** Used only to correlate your tabs across browsers
- **NO Tracking:** Not used for any tracking purposes

---

## 3. Data Storage

### Where Your Data Is Stored

**Local Mode (Extension Only):**
```
Chrome:      %APPDATA%\Google\Chrome\User Data\Default\Local Storage\
Edge:        %APPDATA%\Microsoft\Edge\User Data\Default\Local Storage\
Brave:       %APPDATA%\BraveSoftware\Brave-Browser\User Data\Default\Local Storage\
macOS:       ~/Library/Application Support/Google/Chrome/Default/Local Storage/
Linux:       ~/.config/google-chrome/Default/Local Storage/
```

**Sync Mode (With Companion App):**
```
Windows:     %APPDATA%\SyncTabs Companion\data\
macOS:       ~/Library/Application Support/SyncTabs Companion/data/
Linux:       ~/.local/share/synctabs-companion/data/
```

All data is stored in plaintext JSON files on your machine. No encryption is applied because the data never leaves your device.

### What Files Are Stored

- `tabs.json` — Your open tabs from all browsers
- `pending-tabs.json` — Queued tab updates
- Settings files — Your extension preferences
- Logs — Debug information (optional, stays on your machine)

---

## 4. Data Retention

### How Long We Keep Data

**Tab Data:**
- Kept until you clear browser data or uninstall the extension
- You can manually clear it anytime via extension options

**Settings:**
- Kept until you uninstall the extension or reset settings

**Logs:**
- Kept in local files until you delete them
- Can be disabled in settings

### Deleting Your Data

You can delete all SyncTabs data:

**Option 1: Clear Extension Data**
1. `chrome://extensions/` → Details
2. Storage → Clear data

**Option 2: Remove Extension**
1. `chrome://extensions/` → Remove

**Option 3: Manual Deletion**
1. Delete folders listed above in "Data Storage"

---

## 5. The Companion App

### Optional Cloud-Free Sync

The Companion app is an **optional** desktop program that enables cross-browser tab synchronization.

**Important:** The Companion app:
- ✅ Runs entirely on your machine
- ✅ Does NOT connect to the internet
- ✅ Does NOT send data to any server
- ✅ Communicates ONLY with local browsers via `localhost:9234`
- ✅ Stores all data locally
- ✅ Has NO cloud backup or sync

**You don't need the Companion to use SyncTabs.** The extension works standalone for local tab management.

### Companion Data Storage

All Companion data is stored in plaintext JSON:
- Tab snapshots from each browser
- Sync state information
- Server logs

**No encryption, no cloud, no transmission.**

---

## 6. Permissions Explained

### "tabs" Permission
- **What it does:** Reads the list of open tabs in your current browser
- **Why we need it:** To display your tabs in the extension popup
- **Who sees it:** Only you (displayed locally)
- **Is it sent anywhere?** No

### "storage" Permission
- **What it does:** Saves extension settings and tab data locally
- **Why we need it:** To persist your preferences and tabs
- **Who accesses it:** Only your browser
- **Is it sent anywhere?** No

### "alarms" Permission
- **What it does:** Triggers periodic checks for tab updates
- **Why we need it:** To sync tabs with the Companion app (if used)
- **Who accesses it:** Only your browser
- **Is it sent anywhere?** No

### Localhost Permissions (Optional)
- **What it does:** Allows communication with `127.0.0.1:9234`
- **Why we need it:** To talk to the Companion app on your machine
- **Who is involved:** Only your computer
- **Is data sent to the internet?** No, never. Communication is `localhost` only.

---

## 7. Security

### How We Protect Your Data

**Local-Only Storage:**
- All data stays on your machine
- No cloud servers to hack
- No data transmission = no interception risk

**No Authentication:**
- No usernames, passwords, or tokens stored
- No login system
- No accounts to compromise

**Source Code:**
- Available on GitHub for transparency
- Anyone can audit the code
- Open source = transparent security

**CSP (Content Security Policy):**
- Extension enforces strict CSP
- Prevents injection attacks
- Restricts what scripts can do

### What You Should Do

- Keep your browser updated
- Enable Developer mode only if needed (for debugging)
- Don't grant unnecessary permissions
- Review settings periodically

---

## 8. Third Parties

### Do We Share Data With Anyone?

**No.** We:
- ❌ Never sell data
- ❌ Never share data with advertisers
- ❌ Never share data with analytics services
- ❌ Never share data with third parties, period

**Exception:** If you configure the Companion app to use a non-localhost server, data would be sent to that server. This is your choice and not recommended.

---

## 9. International Users

### GDPR / Privacy Regulations

**SyncTabs complies with:**
- ✅ GDPR (General Data Protection Regulation)
- ✅ CCPA (California Consumer Privacy Act)
- ✅ Other international privacy laws

**Why?**
- We don't collect personal data
- We don't use tracking
- Users have full control and deletion rights
- No data is transferred internationally (it stays local)

---

## 10. User Rights

### Your Rights

**Right to Access:**
Your data is accessible in your browser's local storage. You can inspect it anytime.

**Right to Deletion:**
You can delete all data anytime:
- Clear extension storage (see Section 4)
- Uninstall the extension
- Manually delete files

**Right to Portability:**
Your tab data is stored in plaintext JSON. You can export it anytime.

**Right to Opt-Out:**
- Disable the extension anytime
- Use local mode (no Companion needed)
- Clear data and start fresh

---

## 11. Children's Privacy

SyncTabs is **not intended for children under 13.**

We don't knowingly collect data from children. If you're under 13, please ask a parent or guardian before using this extension.

---

## 12. Changes to This Policy

We may update this privacy policy occasionally. Changes are effective immediately upon publication.

**How we'll notify you:**
- Updated on this page
- Date stamp at the top
- Major changes announced in extension release notes

---

## 13. Contact & Support

### Privacy Questions?

**GitHub Issues:**
https://github.com/harshvasudeva/sync-it-up/issues

**Developer Contact:**
- GitHub: https://github.com/harshvasudeva
- Issues: Report privacy concerns on GitHub

**Response Time:**
We aim to respond to privacy questions within 7 days.

---

## 14. Summary

| Question | Answer |
|----------|--------|
| **Do you collect personal data?** | No |
| **Is data sent to the cloud?** | No |
| **Do you sell data?** | No |
| **Do you use tracking?** | No |
| **Can I delete my data?** | Yes, anytime |
| **Is my data encrypted?** | It stays on your machine, so encryption isn't needed |
| **Who can see my data?** | Only you |
| **Can I use SyncTabs offline?** | Yes, completely offline |
| **Do you need an account?** | No |

---

## 15. Appendix: Technical Details

### Data Format

Tab data is stored as JSON:
```json
{
  "browserId": "abc123def456",
  "browserName": "Chrome",
  "tabs": [
    {
      "id": 1,
      "title": "Example",
      "url": "https://example.com",
      "favIcon": "data:image/png;...",
      "active": true,
      "pinned": false,
      "lastAccessed": 1708503600000
    }
  ]
}
```

All data uses standard JSON format (plaintext).

### Communication Protocol

Extension ↔ Companion communication:
- **Protocol:** WebSocket (ws://)
- **Address:** 127.0.0.1:9234 (localhost only)
- **Encryption:** None needed (local communication)
- **Data Format:** JSON messages

Messages are never routed through the internet.

### Browser Compatibility

Privacy policy applies to:
- Google Chrome
- Microsoft Edge
- Brave Browser
- Vivaldi
- Opera
- Any Chromium-based browser

---

## Acknowledgments

This privacy policy is written to be transparent and user-friendly while accurately describing how SyncTabs works.

We believe privacy is a right, not a commodity.

---

**Questions or concerns?** Open an issue on GitHub: https://github.com/harshvasudeva/sync-it-up/issues
