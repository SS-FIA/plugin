# Vault Sync for Dropbox

Bidirectional sync between your Obsidian vault and Dropbox — with full iOS support.

![Obsidian](https://img.shields.io/badge/Obsidian-1.4.0%2B-purple)
![Version](https://img.shields.io/badge/version-0.4.27-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- 🔄 **Bidirectional sync** — changes on any device propagate to all others
- 📱 **iOS / iPadOS support** — works with Obsidian Mobile via Dropbox
- ⚡ **Incremental sync** — cursor-based delta sync keeps API usage minimal
- 🛡️ **Conflict handling** — last-write-wins with automatic conflict file creation
- 🗑️ **Deletion sync** — file deletions propagate across devices
- 🔧 **Auto tombstone repair** — stale deletion records are automatically cleaned up on each full sync
- 🚫 **Conflict copy filtering** — Dropbox-generated conflict copies are automatically excluded from your vault

---

## Requirements

- Obsidian 1.4.0 or later
- A [Dropbox](https://www.dropbox.com/) account
- Your own Dropbox API app key (free — see setup below)

---

## Installation

### Manual install (current)

1. Download `main.js` and `manifest.json` from the [latest release](https://github.com/Faust-IA/Dropbox-obsidian-plugin/releases)
2. Copy both files to your vault:
   ```
   YourVault/.obsidian/plugins/vault-sync-dropbox/
   ```
3. Restart Obsidian and enable the plugin in **Settings → Community Plugins**

### BRAT (for iOS / beta testing)

1. Install [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. In BRAT settings, add: `Faust-IA/Dropbox-obsidian-plugin`
3. Enable **Vault Sync for Dropbox** in Community Plugins

---

## Dropbox App Setup

This plugin requires you to create a free Dropbox API app. This takes about 3 minutes.

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Click **Create app**
3. Choose:
   - API: **Scoped access**
   - Access type: **Full Dropbox**
   - Name: anything you like (e.g. `my-obsidian-sync`)
4. In the app settings, under **OAuth 2 → Redirect URIs**, add:
   ```
   http://localhost:3000/callback
   ```
5. Copy your **App key**

---

## Plugin Configuration

1. Open **Settings → Vault Sync for Dropbox**
2. Paste your **App key**
3. Click **Authenticate with Dropbox** — your browser will open for authorization
4. Set **Dropbox folder** (default: `/ObsidianVault`) — this is the folder inside Dropbox where your vault will be stored
5. Set **Sync interval** (default: 5 minutes)
6. Click **Run Full Sync** to start the initial sync

---

## How It Works

| Event | Behavior |
|-------|----------|
| Local file created / modified | Uploaded to Dropbox after a 3-second debounce |
| Remote file created / modified | Downloaded on next sync cycle |
| Local file deleted | Deleted from Dropbox; tombstone recorded to prevent re-download |
| Remote file deleted | Moved to local trash |
| Both sides modified | Local copy saved as conflict file; Dropbox version becomes the main file |
| Dropbox conflict copy detected | Automatically excluded from vault (not downloaded) |

---

## Excluded by Default

The following are never synced:

- `.obsidian/` — plugin configs, workspace state
- `.trash/` — Obsidian trash folder
- Dropbox auto-generated conflict copies (e.g. `note (John's conflicted copy 2026-03-07).md`)

You can add additional folders in the plugin settings.

---

## Troubleshooting

**Files not syncing after deletion**

If a file reappears after deletion, a stale tombstone may be present in `state.json`. As of v0.4.27, this is repaired automatically on each full sync. You can also manually delete:
```
YourVault/.obsidian/plugins/vault-sync-dropbox/state.json
```
and run a full sync to reset.

**Authentication fails**

Make sure `http://localhost:3000/callback` is listed as a Redirect URI in your Dropbox app settings.

**Sync stops after a long time**

The sync cursor may have expired. The plugin will automatically fall back to a full sync in this case.

---

## Data & Privacy

- All data is synced directly between your device and your own Dropbox account
- No third-party servers are involved
- Your Dropbox credentials never leave your device

---

## License

MIT — see [LICENSE](LICENSE)

---

## Author

**Faust-IA** — [GitHub](https://github.com/Faust-IA)

Feedback and bug reports are welcome via [GitHub Issues](https://github.com/Faust-IA/Dropbox-obsidian-plugin/issues).
