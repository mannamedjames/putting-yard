// Putting Yard — shared database setup.
//
// Paste your Firebase Realtime Database URL between the quotes below and every
// device that opens the app will read and write the same data. No login, no
// token, nothing to enter on each phone.
//
// To get a URL (one time, about five minutes, free):
//   1. Go to console.firebase.google.com and click "Create a project".
//      Name it anything. Turn off Google Analytics when it offers.
//   2. In the left sidebar: Build > Realtime Database > Create Database.
//      Pick any location. When it asks about security rules, choose
//      "Start in test mode".
//   3. Copy the URL shown at the top of the Data tab. It looks like
//      https://your-project-default-rtdb.firebaseio.com
//   4. Paste it below, keeping the quotes. Commit this file.
//
// Test mode leaves the database open to anyone who has the URL, which is fine
// for putting stats and is what makes the no-login setup possible. Test mode
// also expires after 30 days — when it does, go to the Rules tab and set both
// ".read" and ".write" to true to keep it open permanently.

window.PUTTING_DB = "";

// Optional: change this to keep separate data sets in one database
// (e.g. "yard" and "testing"). Most people should leave it alone.
window.PUTTING_BUCKET = "yard";
