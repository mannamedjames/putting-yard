# Putting Yard — getting it on your phone

Your disc golf putting tracker as a real installable app. Everything runs on your
device. No account, no server, no network needed once it's installed.

## What's in here

| File | What it is |
| --- | --- |
| `index.html` | The whole app — code, styles, everything, in one file |
| `manifest.webmanifest` | Tells your phone the app's name and icon |
| `sw.js` | Service worker; makes the app work offline |
| `icon-*.png`, `apple-touch-icon.png` | Home screen icons |

## Getting it on your phone

You need to put these files somewhere your phone can reach over **https**.
Home screen install and offline mode won't work from a plain file on disk.
GitHub Pages is free and takes about five minutes.

### GitHub Pages

1. Create a GitHub account if you don't have one.
2. Make a new **public** repository — name it whatever, e.g. `putting-yard`.
3. Upload every file in this folder to the top level of the repo
   (**Add file → Upload files**, drag them all in, **Commit changes**).
4. Go to **Settings → Pages**. Under *Build and deployment*, set
   **Source: Deploy from a branch**, **Branch: main**, **Folder: / (root)**. Save.
5. Wait a minute, then open `https://YOURNAME.github.io/putting-yard/` on your phone.

### Add it to your home screen

**iPhone (Safari — must be Safari, not Chrome):**
Open the page → tap the Share button → **Add to Home Screen** → **Add**.

**Android (Chrome):**
Open the page → tap the ⋮ menu → **Install app** (or **Add to Home Screen**).

Launch it from the icon and it opens full screen with no browser chrome, and
works with no signal.


## Cloud sync (recommended on iPhone)

iOS can evict a web app's local data, which is how a session disappears an hour
after you logged it. The app now stores everything in two places on the device
(IndexedDB plus a localStorage mirror), and can also sync to a GitHub repo so
your history survives a wipe or a new phone entirely.

Setting it up takes about three minutes:

1. On GitHub, create a **second, private** repository — e.g. `putting-data`.
   Keep it separate from the public one hosting the app, so your history isn't
   public. Tick "Add a README file" so the repo isn't empty.
2. Go to **Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token**.
   - Expiration: whatever you like (you'll re-enter it when it lapses).
   - Repository access: **Only select repositories** → pick `putting-data`.
   - Permissions: **Repository permissions → Contents → Read and write**.
   - Generate, then copy the `github_pat_...` string.
3. In the app, open the **Cloud sync** card at the bottom of the home screen,
   tap **Set up cloud sync**, and enter your GitHub username, the repo name
   (`putting-data`), and the token. Tap **Connect and sync**.

After that it syncs automatically whenever you finish a session or a game, and
pulls on open. There's a **Sync now** button for a manual push.

The token is stored on your device only and is never written into the repo.
It can only touch that one private repo, so the worst case if it leaked is
someone editing your putting stats. If you ever want it dead, delete the token
on GitHub and tap Disconnect in the app.

**Setting up a new phone:** install the app, open Cloud sync, enter the same
three values. Your full history downloads on connect.

### About the synced file

Rounds are stored in a packed form — each round becomes a short array of
numbers rather than a verbose object. A typical session is a few hundred bytes,
so years of practice stay well under a megabyte, and every sync is a single
small commit.

## Your data

Sessions and games are stored on the device, in that browser's local storage.
That means:

- Without cloud sync, data does **not** move between your phone and laptop.
- Deleting the app from your home screen is fine, but clearing your browser's
  site data will erase your history.
- **Use the backup buttons.** *Save backup file* downloads a `.json` of
  everything; *Restore backup* loads one back in and merges it with what's there,
  so restoring twice won't create duplicates. That's also how you move your
  history to a new phone.

Back up after a good session. It takes one tap.

## Changing things later

To edit the app you'd rebuild from source (`src/App.jsx`, `npm install`,
`node build.js`), which regenerates `dist/index.html`. If you'd rather not deal
with that, hand `index.html` back to Claude and describe what you want changed.

## Notes

- Haptic buzz on round results works on Android. iOS doesn't let web apps
  vibrate, so iPhone just won't buzz — everything else is identical.
- The screen stays awake while a session or game is open.
- Fonts load from Google on first visit and are cached after that. Offline
  before that ever happens, the app falls back to your system font and still
  works fine.
