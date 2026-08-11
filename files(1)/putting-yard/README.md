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

## Your data

Sessions and games are stored on the device, in that browser's local storage.
That means:

- Data does **not** sync between your phone and your laptop.
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
