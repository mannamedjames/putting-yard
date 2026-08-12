// ─────────────────────────────────────────────────────────────────────────────
//  Putting Yard — where your data is stored
// ─────────────────────────────────────────────────────────────────────────────
//
//  Your history is one JSON file at one web address. This file holds that
//  address. Every phone that loads the site reads it from here, so sharing is
//  configured ONCE, on GitHub, and never on any phone.
//
//  (GitHub Pages can only hand out files, never accept changes to them. That's
//  why the data itself has to live somewhere else that accepts writes.)
//
//  ═══ RECOMMENDED: jsonbin.io — free, and it doesn't expire ══════════════════
//
//   1. Go to jsonbin.io and sign up (email + password; no card, no 2FA).
//   2. Click "Create Bin". Replace the sample content with:
//        { "app": "putting-yard" }
//      (jsonbin refuses to save an empty bin, so it needs something in it —
//      the app overwrites the whole bin on its first sync anyway.)
//      Click the save/tick icon. The address bar then shows a Bin ID that
//      looks like 65f0a1b2c3d4e5f6a7b8c9d0.
//   3. Go to API Keys in the sidebar and copy your MASTER KEY.
//   4. Fill in both lines below, keeping the quotes, and commit this file.
//
//        window.PUTTING_DB = "https://api.jsonbin.io/v3/b/YOUR_BIN_ID";
//        window.PUTTING_HEADERS = { "X-Master-Key": "YOUR_MASTER_KEY" };
//
//  Done. Every device that opens the site now shares that one bin.
//
//  ─── Alternatives ───────────────────────────────────────────────────────────
//  • jsonblob.com needs no account at all, but blobs EXPIRE — don't use it for
//    anything you want to keep.
//  • A Firebase Realtime Database URL works in PUTTING_DB on its own (leave
//    headers blank). Google now requires 2FA on the account.
//  • Any store that answers GET with your JSON and accepts PUT will work.
//
//  To check it worked: open the app. Settings should say "Shared data · from
//  config.js" and offer a Test connection button, which does a real read and
//  write and reports back in plain words.

window.PUTTING_DB = "https://api.jsonbin.io/v3/b/6a7c8de4da38895dfedb2d80";
window.PUTTING_HEADERS = { "X-Master-Key": "$2a$10$6hHqWKyig.0QrQgoivIYhu0vQbaYvlHHPb18d5bpo0Gz6T3xvhs6O" };

//  Notes
//  • The key above is visible to anyone who views your site's source. For a
//    putting log that's a fair trade for zero setup; it only grants access to
//    that one store. Rotate it in jsonbin if you ever care.
//  • Keep an occasional backup: Settings → Backup → Save backup file.
//  • Leaving these blank is fine — the app still works, saving to each phone
//    separately.

// Only used for Firebase — the key your data sits under. Ignore otherwise.
window.PUTTING_BUCKET = "yard";
