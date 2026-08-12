# Putting Yard — getting it on your phone

Your disc golf putting tracker as a real installable app. Everything runs on your
device. No account, no server, no network needed once it's installed.

## What's in here

| File | What it is |
| --- | --- |
| `index.html` | The whole app — code, styles, everything, in one file |
| `manifest.webmanifest` | Tells your phone the app's name and icon |
| `sw.js` | Service worker; makes the app work offline |
| `config.js` | Where you paste your shared-database URL |
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


## Getting around

Four tabs across the bottom: **Play** (start a session or a scored run),
**Stats** (everything the app has learned about your putting), **Board**
(scored-run leaderboard), and **Settings** (name, flag distances, shared data,
backups).

## The two modes

**Session** is open-ended ladder practice: three putters a round, advance on
3/3, repeat on 2/3, watch on 1/3, back a flag on 0/3. Play as long as you like,
then end it for a post mortem.

**Scored run** is the game. Same three putters, same ladder rules, but fixed at
10 rounds (30 putts) and every make scores the flag number you threw it from —
a make at flag 4 is 4 points. Since you always start at flag 1 and can only
climb one flag per round, a perfect run is 120 points. Finished runs are ranked
on a leaderboard. Change the leaderboard name on the home screen before handing
your phone to someone else and you'll both appear on the board.

## Shared data across devices (set up once, then nothing)

Every device that opens the app can read and write one shared set of sessions
and runs — no accounts, no tokens, nothing to enter on each phone. You set the
address once, in `config.js`, and it ships with the app.

Getting a free database, about five minutes, one time:

1. Go to console.firebase.google.com and click **Create a project**. Name it
   anything; turn off Google Analytics when offered.
2. In the sidebar: **Build → Realtime Database → Create Database**. Pick any
   location. When it asks about security rules, choose **Start in test mode**.
3. Copy the URL at the top of the Data tab. It looks like
   `https://your-project-default-rtdb.firebaseio.com`
4. Open `config.js` in your repo, paste the URL between the quotes on the
   `window.PUTTING_DB` line, and commit.

That's it. Every device that loads the app now syncs to the same data — pulls
when you open it, pushes when a session or run finishes, plus a **Sync now**
button. The home screen shows "Shared data · on" when it's working.

Test mode expires after 30 days. When it does, go to the database's **Rules**
tab and set both `.read` and `.write` to `true` to keep it open. That leaves the
database readable by anyone who knows the URL, which is the trade for having no
login at all — fine for putting stats, not for anything private.

Offline in the yard, nothing changes: rounds save to the phone as always and
sync the next time you have signal.

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

## Updating the app

Replace `index.html` in your repo with the new one and commit. The app checks
for a new build every time you open it, so the update lands on the next launch.
If a new version appears while the app is already open, an orange **New version
available** bar shows up at the top — tap Update to reload. It never appears
mid-round.

If it ever seems stuck on an old version: open the URL in Safari with `?v=2`
on the end to confirm the deploy is live, then force-quit the app (swipe it out
of the app switcher) and reopen. Your data is untouched by any of this.

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
