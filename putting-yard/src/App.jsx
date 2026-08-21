import { useState, useEffect, useRef } from "react";
import { ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

// ---------- palette & type ----------
const C = {
  paper: "#F6F4ED",
  ink: "#1A2620",
  faint: "#6E7A6F",
  line: "#DDD8CA",
  card: "#FFFFFF",
  fairway: "#2E6B45",
  amber: "#C77B1E",
  amberSoft: "#F7E8CF",
  orange: "#E86A17",
  red: "#CE2F2F",
  green: "#2F8F4E",
  miss: "#8A9389",
};
const DEFAULT_ORDER = ["orange", "red", "green"];
// Bump this every release. It's shown at the bottom of the home screen so you
// can tell at a glance whether your phone picked up a new deploy.
const BUILD = "v12 · putts 1-2-3";
const disp = { fontFamily: "'Barlow Condensed', sans-serif" };

const body = { fontFamily: "'Barlow', sans-serif" };

// ---------- round rules ----------
function applyRules(flag, watch, made) {
  let nf = flag, nw = watch, msg = "";
  if (made === 3) {
    if (flag < 5) { nf = flag + 1; msg = `3/3 — advance to flag ${nf}`; }
    else { msg = "3/3 — hold flag 5"; }
    nw = false;
  } else if (made === 2) {
    msg = `2/3 — repeat flag ${flag}`;
    nw = false;
  } else if (made === 1) {
    if (watch) {
      nf = Math.max(1, flag - 1);
      if (nf < flag) { nw = false; msg = `1/3 on watch — back to flag ${nf}`; }
      else { msg = "1/3 on watch — repeat flag 1"; }
    } else {
      nw = true; msg = `1/3 — repeat flag ${flag}, on watch`;
    }
  } else {
    nf = Math.max(1, flag - 1);
    if (nf < flag) { nw = false; msg = `0/3 — back to flag ${nf}`; }
    else { msg = "0/3 — repeat flag 1"; }
  }
  return { nf, nw, msg };
}

// ---------- helpers ----------
const roundOrder = r => r.order || DEFAULT_ORDER;

// Putts are just 1, 2, 3 now. Older rounds stored them per disc colour, so
// these two read either shape and always hand back three slots in throw order.
function puttsOf(r) {
  if (Array.isArray(r.putts)) return r.putts.map(Boolean);
  const order = roundOrder(r);
  return order.map(k => !!(r.results || {})[k]);
}
function missOf(r) {
  const m = r.miss || {};
  if (Array.isArray(r.putts) || m[0] !== undefined || m[1] !== undefined || m[2] !== undefined) {
    return [0, 1, 2].map(i => m[i] || null);
  }
  return roundOrder(r).map(k => m[k] || null);
}
const madeOf = r => (typeof r.made === "number" ? r.made : puttsOf(r).filter(Boolean).length);
const pct = s => (s.a ? Math.round((100 * s.m) / s.a) + "%" : "—");
const frac = s => (s.a ? `${s.m}/${s.a}` : "·");
const fmtDate = ts => new Date(ts).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const fmtDur = sec => {
  if (sec == null) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
};
const fmtClock = sec => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ---------- stats ----------
// segments = array of round-arrays (one per session), so stints,
// streaks, and pace never bleed across session boundaries.
function computeStats(segments) {
  const rounds = segments.flat();
  const perFlag = {}, perPos = [{ m: 0, a: 0 }, { m: 0, a: 0 }, { m: 0, a: 0 }];
  for (let f = 1; f <= 5; f++) perFlag[f] = { m: 0, a: 0 };
  let highest = 0;

  rounds.forEach(r => {
    highest = Math.max(highest, r.flag);
    puttsOf(r).forEach((hit, i) => {
      perFlag[r.flag].m += hit ? 1 : 0; perFlag[r.flag].a += 1;
      perPos[i].m += hit ? 1 : 0; perPos[i].a += 1;
    });
  });

  // best make-streak (putt level, within a session)
  let bestStreak = 0;
  segments.forEach(seg => {
    let run = 0;
    seg.forEach(r => puttsOf(r).forEach(hit => {
      run = hit ? run + 1 : 0;
      bestStreak = Math.max(bestStreak, run);
    }));
  });

  // rounds-to-advance: stints of consecutive rounds at one flag
  const adv = {}; for (let f = 1; f <= 4; f++) adv[f] = { events: 0, rounds: 0 };
  segments.forEach(seg => {
    let i = 0;
    while (i < seg.length) {
      const f = seg[i].flag;
      let j = i;
      while (j < seg.length && seg[j].flag === f) j++;
      const advanced = j < seg.length && seg[j].flag > f;
      if (advanced && f <= 4) { adv[f].events += 1; adv[f].rounds += j - i; }
      i = j;
    }
  });

  // watch record: rounds entered while on watch
  let watchSaved = 0, watchLost = 0;
  rounds.forEach(r => { if (r.prevWatch) (madeOf(r) >= 2 ? watchSaved++ : watchLost++); });

  // where the misses go
  const missDirs = { L: 0, R: 0, H: 0, Lo: 0, unknown: 0 };
  rounds.forEach(r => {
    const dirs = missOf(r);
    puttsOf(r).forEach((hit, i) => {
      if (hit) return;
      const d = dirs[i];
      if (d && missDirs[d] !== undefined) missDirs[d] += 1; else missDirs.unknown += 1;
    });
  });

  // warm-up effect: first 3 rounds of each session vs the rest
  const early = { m: 0, a: 0 }, late = { m: 0, a: 0 };
  segments.forEach(seg => seg.forEach((r, i) => puttsOf(r).forEach(hit => {
    const b = i < 3 ? early : late;
    b.m += hit ? 1 : 0; b.a += 1;
  })));

  // pace
  const durs = rounds.map(r => r.dur).filter(d => typeof d === "number");
  const avgDur = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null;
  const totalDur = durs.length ? durs.reduce((a, b) => a + b, 0) : null;

  return { perFlag, perPos, highest, total: rounds.length, bestStreak, adv, watchSaved, watchLost, avgDur, totalDur, early, late, missDirs };
}

function currentStreak(rounds) {
  let run = 0;
  rounds.forEach(r => puttsOf(r).forEach(hit => { run = hit ? run + 1 : 0; }));
  return run;
}

function computePBs(sessions) {
  if (!sessions.length) return null;
  const best = { streak: null, climb: null, acc: null, hold5: null };
  sessions.forEach((s, idx) => {
    const st = computeStats([s.rounds]);
    if (st.bestStreak && (!best.streak || st.bestStreak > best.streak.val)) best.streak = { val: st.bestStreak, idx };

    // rounds it took to first stand at flag 5
    let climb = null;
    const first5 = s.rounds.findIndex(r => r.flag === 5);
    if (first5 >= 0) climb = first5;
    else {
      const last = s.rounds[s.rounds.length - 1];
      if (last && last.flag === 4 && last.made === 3) climb = s.rounds.length;
    }
    if (climb !== null && (!best.climb || climb < best.climb.val)) best.climb = { val: climb, idx };

    // best session accuracy, min 8 rounds so a hot 2-round day can't take it
    if (st.total >= 8) {
      const made = s.rounds.reduce((n, r) => n + r.made, 0);
      const acc = made / (st.total * 3);
      if (!best.acc || acc > best.acc.val) best.acc = { val: acc, idx, rounds: st.total };
    }

    const h5 = s.rounds.filter(r => r.flag === 5).length;
    if (h5 > 0 && (!best.hold5 || h5 > best.hold5.val)) best.hold5 = { val: h5, idx };
  });
  return best;
}

const aggAcc = segments => {
  let m = 0, a = 0;
  segments.forEach(seg => seg.forEach(r => puttsOf(r).forEach(hit => { m += hit ? 1 : 0; a += 1; })));
  return { m, a };
};

// ---------- scored ladder run (leaderboard game) ----------
// Same 3-putter rounds and same progression rules as a normal session.
// The only difference: every make scores the flag number you threw it from,
// the run is a fixed 10 rounds, and the total lands on a leaderboard.
const GAME_ROUNDS = 10;
const GAME_SHOTS = GAME_ROUNDS * 3;
const flagPts = f => f; // flag number = points per make
// Best possible: you can only reach flag 5 by round 5, so 3*(1+2+3+4+5+5+5+5+5+5).
const GAME_MAX = 120;

// New runs store `rounds`; older free-shot runs stored `shots`. Both still score.
const gameScore = (g) => {
  if (Array.isArray(g?.rounds)) return g.rounds.reduce((n, r) => n + r.made * flagPts(r.flag), 0);
  const shots = Array.isArray(g) ? g : (g?.shots || []);
  return shots.reduce((n, s) => n + (s.made ? flagPts(s.flag) : 0), 0);
};
const gameMakes = (g) => Array.isArray(g?.rounds)
  ? g.rounds.reduce((n, r) => n + r.made, 0)
  : (g?.shots || []).filter(s => s.made).length;
const gameAttempts = (g) => Array.isArray(g?.rounds) ? g.rounds.length * 3 : (g?.shots || []).length;

function gameFlagTable(g) {
  const t = {};
  for (let f = 1; f <= 5; f++) t[f] = { m: 0, a: 0, pts: 0, rounds: 0 };
  if (Array.isArray(g?.rounds)) {
    g.rounds.forEach(r => {
      t[r.flag].rounds += 1; t[r.flag].a += 3; t[r.flag].m += r.made;
      t[r.flag].pts += r.made * flagPts(r.flag);
    });
  } else {
    (g?.shots || []).forEach(s => {
      t[s.flag].a += 1;
      if (s.made) { t[s.flag].m += 1; t[s.flag].pts += flagPts(s.flag); }
    });
  }
  return t;
}

// leaderboard: every finished run, best score first
function leaderboard(games) {
  return games
    .map((g, idx) => ({ idx, name: g.name || "Me", score: gameScore(g), when: g.startedAt, high: Math.max(0, ...(g.rounds || []).map(r => r.flag), ...(g.shots || []).map(s => s.flag)) }))
    .sort((a, b) => b.score - a.score || a.when - b.when);
}
const rankOf = (games, idx) => leaderboard(games).findIndex(e => e.idx === idx) + 1;
const medal = (rank) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

const ROLL_WINDOW = 60; // putts
function trendData(sessions) {
  const out = [], putts = [];
  sessions.forEach((s, idx) => {
    let m = 0, a = 0;
    s.rounds.forEach(r => puttsOf(r).forEach(hit => {
      putts.push(hit); m += hit ? 1 : 0; a += 1;
    }));
    const win = putts.slice(-ROLL_WINDOW);
    out.push({
      n: idx + 1,
      date: new Date(s.startedAt).toLocaleDateString([], { month: "numeric", day: "numeric" }),
      acc: a ? Math.round((100 * m) / a) : null,
      roll: win.length ? Math.round((100 * win.filter(Boolean).length) / win.length) : null,
      putts: a,
    });
  });
  return out;
}

// ---------- deeper analytics ----------
// Rounds logged before miss direction existed are counted as "Prior" rather
// than dropped, so old sessions still contribute to totals honestly.
function missAnalysis(rounds) {
  const blank = () => ({ L: 0, R: 0, H: 0, Lo: 0, prior: 0 });
  const all = blank(), byFlag = {};
  for (let f = 1; f <= 5; f++) byFlag[f] = blank();
  rounds.forEach(r => {
    const dirs = missOf(r);
    puttsOf(r).forEach((hit, i) => {
      if (hit) return;
      const d = dirs[i];
      const bucket = d && all[d] !== undefined ? d : "prior";
      all[bucket] += 1; byFlag[r.flag][bucket] += 1;
    });
  });
  const known = all.L + all.R + all.H + all.Lo;
  const worst = known ? ["L", "R", "H", "Lo"].reduce((a, b) => (all[b] > all[a] ? b : a), "L") : null;
  return { all, byFlag, known, prior: all.prior, worst };
}

const accOf = (rounds) => {
  let m = 0, a = 0;
  rounds.forEach(r => puttsOf(r).forEach(hit => { m += hit ? 1 : 0; a += 1; }));
  return { m, a };
};

// when you putt best: morning / midday / evening
function timeOfDay(sessions) {
  const buckets = {
    morning: { label: "Morning", hint: "before noon", m: 0, a: 0 },
    midday: { label: "Midday", hint: "12–5pm", m: 0, a: 0 },
    evening: { label: "Evening", hint: "after 5pm", m: 0, a: 0 },
  };
  sessions.forEach(s => {
    const h = new Date(s.startedAt).getHours();
    const key = h < 12 ? "morning" : h < 17 ? "midday" : "evening";
    const { m, a } = accOf(s.rounds);
    buckets[key].m += m; buckets[key].a += a;
  });
  return buckets;
}

// do you fade as a session runs long?
function fatigueCurve(sessions) {
  const bands = [
    { label: "1–5", lo: 0, hi: 5, m: 0, a: 0 },
    { label: "6–10", lo: 5, hi: 10, m: 0, a: 0 },
    { label: "11–20", lo: 10, hi: 20, m: 0, a: 0 },
    { label: "21+", lo: 20, hi: Infinity, m: 0, a: 0 },
  ];
  sessions.forEach(s => s.rounds.forEach((r, i) => {
    const b = bands.find(x => i >= x.lo && i < x.hi);
    if (!b) return;
    puttsOf(r).forEach(hit => { b.m += hit ? 1 : 0; b.a += 1; });
  }));
  return bands.filter(b => b.a > 0);
}

// does rushing cost you? buckets rounds by how long they took
function paceEffect(sessions) {
  const bands = [
    { label: "Quick", hint: "under 45s", max: 45, m: 0, a: 0 },
    { label: "Steady", hint: "45s–2m", max: 120, m: 0, a: 0 },
    { label: "Slow", hint: "over 2m", max: Infinity, m: 0, a: 0 },
  ];
  sessions.forEach(s => s.rounds.forEach(r => {
    if (typeof r.dur !== "number") return;
    const b = bands.find(x => r.dur < x.max);
    puttsOf(r).forEach(hit => { b.m += hit ? 1 : 0; b.a += 1; });
  }));
  return bands.filter(b => b.a > 0);
}

// how often a session ever reaches the top flag, and where you stall out
function ceilingAnalysis(sessions) {
  let reached5 = 0;
  const stallRounds = {};
  for (let f = 1; f <= 5; f++) stallRounds[f] = 0;
  sessions.forEach(s => {
    if (s.rounds.some(r => r.flag === 5)) reached5 += 1;
    s.rounds.forEach(r => { stallRounds[r.flag] += 1; });
  });
  const busiest = Object.entries(stallRounds).sort((a, b) => b[1] - a[1])[0];
  return {
    reached5, sessions: sessions.length,
    rate: sessions.length ? Math.round((100 * reached5) / sessions.length) : 0,
    busiestFlag: busiest && busiest[1] > 0 ? +busiest[0] : null,
    stallRounds,
  };
}

// putting under pressure: rounds thrown while on watch
function pressureSplit(sessions) {
  const on = { m: 0, a: 0 }, off = { m: 0, a: 0 };
  sessions.forEach(s => s.rounds.forEach(r => {
    const b = r.prevWatch ? on : off;
    puttsOf(r).forEach(hit => { b.m += hit ? 1 : 0; b.a += 1; });
  }));
  return { on, off };
}

// ---------- storage ----------
// IndexedDB is the primary store: iOS evicts localStorage far more readily,
// which is what loses a session. localStorage is kept as a mirror so a failure
// in either one can't take your history with it.
const NS = "puttingyard:";
const DB_NAME = "putting-yard", STORE = "kv";

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
  }
  return dbPromise;
}

function idb(mode, fn) {
  return openDb().then(db => {
    if (!db) return undefined;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.onabort = tx.onerror = () => resolve(undefined);
        if (req) { req.onsuccess = () => resolve(req.result); req.onerror = () => resolve(undefined); }
        else { tx.oncomplete = () => resolve(undefined); }
      } catch { resolve(undefined); }
    });
  }).catch(() => undefined);
}

async function loadKey(key) {
  const fromIdb = await idb("readonly", (s) => s.get(key));
  if (fromIdb !== undefined && fromIdb !== null) return fromIdb;
  try { const v = localStorage.getItem(NS + key); return v ? JSON.parse(v) : null; }
  catch { return null; }
}

async function saveKey(key, val) {
  // write both; whichever survives wins on next load
  idb("readwrite", (s) => s.put(val, key));
  try { localStorage.setItem(NS + key, JSON.stringify(val)); }
  catch (e) { console.error("localStorage mirror failed", e); }
}

async function deleteKey(key) {
  idb("readwrite", (s) => s.delete(key));
  try { localStorage.removeItem(NS + key); } catch { /* nothing to remove */ }
}

// ---------- compact encoding for cloud backup ----------
// Rounds squeeze down to a few numbers each so the synced file stays tiny.
// Miss directions pack into one small number: 3 slots x 3 bits.
const DIR_CODE = { L: 1, R: 2, H: 3, Lo: 4 };
const CODE_DIR = { 1: "L", 2: "R", 3: "H", 4: "Lo" };
const unpackMiss = (order, code = 0) => {
  const out = {};
  order.forEach((k, i) => {
    const d = CODE_DIR[(code >> (i * 3)) & 7];
    if (d) out[k] = d;
  });
  return out;
};

function packSession(s) {
  return {
    s: s.startedAt,
    e: s.endedAt || null,
    r: s.rounds.map(r => {
      const putts = puttsOf(r), dirs = missOf(r);
      const bits = putts.reduce((n, hit, i) => n | (hit ? 1 << i : 0), 0);
      const mcode = dirs.reduce((n, d, i) => n | ((DIR_CODE[d] || 0) << (i * 3)), 0);
      return [r.flag, bits, Math.round(r.dur || 0), 0, r.prevWatch ? 1 : 0, mcode];
    }),
  };
}
function unpackSession(p) {
  return {
    startedAt: p.s,
    endedAt: p.e || undefined,
    rounds: (p.r || []).map(([flag, bits, dur, _legacyOrder, pw, mcode]) => {
      const putts = [0, 1, 2].map(i => !!(bits & (1 << i)));
      const miss = {};
      [0, 1, 2].forEach(i => { const d = CODE_DIR[((mcode || 0) >> (i * 3)) & 7]; if (d) miss[i] = d; });
      return {
        flag, putts, miss, dur,
        made: putts.filter(Boolean).length,
        prevFlag: flag, prevWatch: !!pw,
      };
    }),
  };
}
function packGame(g) {
  const base = { s: g.startedAt, e: g.endedAt || null, c: gameScore(g), n: g.name || "Me" };
  return Array.isArray(g.rounds)
    ? { ...base, r: g.rounds.map(x => [
        x.flag, x.made, x.prevWatch ? 1 : 0,
        (x.putts || []).reduce((n, v, i) => n | (v ? 1 << i : 0), 0),
        [0, 1, 2].reduce((n, i) => n | ((DIR_CODE[(x.miss || {})[i]] || 0) << (i * 3)), 0),
      ]) }   // ladder run
    : { ...base, h: (g.shots || []).map(x => [x.flag, x.made ? 1 : 0]) };        // legacy free-shot run
}
function unpackGame(p) {
  const base = { startedAt: p.s, endedAt: p.e || undefined, name: p.n || "Me" };
  if (p.r) {
    const rounds = p.r.map(([flag, made, pw, pbits, mcode]) => {
      const putts = pbits === undefined ? [] : [0, 1, 2].map(i => !!(pbits & (1 << i)));
      const miss = {};
      if (mcode) [0, 1, 2].forEach(i => { const d = CODE_DIR[(mcode >> (i * 3)) & 7]; if (d) miss[i] = d; });
      return { flag, made, putts, miss, prevFlag: flag, prevWatch: !!pw };
    });
    return { ...base, rounds, score: p.c ?? gameScore({ rounds }) };
  }
  const shots = (p.h || []).map(([flag, made]) => ({ flag, made: !!made }));
  return { ...base, shots, score: p.c ?? gameScore({ shots }) };
}
const packAll = (sessions, games, distances) => ({
  v: 1, t: Date.now(), d: distances,
  s: sessions.map(packSession), g: games.map(packGame),
});
// Tolerant of whatever else is in the store: a starter value, a stray key, or
// a partially written record shouldn't stop a sync.
const safeMap = (arr, fn) => (Array.isArray(arr) ? arr : []).flatMap(x => {
  try { const v = fn(x); return v ? [v] : []; } catch { return []; }
});
const unpackAll = (p) => {
  const src = p && typeof p === "object" ? p : {};
  return {
    sessions: safeMap(src.s, unpackSession).filter(x => x.startedAt && Array.isArray(x.rounds)),
    games: safeMap(src.g, unpackGame).filter(x => x.startedAt),
    distances: src.d && typeof src.d === "object" ? src.d : {},
  };
};

// merge two lists of records by start time; newer/longer wins on collisions
function mergeRecords(a, b, sizeOf) {
  const by = new Map();
  [...a, ...b].forEach(x => {
    const prev = by.get(x.startedAt);
    if (!prev || sizeOf(x) > sizeOf(prev)) by.set(x.startedAt, x);
  });
  return [...by.values()].sort((x, y) => x.startedAt - y.startedAt);
};

// ---------- shared storage backends ----------
// Three ways to share data across devices, in order of least setup:
//   1. rest    — any URL that answers GET with JSON and accepts PUT of JSON
//                (e.g. an anonymous JSON blob). No account, no token.
//   2. firebase— a Realtime Database URL. Same shape, needs ".json" appended.
//   3. github  — a repo file, using a token entered once on each device.
//                Tokens can't live in config.js: GitHub revokes any token
//                committed to a public repo.
const cfgUrl = () => ((typeof window !== "undefined" && window.PUTTING_DB) || "").replace(/\/+$/, "");
// A store URL can also be set in-app (kept on this device). config.js wins,
// because that's the copy every device gets automatically.
let localStoreUrl = "";
const setLocalStore = (u) => { localStoreUrl = (u || "").replace(/\/+$/, ""); };
const activeUrl = () => cfgUrl() || localStoreUrl;

// Create an anonymous JSON blob — no account, no key. Returns its API URL.
const JSONBLOB = "https://jsonblob.com/api/jsonBlob";
async function createStore() {
  const res = await fetch(JSONBLOB, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ v: 1, created: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`Couldn't create a store (${res.status}).`);
  const loc = res.headers.get("Location") || res.headers.get("X-jsonblob");
  if (!loc) throw new Error("Store created but its address wasn't readable — create one manually at jsonblob.com instead.");
  return loc.startsWith("http") ? loc : `${JSONBLOB}/${loc}`;
}
const dbBucket = () => (typeof window !== "undefined" && window.PUTTING_BUCKET) || "yard";

function backendKind(ghCfg) {
  const u = activeUrl();
  if (u) return u.includes("firebaseio.com") ? "firebase" : "rest";
  if (ghCfg && ghCfg.owner && ghCfg.repo && ghCfg.token) return "github";
  return null;
}
const dbConfiguredWith = (ghCfg) => !!backendKind(ghCfg);

// Accept the address straight from the jsonblob browser bar and convert it to
// the API form — copying the wrong one is the easiest mistake to make.
function normalizeStoreUrl(raw) {
  const u = (raw || "").trim().replace(/\/+$/, "");
  const jb = u.match(/^https?:\/\/(?:www\.)?jsonblob\.com\/(?!api\/)([\w-]+)$/i);
  return jb ? `https://jsonblob.com/api/jsonBlob/${jb[1]}` : u;
}

const restUrl = () => {
  const u = activeUrl();
  if (u.includes("firebaseio.com")) return `${u}/${dbBucket()}.json`;
  return normalizeStoreUrl(u);
};

const GH_PATH = "putting-data.json";
const ghHeaders = (cfg) => ({
  Authorization: `Bearer ${cfg.token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});
const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (str) => decodeURIComponent(escape(atob(str.replace(/\s/g, ""))));

async function ghPull(cfg) {
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${GH_PATH}?t=${Date.now()}`,
    { headers: ghHeaders(cfg), cache: "no-store" });
  if (res.status === 404) return { data: null, sha: null };
  if (res.status === 401) throw new Error("Token rejected — check it was pasted in full.");
  if (res.status === 403) throw new Error("Token lacks Contents write access to that repo.");
  if (!res.ok) throw new Error(`GitHub returned ${res.status}.`);
  const j = await res.json();
  return { data: JSON.parse(b64decode(j.content)), sha: j.sha };
}

async function ghPush(cfg, payload, sha) {
  const res = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${GH_PATH}`, {
    method: "PUT",
    headers: { ...ghHeaders(cfg), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `putting yard ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
      content: b64encode(JSON.stringify(payload)),
      ...(sha ? { sha } : {}),
    }),
  });
  if (res.status === 409) throw new Error("Someone else synced first — try Sync now again.");
  if (!res.ok) throw new Error(`Save failed (${res.status}).`);
  const j = await res.json();
  return j.content?.sha || null;
}

// Extra headers from config.js, for stores that want an API key.
const cfgHeaders = () => (typeof window !== "undefined" && window.PUTTING_HEADERS) || {};

// jsonbin reads from /latest and wraps the payload in { record: ... };
// everything else is a plain GET/PUT of the JSON itself.
const isJsonbin = (u) => /api\.jsonbin\.io\/v3\/b\//i.test(u);

async function restPull() {
  const base = restUrl();
  const url = isJsonbin(base) ? `${base.replace(/\/latest$/, "")}/latest` : base;
  const res = await fetch(url.includes("?") ? `${url}&t=${Date.now()}` : `${url}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/json", ...cfgHeaders() },
  });
  if (res.status === 404) return null;
  if (res.status === 401 || res.status === 403) throw new Error("Store rejected the request — check the key in config.js.");
  if (!res.ok) throw new Error(`Store returned ${res.status}.`);
  const j = await res.json();
  if (!j) return null;
  return isJsonbin(base) && j.record !== undefined ? j.record : j;
}

async function restPush(payload) {
  const base = restUrl();
  const url = isJsonbin(base) ? base.replace(/\/latest$/, "") : base;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(isJsonbin(base) ? { "X-Bin-Versioning": "false" } : {}),
      ...cfgHeaders(),
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Store rejected the write — check the key in config.js.");
  if (!res.ok) throw new Error(`Save failed (${res.status}).`);
  return true;
}

// haptics: Android Chrome buzzes; iOS Safari ignores this silently
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ }
}

// ---------- icons ----------
// Monochrome line icons, sized to sit beside text. They inherit `color`,
// so they read as part of the label rather than as decoration.
function Icon({ name, size = 15, style }) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round",
    style: { flexShrink: 0, ...style },
  };
  const paths = {
    // disc, seen at a slight angle
    disc: <><ellipse cx="12" cy="12" rx="9" ry="5.5" /><ellipse cx="12" cy="12" rx="4" ry="2.2" /></>,
    // basket: chains above, band below
    basket: <><path d="M12 4v16" /><path d="M5.5 8.5h13" /><path d="M8 8.5l4 5 4-5" /><path d="M6.5 14.5h11l-1.5 2.5h-8z" /><path d="M8.5 20h7" /></>,
    // pennant on a pole
    flag: <><path d="M6 3v18" /><path d="M6 4.5l12 3.5-12 3.5z" /></>,
    // upward progression
    climb: <><path d="M4 19h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-4" /></>,
    trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 5H5v1a3 3 0 0 0 3 3" /><path d="M16 5h3v1a3 3 0 0 1-3 3" /><path d="M12 13v4" /><path d="M9 20h6" /><path d="M10 17h4l.5 3h-5z" /></>,
    target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
    trend: <><path d="M3 17l5-5 4 3 6-7" /><path d="M14 8h5v5" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    grid: <><path d="M4 4h16v16H4z" /><path d="M4 10h16M4 15h16M10 4v16M15 4v16" /></>,
    route: <><circle cx="6" cy="6" r="2.2" /><circle cx="18" cy="18" r="2.2" /><path d="M8 6h6a4 4 0 0 1 0 8H10a4 4 0 0 0 0 8" /></>,
    cloud: <><path d="M7 18h10a4 4 0 0 0 .5-8 5.5 5.5 0 0 0-10.6 1.3A3.6 3.6 0 0 0 7 18z" /></>,
    save: <><path d="M12 3v11" /><path d="M8 11l4 4 4-4" /><path d="M4 19h16" /></>,
    ruler: <><path d="M3 9h18v6H3z" /><path d="M7 9v3M11 9v4M15 9v3M19 9v4" /></>,
    gear: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6 6 18M18 18l-1.4-1.4M7.4 7.4 6 6" /></>,
    pencil: <><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z" /><path d="M14.5 6.5l3 3" /></>,
    trash: <><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6.5 7l1 13h9l1-13" /></>,
    person: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    spark: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /><circle cx="12" cy="12" r="3" /></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name] || paths.disc}</svg>;
}

// Flags and watch status are derived from the sequence of makes, so after any
// edit the entire chain is replayed from flag 1 rather than patched in place.
function replaySession(rounds) {
  let flag = 1, watch = false;
  return rounds.map(r => {
    const made = puttsOf(r).filter(Boolean).length;
    const out = { ...r, flag, made, prevFlag: flag, prevWatch: watch };
    const { nf, nw } = applyRules(flag, watch, made);
    flag = nf; watch = nw;
    return out;
  });
}

// ---------- miss directions ----------
// Stored alongside (not instead of) the boolean make/miss, so every existing
// stat keeps working and direction is purely additive.
const DIRS = [
  { k: "L",  label: "Left",  arrow: "\u2190", area: "1 / 1 / 2 / 2" },
  { k: "H",  label: "High",  arrow: "\u2191", area: "1 / 2 / 2 / 3" },
  { k: "Lo", label: "Low",   arrow: "\u2193", area: "2 / 1 / 3 / 2" },
  { k: "R",  label: "Right", arrow: "\u2192", area: "2 / 2 / 3 / 3" },
];
const DIR_LABEL = { L: "left", R: "right", H: "high", Lo: "low" };

// One putt: a big MADE target, plus a compact four-way pad for where it missed.
// The pad reads as one unit, so it never competes with MADE for attention.
function PuttRow({ label, sub, value, dir, onMade, onMiss }) {
  const missed = value === false;
  const answered = value !== null && value !== undefined;
  return (
    <div className="flex-1 flex gap-2 min-h-0">
      <div className="flex flex-col items-center justify-center rounded-2xl"
        style={{
          width: 46,
          background: answered ? (value ? "#E4EFE7" : "#ECEDEA") : "#F1EFE7",
          color: answered ? (value ? C.fairway : C.miss) : C.faint,
        }}>
        <span style={{ ...disp, fontWeight: 800, fontSize: 21, lineHeight: 1 }}>{label}</span>
        {sub && <span style={{ fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase" }}>{sub}</span>}
      </div>

      <button onClick={onMade} className="rounded-2xl"
        style={{
          flex: "1.35 1 0%",
          background: value === true ? C.fairway : C.card,
          color: value === true ? "#fff" : C.ink,
          border: value === true ? `2px solid ${C.fairway}` : `2px solid ${C.line}`,
          ...disp, fontWeight: 800, fontSize: 25,
        }}>MADE</button>

      <div className="rounded-2xl"
        style={{
          flex: "1 1 0%", display: "grid",
          gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 3, padding: 3,
          background: missed ? C.miss : C.card,
          border: `2px solid ${missed ? C.miss : C.line}`,
        }}>
        {DIRS.map(d => {
          const on = missed && dir === d.k;
          return (
            <button key={d.k} onClick={() => onMiss(d.k)} aria-label={`Missed ${d.label.toLowerCase()}`}
              style={{
                gridArea: d.area, borderRadius: 11,
                background: on ? "#fff" : missed ? "rgba(255,255,255,0.18)" : "#FAF8F2",
                color: on ? C.ink : missed ? "#fff" : C.faint,
                ...disp, fontWeight: 800, fontSize: 19, lineHeight: 1,
              }}>
              {d.arrow}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- flight path ----------
// The ladder drawn as a fairway you're working down: basket and chains at the
// near end, flags marching out to distance. When a round lands, the three putts
// fly for real — animated frame by frame, not with SMIL, whose begin times are
// measured from page load and so never fire on an element added later.
function useFlight(throwFx, onDone) {
  const [frame, setFrame] = useState(null);
  const raf = useRef(0);
  useEffect(() => {
    if (!throwFx) { setFrame(null); return; }
    const DELAY = 150, FLY = 560, HOLD = 420;
    const n = throwFx.results.length;
    const total = DELAY * (n - 1) + FLY + HOLD;
    const t0 = performance.now();
    const tick = (now) => {
      const e = now - t0;
      setFrame(throwFx.results.map((_, i) => {
        const local = e - i * DELAY;
        if (local <= 0) return { t: 0, live: false };
        if (local >= FLY) return { t: 1, live: true, landed: true };
        const t = local / FLY;
        return { t: 1 - Math.pow(1 - t, 1.7), live: true }; // ease-out, like a disc losing speed
      }));
      if (e < total) raf.current = requestAnimationFrame(tick);
      else { setFrame(null); onDone && onDone(); }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [throwFx && throwFx.id]);
  return frame;
}

function FlightPath({ flag, watch, highest = 1, throwFx = null, colors = null, onFlightDone, distances = {} }) {
  const W = 320, H = 150;
  const frame = useFlight(throwFx, onFlightDone);

  // the fairway line: flags recede up and to the right
  const p0 = { x: 108, y: H - 44 }, p1 = { x: 222, y: H - 40 }, p2 = { x: W - 22, y: 32 };
  const at = (t) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + t ** 2 * p2.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + t ** 2 * p2.y,
  });
  const stops = [1, 2, 3, 4, 5].map(f => ({ f, ...at((f - 1) / 4) }));
  const here = stops[flag - 1];
  const accent = watch ? C.amber : C.fairway;
  const line = `M${p0.x} ${p0.y} Q${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
  const basket = { x: 22, y: H - 78 };
  const target = { x: basket.x + 9, y: basket.y + 30 };

  // a putt's arc, from the flag you threw from to the chains
  const from = throwFx ? stops[throwFx.flag - 1] : null;
  const arcPoint = (i, t, hit, dir) => {
    const start = { x: from.x, y: from.y - 14 };
    const off = hit ? { x: 0, y: 0 } : ({ L: { x: -20, y: 4 }, R: { x: 20, y: 2 }, H: { x: -2, y: -22 }, Lo: { x: -2, y: 20 } }[dir] || { x: 14, y: 10 });
    const end = { x: target.x + off.x, y: target.y + off.y };
    const lift = 30 + i * 7;
    const cx = (start.x + end.x) / 2, cy = Math.min(start.y, end.y) - lift;
    return {
      x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * cx + t ** 2 * end.x,
      y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * cy + t ** 2 * end.y,
    };
  };

  const anyLanded = frame && throwFx && frame.some((f, i) => f.landed && throwFx.results[i]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: "block", overflow: "visible" }} aria-hidden="true">
      <defs>
        <linearGradient id="fairway" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.45" />
        </linearGradient>
      </defs>

      {/* ground line, so the flags feel planted */}
      <path d={line} fill="none" stroke={C.line} strokeWidth="12" strokeLinecap="round" opacity="0.35" />

      {/* distance still to earn */}
      <path d={line} fill="none" stroke={C.line} strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" />
      {/* distance already earned */}
      <path d={line} fill="none" stroke="url(#fairway)" strokeWidth="3" strokeLinecap="round"
        pathLength="100" strokeDasharray="100"
        strokeDashoffset={100 - ((flag - 1) / 4) * 100}
        style={{ transition: "stroke-dashoffset 560ms cubic-bezier(.22,.9,.3,1)" }} />

      {/* basket: pole, chains, band, tray */}
      <g transform={`translate(${basket.x} ${basket.y})`} fill="none" strokeLinecap="round"
        stroke={anyLanded ? accent : C.faint} strokeWidth="1.8" style={{ transition: "stroke 220ms" }}>
        <path d="M9 2v34" />
        <path d="M0 10h18" />
        <g style={{ transformOrigin: "9px 10px", animation: anyLanded ? "chains 420ms ease-out" : "none" }}>
          <path d="M2.5 10l6.5 8 6.5-8" />
          <path d="M5.5 10l3.5 8M12.5 10l-3.5 8" />
        </g>
        <path d="M1.5 20h15l-2 6h-11z" fill={anyLanded ? `${C.fairway}1f` : "transparent"} style={{ transition: "fill 220ms" }} />
        <path d="M4 36h10" />
      </g>

      {/* flags */}
      {stops.map(s => {
        const reached = highest >= s.f, cur = s.f === flag;
        return (
          <g key={s.f} transform={`translate(${s.x} ${s.y})`}>
            <ellipse cx="0" cy="1" rx={cur ? 7 : 5} ry="2" fill={C.line} opacity="0.7" />
            <line x1="0" y1="0" x2="0" y2={cur ? -20 : -15} stroke={cur ? C.ink : reached ? "#A9BBAE" : C.line} strokeWidth={cur ? 2 : 1.6} strokeLinecap="round" />
            <path d={cur ? "M0.6 -19 L13 -14.5 L0.6 -10 Z" : "M0.5 -14.5 L9.5 -11 L0.5 -7.5 Z"}
              fill={cur ? accent : reached ? "#CFE3D6" : "#ECE9DF"}
              stroke={cur ? C.ink : C.line} strokeWidth="0.9" strokeLinejoin="round" />
            <text x="0" y="14" textAnchor="middle"
              style={{ ...disp, fontWeight: cur ? 800 : 700, fontSize: cur ? 13 : 11, fill: cur ? C.ink : C.faint }}>{s.f}</text>
            {distances[s.f] && (
              <text x="0" y="24" textAnchor="middle" style={{ fontSize: 8, fill: C.line }}>{distances[s.f]}ft</text>
            )}
          </g>
        );
      })}

      {/* where you stand now */}
      <g transform={`translate(${here.x} ${here.y - 30})`} style={{ transition: "transform 560ms cubic-bezier(.22,.9,.3,1)" }}>
        <ellipse rx="10" ry="4.2" fill={accent} stroke={C.ink} strokeWidth="1.2" />
        <ellipse rx="4.4" ry="1.6" fill="none" stroke={C.paper} strokeWidth="1" opacity="0.85" />
      </g>

      {/* the round in flight */}
      {frame && throwFx && frame.map((f, i) => {
        if (!f.live) return null;
        const hit = throwFx.results[i];
        const dir = throwFx.dirs[i];
        const pt = arcPoint(i, f.t, hit, dir);
        const prev = arcPoint(i, Math.max(0, f.t - 0.06), hit, dir);
        const ang = (Math.atan2(pt.y - prev.y, pt.x - prev.x) * 180) / Math.PI;
        const fade = f.landed ? 0.35 : 1;
        const col = hit ? (colors && colors[i]) || C.fairway : C.miss;
        return (
          <g key={i} opacity={fade} style={{ transition: f.landed ? "opacity 320ms" : "none" }}>
            <line x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y} stroke={col} strokeWidth="1.4" opacity="0.35" strokeLinecap="round" />
            <g transform={`translate(${pt.x} ${pt.y}) rotate(${ang * 0.35})`}>
              <ellipse rx="7" ry="2.9" fill={col} stroke={C.ink} strokeWidth="0.9" />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// Secondary reporting: where misses go, overall and by flag. Rounds logged
// before direction tracking existed are shown as "Prior" rather than hidden.
function MissReport({ sessions, distances = {} }) {
  const rounds = sessions.flatMap(s => s.rounds);
  const m = missAnalysis(rounds);
  if (!m.known && !m.prior) return null;
  const pct = (n) => (m.known ? Math.round((100 * n) / m.known) : 0);

  const zone = (k, label) => {
    const n = m.all[k];
    return (
      <div className="rounded-xl py-2 text-center"
        style={{ background: n ? `rgba(206,47,47,${0.06 + 0.34 * (m.known ? n / m.known : 0)})` : "#FAF8F2", border: `1px solid ${C.line}` }}>
        <div style={{ ...disp, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{m.known ? `${pct(n)}%` : "—"}</div>
        <div style={{ fontSize: 11, color: C.faint }}>{label}</div>
      </div>
    );
  };

  return (
    <StatBlock title="Where the misses go" icon="target">
      {m.known > 0 ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <div />{zone("H", "high")}<div />
            {zone("L", "left")}
            <div className="flex items-center justify-center" style={{ color: C.line }}><Icon name="basket" size={28} /></div>
            {zone("R", "right")}
            <div />{zone("Lo", "low")}<div />
          </div>
          <div style={{ fontSize: 12, color: C.faint }} className="mt-2">
            {m.known} directional miss{m.known > 1 ? "es" : ""} — most often {DIR_LABEL[m.worst]}.
          </div>

          {/* the interesting part: does the bias change with distance? */}
          <div style={{ ...disp, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: C.faint }} className="mt-3 mb-1">
            By flag
          </div>
          {[1, 2, 3, 4, 5].map(f => {
            const b = m.byFlag[f], tot = b.L + b.R + b.H + b.Lo;
            if (!tot) return null;
            const seg = [["L", C.amber], ["R", C.red], ["H", "#7FA98C"], ["Lo", C.miss]];
            const lead = seg.map(([k]) => k).reduce((a, k) => (b[k] > b[a] ? k : a), "L");
            return (
              <div key={f} className="flex items-center gap-2 py-1">
                <span style={{ ...disp, fontWeight: 700, fontSize: 14, width: 44, color: C.faint }}>
                  {distances[f] ? `${distances[f]}ft` : `F${f}`}
                </span>
                <div className="flex-1 flex h-3 rounded-full overflow-hidden" style={{ background: "#EDEAE0" }}>
                  {seg.map(([k, col]) => b[k] ? (
                    <div key={k} style={{ width: `${(100 * b[k]) / tot}%`, background: col }} title={DIR_LABEL[k]} />
                  ) : null)}
                </div>
                <span style={{ fontSize: 11, color: C.faint, width: 60, textAlign: "right" }}>{tot} · {DIR_LABEL[lead]}</span>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 mt-2">
            {[["L", C.amber, "left"], ["R", C.red, "right"], ["H", "#7FA98C", "high"], ["Lo", C.miss, "low"]].map(([k, col, lbl]) => (
              <span key={k} className="flex items-center gap-1" style={{ fontSize: 11, color: C.faint }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: col, display: "inline-block" }} />{lbl}
              </span>
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: C.faint }}>No directional misses logged yet — they start appearing as you use the arrow pad.</div>
      )}

      {m.prior > 0 && (
        <div className="rounded-xl px-3 py-2 mt-3" style={{ background: "#FAF8F2", border: `1px dashed ${C.line}`, fontSize: 12, color: C.faint }}>
          <strong style={{ color: C.ink }}>Prior:</strong> {m.prior} miss{m.prior > 1 ? "es" : ""} logged before direction tracking, counted in totals but not in the zones above.
        </div>
      )}
    </StatBlock>
  );
}

// When you putt well: time of day, how deep into a session, and pace.
function RhythmReport({ sessions }) {
  const tod = timeOfDay(sessions), fat = fatigueCurve(sessions), pace = paceEffect(sessions);
  const pc = (b) => (b.a ? Math.round((100 * b.m) / b.a) : null);
  const row = (items, keyf, labelf, hintf) => (
    <div className="flex gap-2">
      {items.map((b, i) => {
        const v = pc(b);
        return (
          <div key={keyf(b, i)} className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
            <div style={{ ...disp, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{v === null ? "—" : `${v}%`}</div>
            <div style={{ fontSize: 11, color: C.faint }}>{labelf(b, i)}</div>
            {hintf && <div style={{ fontSize: 10, color: C.line }}>{hintf(b, i)}</div>}
          </div>
        );
      })}
    </div>
  );

  const todList = Object.values(tod).filter(b => b.a > 0);
  const best = todList.length > 1 ? todList.reduce((a, b) => (pc(b) > pc(a) ? b : a)) : null;

  return (
    <StatBlock title="Your rhythm" icon="clock">
      {todList.length > 0 && (
        <>
          {row(todList, b => b.label, b => b.label, b => b.hint)}
          {best && <div style={{ fontSize: 12, color: C.faint }} className="mt-2">Sharpest in the {best.label.toLowerCase()}.</div>}
        </>
      )}

      {fat.length > 1 && (
        <>
          <div style={{ ...disp, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: C.faint }} className="mt-3 mb-1">
            How deep into a session
          </div>
          {row(fat, b => b.label, b => `rd ${b.label}`)}
        </>
      )}

      {pace.length > 1 && (
        <>
          <div style={{ ...disp, fontWeight: 700, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", color: C.faint }} className="mt-3 mb-1">
            Pace per round
          </div>
          {row(pace, b => b.label, b => b.label, b => b.hint)}
          <div style={{ fontSize: 12, color: C.faint }} className="mt-2">
            Whether taking your time actually helps, in your own numbers.
          </div>
        </>
      )}
    </StatBlock>
  );
}

// The ladder itself: how often you top out, where you stall, and pressure putting.
function CeilingReport({ sessions }) {
  const c = ceilingAnalysis(sessions);
  const p = pressureSplit(sessions);
  const pc = (b) => (b.a ? Math.round((100 * b.m) / b.a) : null);
  const onPc = pc(p.on), offPc = pc(p.off);
  const delta = onPc !== null && offPc !== null ? onPc - offPc : null;
  return (
    <StatBlock title="The ladder" icon="climb">
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{c.rate}%</div>
          <div style={{ fontSize: 11, color: C.faint }}>sessions reaching flag 5</div>
        </div>
        <div className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{c.busiestFlag ?? "—"}</div>
          <div style={{ fontSize: 11, color: C.faint }}>flag you live on</div>
        </div>
        <div className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{onPc === null ? "—" : `${onPc}%`}</div>
          <div style={{ fontSize: 11, color: C.faint }}>while on watch</div>
        </div>
      </div>
      {delta !== null && p.on.a >= 6 && (
        <div style={{ fontSize: 12, color: delta >= 3 ? C.fairway : delta <= -3 ? C.red : C.faint }} className="mt-2">
          {delta >= 3
            ? `You rise under pressure — +${delta} pts on watch rounds.`
            : delta <= -3
              ? `Pressure costs you ${Math.abs(delta)} pts on watch rounds.`
              : "Pressure doesn't move your numbers much."}
        </div>
      )}
    </StatBlock>
  );
}

function TabBar({ tab, setTab }) {
  const tabs = [
    { k: "home", label: "Play", icon: "basket" },
    { k: "stats", label: "Stats", icon: "chart" },
    { k: "board", label: "Board", icon: "trophy" },
    { k: "settings", label: "Settings", icon: "gear" },
  ];
  return (
    <div style={{
      position: "sticky", bottom: 0, zIndex: 20,
      background: "rgba(246,244,237,0.94)", backdropFilter: "blur(8px)",
      borderTop: `1px solid ${C.line}`,
      paddingBottom: "env(safe-area-inset-bottom)",
    }}>
      <div className="flex max-w-md mx-auto">
        {tabs.map(t => {
          const on = tab === t.k;
          return (
            <button key={t.k} onClick={() => setTab(t.k)} aria-label={t.label}
              className="flex-1 flex flex-col items-center gap-0.5"
              style={{ padding: "9px 0 7px", color: on ? C.fairway : C.faint }}>
              <Icon name={t.icon} size={20} />
              <span style={{ ...disp, fontWeight: on ? 800 : 600, fontSize: 12, letterSpacing: "0.03em" }}>{t.label}</span>
              <span style={{ width: 16, height: 2, borderRadius: 2, background: on ? C.fairway : "transparent" }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- small pieces ----------
function FlagRail({ flag, watch, highest }) {
  return (
    <div className="flex justify-between items-end px-1">
      {[1, 2, 3, 4, 5].map(f => {
        const cur = f === flag;
        return (
          <div key={f} className="flex flex-col items-center" style={{ width: 52 }}>
            <svg width="30" height="38" viewBox="0 0 34 42">
              <line x1="6" y1="4" x2="6" y2="40" stroke={cur ? C.ink : C.line} strokeWidth="3" strokeLinecap="round" />
              <path d="M8 5 L30 11 L8 17 Z"
                fill={cur ? (watch ? C.amber : C.fairway) : (highest >= f ? "#CFE3D6" : "#ECE9DF")}
                stroke={cur ? C.ink : C.line} strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span style={{ ...disp, fontWeight: 700, fontSize: 14, color: cur ? C.ink : C.faint }}>{f}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatBlock({ title, icon, children }) {
  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-center gap-1.5 mb-2" style={{ color: C.faint }}>
        {icon && <Icon name={icon} size={14} />}
        <span style={{ ...disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase" }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function BigNum({ label, value }) {
  return (
    <div className="flex-1 rounded-2xl p-3 text-center" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div style={{ ...disp, fontWeight: 800, fontSize: 30, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.faint }} className="mt-1">{label}</div>
    </div>
  );
}

function StatsBody({ segments, distances = {} }) {
  const s = computeStats(segments);
  return (
    <>
      <div className="flex gap-2 mb-2">
        <BigNum label="Rounds" value={s.total} />
        <BigNum label="Highest flag" value={s.highest || "—"} />
        <BigNum label="Best streak" value={s.bestStreak || "—"} />
      </div>
      <div className="flex gap-2 mb-3">
        <BigNum label="Avg round" value={fmtDur(s.avgDur)} />
        <BigNum label="Watch saved" value={s.watchSaved + s.watchLost ? `${s.watchSaved}/${s.watchSaved + s.watchLost}` : "—"} />
      </div>

      <StatBlock title="By flag" icon="flag">
        {[1, 2, 3, 4, 5].map(f => (
          <div key={f} className="flex items-center gap-2 py-1">
            <span className="flex flex-col items-center" style={{ width: 34 }}>
              <span style={{ ...disp, fontWeight: 700, fontSize: 17, lineHeight: 1 }}>{f}</span>
              {distances[f] && <span style={{ fontSize: 10, color: C.faint }}>{distances[f]}ft</span>}
            </span>
            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: "#EDEAE0" }}>
              <div className="h-full rounded-full" style={{ width: s.perFlag[f].a ? `${(100 * s.perFlag[f].m) / s.perFlag[f].a}%` : 0, background: C.fairway }} />
            </div>
            <span style={{ fontSize: 13, color: C.faint, width: 74, textAlign: "right" }}>{frac(s.perFlag[f])} · {pct(s.perFlag[f])}</span>
          </div>
        ))}
      </StatBlock>

      {(() => {
        const m = s.missDirs, known = m.L + m.R + m.H + m.Lo;
        if (!known) return null;
        const cell = (k, label) => {
          const n = m[k], p = Math.round((100 * n) / known);
          return (
            <div key={k} className="rounded-xl py-2 text-center"
              style={{ background: n ? `rgba(46,107,69,${0.08 + 0.5 * (n / known)})` : "#FAF8F2", border: `1px solid ${C.line}` }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 20, lineHeight: 1 }}>{p}%</div>
              <div style={{ fontSize: 11, color: C.faint }}>{label}</div>
            </div>
          );
        };
        const worst = ["L", "R", "H", "Lo"].reduce((a, b) => (m[b] > m[a] ? b : a), "L");
        return (
          <StatBlock title="Where the misses go" icon="target">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <div />{cell("H", "high")}<div />
              {cell("L", "left")}
              <div className="flex items-center justify-center" style={{ color: C.line }}><Icon name="basket" size={26} /></div>
              {cell("R", "right")}
              <div />{cell("Lo", "low")}<div />
            </div>
            <div style={{ fontSize: 12, color: C.faint }} className="mt-2">
              {known} logged miss{known > 1 ? "es" : ""} — most often {DIR_LABEL[worst]}.
              {m.unknown ? ` ${m.unknown} without a direction.` : ""}
            </div>
          </StatBlock>
        );
      })()}

      <StatBlock title="Rounds to advance" icon="climb">
        <div className="flex gap-2">
          {[1, 2, 3, 4].map(f => (
            <div key={f} className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>
                {s.adv[f].events ? (s.adv[f].rounds / s.adv[f].events).toFixed(1) : "—"}
              </div>
              <div style={{ fontSize: 11, color: C.faint }}>flag {f}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.faint }} className="mt-2">Average rounds spent at a flag before clearing it.</div>
      </StatBlock>

      {s.late.a > 0 && (
        <StatBlock title="Warm-up effect" icon="spark">
          <div className="flex gap-2">
            <div className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{pct(s.early)}</div>
              <div style={{ fontSize: 11, color: C.faint }}>rounds 1–3 · {frac(s.early)}</div>
            </div>
            <div className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{pct(s.late)}</div>
              <div style={{ fontSize: 11, color: C.faint }}>round 4+ · {frac(s.late)}</div>
            </div>
          </div>
          {s.early.a > 0 && (() => {
            const d = Math.round((100 * s.late.m) / s.late.a) - Math.round((100 * s.early.m) / s.early.a);
            return (
              <div style={{ fontSize: 12, color: d >= 3 ? C.fairway : d <= -3 ? C.red : C.faint }} className="mt-2">
                {d >= 3 ? `You warm into it: +${d} pts once loose.` : d <= -3 ? `You fade after warm-up: ${d} pts.` : "No real cold-start effect."}
              </div>
            );
          })()}
        </StatBlock>
      )}


      <StatBlock title="By throw position" icon="target">
        <div className="flex gap-2">
          {["1st", "2nd", "3rd"].map((lbl, i) => (
            <div key={lbl} className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{pct(s.perPos[i])}</div>
              <div style={{ fontSize: 11, color: C.faint }}>{lbl} · {frac(s.perPos[i])}</div>
            </div>
          ))}
        </div>
      </StatBlock>

    </>
  );
}

function TrendBlock({ sessions }) {
  if (sessions.length < 2) return null;
  const td = trendData(sessions);
  const last5 = aggAcc(sessions.slice(-5).map(s => s.rounds));
  const all = aggAcc(sessions.map(s => s.rounds));
  const d = all.a && last5.a ? Math.round((100 * last5.m) / last5.a) - Math.round((100 * all.m) / all.a) : 0;
  const dot = p => {
    const { cx, cy, payload } = p;
    if (cx == null || cy == null || payload.acc == null) return null;
    const r = Math.max(3, Math.min(9, Math.sqrt(payload.putts) * 1.1));
    return <circle key={payload.n} cx={cx} cy={cy} r={r} fill="#C6D9CC" stroke={C.fairway} strokeWidth={1} fillOpacity={0.8} />;
  };
  return (
    <StatBlock title="Trend" icon="trend">
      <div className="flex items-baseline gap-2 mb-1">
        <span style={{ ...disp, fontWeight: 800, fontSize: 26, lineHeight: 1 }}>{pct(last5)}</span>
        <span style={{ fontSize: 12, color: C.faint }}>last 5 sessions ({last5.a} putts)</span>
        <span style={{ ...disp, fontWeight: 700, fontSize: 16, color: d > 0 ? C.fairway : d < 0 ? C.red : C.faint }}>
          {d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : "–"} vs all-time
        </span>
      </div>
      <ResponsiveContainer width="100%" height={185}>
        <ComposedChart data={td} margin={{ top: 8, right: 6, left: -26, bottom: 0 }}>
          <CartesianGrid stroke={C.line} vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.faint }} tickLine={false} axisLine={{ stroke: C.line }} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: C.faint }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: 10, border: `1px solid ${C.line}`, fontSize: 12 }}
            formatter={(v, name) => [v + "%", name]}
            labelFormatter={(l, pl) => `${l} · ${pl?.[0]?.payload?.putts ?? "?"} putts`}
          />
          <Line dataKey="acc" name="Session" stroke="none" dot={dot} isAnimationActive={false} />
          <Line dataKey="roll" name={`Rolling ${ROLL_WINDOW} putts`} stroke={C.fairway} strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ fontSize: 12, color: C.faint }} className="mt-1">
        Line = rolling accuracy over your last {ROLL_WINDOW} putts, so a 2-round day can't swing it. Dots = single sessions, sized by volume.
      </div>
    </StatBlock>
  );
}

function PersonalBests({ sessions }) {
  const pb = computePBs(sessions);
  if (!pb || sessions.length < 2) return null;
  const rows = [
    pb.streak && ["Longest streak", `${pb.streak.val} putts`, pb.streak.idx],
    pb.climb && ["Fastest climb to flag 5", `${pb.climb.val} rounds`, pb.climb.idx],
    pb.acc && ["Best session accuracy", `${Math.round(pb.acc.val * 100)}% · ${pb.acc.rounds} rds`, pb.acc.idx],
    pb.hold5 && ["Most rounds at flag 5", `${pb.hold5.val}`, pb.hold5.idx],
  ].filter(Boolean);
  if (!rows.length) return null;
  return (
    <StatBlock title="Personal bests" icon="trophy">
      {rows.map(([label, val, idx]) => (
        <div key={label} className="flex items-center justify-between py-1.5" style={{ borderBottom: `1px solid ${C.line}` }}>
          <span style={{ fontSize: 14 }}>{label}</span>
          <span className="text-right">
            <span style={{ ...disp, fontWeight: 800, fontSize: 18 }}>{val}</span>
            <span style={{ fontSize: 11, color: C.faint }} className="ml-2">{fmtDate(sessions[idx].startedAt)}</span>
          </span>
        </div>
      ))}
    </StatBlock>
  );
}

function Leaderboard({ board, games, highlight = null, onPick, limit = 10 }) {
  if (!board.length) return null;
  const rows = board.slice(0, limit);
  return (
    <StatBlock icon="trophy" title={`Leaderboard · ${board.length} run${board.length > 1 ? "s" : ""}`}>
      {rows.map((e, i) => {
        const rank = i + 1;
        const me = e.idx === highlight;
        return (
          <button key={e.idx} onClick={() => onPick && onPick(e.idx)}
            className="w-full flex items-center gap-2 py-2 text-left"
            style={{ borderTop: i ? `1px solid ${C.line}` : "none", background: me ? "#F2F7F3" : "transparent" }}>
            <span style={{ ...disp, fontWeight: 800, fontSize: 17, width: 30, color: rank <= 3 ? C.ink : C.faint }}>
              {medal(rank) || rank}
            </span>
            <span className="flex-1" style={{ fontSize: 14, fontWeight: me ? 700 : 500 }}>
              {e.name}
              <span style={{ fontSize: 12, color: C.faint, fontWeight: 400 }} className="ml-2">{fmtDate(e.when)}</span>
            </span>
            <span style={{ ...disp, fontWeight: 800, fontSize: 20 }}>{e.score}</span>
          </button>
        );
      })}
      {board.length > limit && (
        <div style={{ fontSize: 12, color: C.faint }} className="mt-2">Showing top {limit} of {board.length}.</div>
      )}
    </StatBlock>
  );
}

function Progression({ rounds }) {
  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {rounds.map((r, i) => (
        <span key={i} className="flex items-center">
          <span className="rounded-lg px-2 py-1" style={{ background: "#FAF8F2", border: `1px solid ${C.line}`, ...disp, fontWeight: 700, fontSize: 15 }}>
            F{r.flag} <span style={{ color: r.made === 3 ? C.fairway : r.made <= 1 ? C.red : C.ink }}>{r.made}/3</span>
            {typeof r.dur === "number" && <span style={{ color: C.faint, fontWeight: 400, fontSize: 12 }}> {fmtClock(r.dur)}</span>}
          </span>
          {i < rounds.length - 1 && <span className="px-1" style={{ color: C.faint }}>→</span>}
        </span>
      ))}
    </div>
  );
}

// ---------- app ----------
export default function App() {
  const [view, setView] = useState("home");
  const [tab, setTab] = useState("home"); // home | session | detail
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null); // {startedAt, flag, watch, rounds, order, anchor}
  const [pending, setPending] = useState([null, null, null]);
  const [pendingDir, setPendingDir] = useState({});
  const [throwFx, setThrowFx] = useState(null);
  const [gamePending, setGamePending] = useState([null, null, null]);
  const [gameDir, setGameDir] = useState({});
  const [playerName, setPlayerName] = useState("Me");
  const [updateReady, setUpdateReady] = useState(false);
  const [banner, setBanner] = useState(null);
  const [detailIdx, setDetailIdx] = useState(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [distances, setDistances] = useState({}); // {1: ft, ... 5: ft}
  const [games, setGames] = useState([]);
  const [game, setGame] = useState(null); // {startedAt, flag, shots}
  const [gameIdx, setGameIdx] = useState(null);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const committing = useRef(false);
  const missDirRef = useRef({});
  const gameCommitting = useRef(false);
  const gameDirRef = useRef({});
  const wakeLock = useRef(null);

  useEffect(() => {
    (async () => {
      const s = await loadKey("dg-sessions");
      const a = await loadKey("dg-active");
      const d = await loadKey("dg-flags");
      const g = await loadKey("dg-games");
      const ga = await loadKey("dg-game-active");
      const pn = await loadKey("dg-player");
      if (pn) setPlayerName(pn);
      const storeU = await loadKey("dg-store");
      if (storeU) { setLocalStore(storeU); setStoreUrl(storeU); }
      const ghCfg = await loadKey("dg-gh");
      if (ghCfg) { setGh(ghCfg); ghRef.current = ghCfg; }
      const ls = await loadKey("dg-lastsync");
      if (ls) setLastSync(ls);
      // ask the browser not to evict our data
      try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch { /* not supported */ }
      if (s) setSessions(s);
      if (a) setActive(a);
      if (d) setDistances(d);
      if (g) setGames(g);
      if (ga) setGame(ga);
      setLoaded(true);
    })();
  }, []);

  // a new build is live on the server; offer a one-tap reload
  useEffect(() => {
    const onReady = () => setUpdateReady(true);
    window.addEventListener("app-update-ready", onReady);
    return () => window.removeEventListener("app-update-ready", onReady);
  }, []);

  // keep the screen awake during a session (Android + iOS 16.4+)
  useEffect(() => {
    const acquire = async () => {
      try {
        if ((view === "session" || view === "game") && "wakeLock" in navigator && document.visibilityState === "visible") {
          wakeLock.current = await navigator.wakeLock.request("screen");
        }
      } catch { /* denied or unsupported; nothing to do */ }
    };
    const release = () => { try { wakeLock.current?.release(); } catch { } wakeLock.current = null; };
    if (view === "session" || view === "game") {
      acquire();
      document.addEventListener("visibilitychange", acquire);
      return () => { document.removeEventListener("visibilitychange", acquire); release(); };
    }
    release();
  }, [view]);

  const ft = f => (distances[f] ? `${distances[f]} ft` : null);

  const useStore = (url) => {
    const clean = (url || "").trim().replace(/\/+$/, "");
    if (!clean) { setSyncMsg("Paste a store URL first."); return; }
    const norm = normalizeStoreUrl(clean);
    setLocalStore(norm); setStoreUrl(norm); saveKey("dg-store", norm);
    setStoreForm("");
    setTimeout(() => syncNow(false), 200);
  };

  const makeStore = async () => {
    setCreating(true); setSyncMsg("Creating a store…");
    try {
      const url = await createStore();
      setLocalStore(url); setStoreUrl(url); saveKey("dg-store", url);
      setSyncMsg("Store created.");
      setTimeout(() => syncNow(true), 300);
    } catch (e) {
      setSyncMsg(e.message || "Couldn't create a store.");
    }
    setCreating(false);
  };

  const forgetStore = () => {
    setLocalStore(""); setStoreUrl(""); deleteKey("dg-store");
    setSyncMsg("Store disconnected on this device.");
    setTimeout(() => setSyncMsg(""), 4000);
  };

  const connectGh = async () => {
    const cfg = { owner: ghForm.owner.trim(), repo: ghForm.repo.trim(), token: ghForm.token.trim() };
    if (!cfg.owner || !cfg.repo || !cfg.token) { setSyncMsg("Fill in all three fields."); return; }
    setGh(cfg); ghRef.current = cfg; saveKey("dg-gh", cfg);
    setShowGh(false);
    setTimeout(() => syncNow(false), 200);
  };

  const disconnectGh = () => {
    setGh(null); ghRef.current = null; deleteKey("dg-gh");
    setGhForm({ owner: "", repo: "", token: "" });
    setSyncMsg("Disconnected. Data stays on this device.");
    setTimeout(() => setSyncMsg(""), 4000);
  };

  // Read/write probe against the configured store, reported in plain words.
  const testStore = async () => {
    setSyncing(true); setSyncMsg("Testing…");
    try {
      const before = await restPull();
      await restPush({ ...(before || {}), probe: Date.now() });
      const after = await restPull();
      if (!after || !after.probe) throw new Error("Wrote, but the value didn't come back. The store may be read-only.");
      await syncNow(true);
      setSyncMsg("Working — read and wrote successfully.");
    } catch (e) {
      setSyncMsg(e.message || "Couldn't reach the store.");
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(""), 8000);
  };

  const setDistance = (f, val) => {
    const n = parseInt(val, 10);
    const next = { ...distances, [f]: Number.isFinite(n) && n > 0 ? n : null };
    setDistances(next);
    saveKey("dg-flags", next);
  };

  const fileRef = useRef(null);
  const [storeUrl, setStoreUrl] = useState("");
  const [storeForm, setStoreForm] = useState("");
  const [creating, setCreating] = useState(false);
  const [gh, setGh] = useState(null);           // {owner, repo, token} — this device only
  const [ghForm, setGhForm] = useState({ owner: "", repo: "", token: "" });
  const [showGh, setShowGh] = useState(false);
  const ghRef = useRef(null);
  ghRef.current = gh;

  // always-current snapshot of local data for async callbacks
  const dataRef = useRef({ sessions: [], games: [], distances: {} });
  dataRef.current = { sessions, games, distances };

  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);

  // pull the shared data, merge with what's on this device, push the union back.
  // Local values come from a ref, never the closure: a sync fired moments after
  // saving a session would otherwise merge against the pre-save list and lose it.
  const syncNow = async (quiet = false) => {
    const kind = backendKind(ghRef.current);
    if (!kind || syncing) return;
    setSyncing(true);
    if (!quiet) setSyncMsg("Syncing…");
    try {
      let data = null, sha = null;
      if (kind === "github") { const r = await ghPull(ghRef.current); data = r.data; sha = r.sha; }
      else data = await restPull();
      const local = dataRef.current;
      let ns = local.sessions, ngm = local.games, nd = local.distances;
      if (data) {
        const remote = unpackAll(data);
        ns = mergeRecords(local.sessions, remote.sessions, x => x.rounds.length);
        ngm = mergeRecords(local.games, remote.games, x => (x.rounds || x.shots || []).length);
        nd = { ...remote.distances, ...local.distances };
        setSessions(ns); setGames(ngm); setDistances(nd);
        saveKey("dg-sessions", ns); saveKey("dg-games", ngm); saveKey("dg-flags", nd);
      }
      if (kind === "github") await ghPush(ghRef.current, packAll(ns, ngm, nd), sha);
      else await restPush(packAll(ns, ngm, nd));
      const now = Date.now();
      setLastSync(now); saveKey("dg-lastsync", now);
      setSyncMsg(`Synced — ${ns.length} sessions, ${ngm.length} runs.`);
    } catch (e) {
      setSyncMsg(e.message || "Sync failed — will retry next time.");
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(""), 6000);
  };

  const [backupMsg, setBackupMsg] = useState("");

  const exportData = () => {
    const dump = { app: "putting-yard", version: 1, exported: new Date().toISOString(), distances, sessions, games };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `putting-yard-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupMsg("Backup saved.");
    setTimeout(() => setBackupMsg(""), 4000);
  };

  const importData = async (file) => {
    try {
      const text = await file.text();
      const d = JSON.parse(text);
      if (!Array.isArray(d.sessions) && !Array.isArray(d.games)) throw new Error("not a backup file");
      const s = Array.isArray(d.sessions) ? d.sessions : [];
      const g = Array.isArray(d.games) ? d.games : [];
      // merge by start time so restoring twice doesn't duplicate
      const mergeBy = (a, b) => {
        const seen = new Map();
        [...a, ...b].forEach(x => seen.set(x.startedAt, x));
        return [...seen.values()].sort((x, y) => x.startedAt - y.startedAt);
      };
      const ns = mergeBy(sessions, s), ng = mergeBy(games, g);
      setSessions(ns); setGames(ng);
      saveKey("dg-sessions", ns); saveKey("dg-games", ng);
      if (d.distances) { setDistances(d.distances); saveKey("dg-flags", d.distances); }
      setBackupMsg(`Restored — ${ns.length} sessions, ${ng.length} games.`);
    } catch {
      setBackupMsg("That file didn't look like a backup. Nothing changed.");
    }
    setTimeout(() => setBackupMsg(""), 6000);
  };

  // pull from GitHub when the app opens, so a new phone or a wiped
  // browser picks the history back up on its own
  const pulledOnce = useRef(false);
  useEffect(() => {
    if (!loaded || !dbConfiguredWith(ghRef.current) || pulledOnce.current) return;
    pulledOnce.current = true;
    syncNow(true);
  }, [loaded, gh]);

  // last-chance save if the app is backgrounded or closed mid-round
  const liveRef = useRef({ active: null, pending: null, game: null });
  liveRef.current = { active, pending, game };
  useEffect(() => {
    const flush = () => {
      const { active: a, pending: p, game: g } = liveRef.current;
      if (a) saveKey("dg-active", { ...a, pending: p });
      if (g) saveKey("dg-game-active", g);
    };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, []);

  const startSession = () => {
    const now = Date.now();
    const a = { startedAt: now, flag: 1, watch: false, rounds: [], anchor: now, pending: null };
    setActive(a); setPending([null, null, null]);
    setBanner(null); setConfirmEnd(false); setView("session");
    saveKey("dg-active", a);
  };

  const resumeSession = () => {
    // restart the round clock so time away isn't charged to the next round
    let restored = [null, null, null];
    setActive(prev => {
      if (Array.isArray(prev.pending)) restored = prev.pending;
      const next = { ...prev, anchor: Date.now() };
      saveKey("dg-active", next);
      return next;
    });
    setPending(restored);
    const n = restored.filter(v => v !== null).length;
    setBanner(n ? `Picked up mid-round — ${n} of 3 logged` : null);
    setConfirmEnd(false); setView("session");
  };

  const answer = (i, made, dir = null) => {
    if (committing.current) return;
    const p = [...pending]; p[i] = made;
    const pd = { ...pendingDir };
    if (made) delete pd[i]; else pd[i] = dir;
    setPending(p); setPendingDir(pd); missDirRef.current = pd;
    const complete = p.every(v => v !== null);
    if (complete) {
      committing.current = true;
      setTimeout(() => commitRound(p), 350);
    } else {
      // save the partial round so leaving mid-round doesn't lose these taps
      setActive(prev => {
        const next = { ...prev, pending: p };
        saveKey("dg-active", next);
        return next;
      });
    }
  };

  const commitRound = (p) => {
    const dirs = { ...missDirRef.current };
    setActive(prev => {
      const now = Date.now();
      const made = p.filter(Boolean).length;
      const { nf, nw, msg } = applyRules(prev.flag, prev.watch, made);
      const dur = Math.max(0, (now - (prev.anchor || prev.startedAt)) / 1000);
      const round = {
        flag: prev.flag, putts: [...p], miss: dirs, made,
        prevFlag: prev.flag, prevWatch: prev.watch, dur, t: now,
      };
      const next = { ...prev, flag: nf, watch: nw, rounds: [...prev.rounds, round], anchor: now, pending: null };
      const pattern = nf > prev.flag ? [40, 60, 40, 60, 80] : nf < prev.flag ? [180] : made >= 2 ? [30] : [60, 50, 60];
      queueMicrotask(() => {
        saveKey("dg-active", next);
        setBanner(`${msg} · ${fmtClock(dur)}`);
        buzz(pattern);
        const order = roundOrder(prev);
        setThrowFx({
          id: now, flag: prev.flag, order: [...order],
          results: order.map(k => !!p[k]),
          dirs: order.map(k => dirs[k] || null),
        });
      });
      return next;
    });
    setPending([null, null, null]);
    setPendingDir({}); missDirRef.current = {};
    committing.current = false;
  };

  const undo = () => {
    if (!active || active.rounds.length === 0) return;
    const rounds = active.rounds.slice(0, -1);
    const last = active.rounds[active.rounds.length - 1];
    const next = { ...active, flag: last.prevFlag, watch: last.prevWatch, rounds, anchor: Date.now(), pending: null };
    setActive(next); setPending([null, null, null]);
    setBanner(`Undid round ${active.rounds.length}`);
    saveKey("dg-active", next);
  };

  const endSession = () => {
    if (active.rounds.length === 0) {
      setActive(null); deleteKey("dg-active"); setView("home"); return;
    }
    const done = { startedAt: active.startedAt, endedAt: Date.now(), rounds: active.rounds };
    const list = [...sessions, done];
    setSessions(list); setActive(null); setDetailIdx(list.length - 1);
    saveKey("dg-sessions", list); deleteKey("dg-active");
    if (dbConfiguredWith(ghRef.current)) setTimeout(() => syncNow(true), 400);
    setConfirmDelete(false);
    setView("detail");
  };

  const startGame = () => {
    const g = { startedAt: Date.now(), flag: 1, watch: false, rounds: [], name: playerName || "Me", pending: null };
    setGame(g); setGamePending([null, null, null]); setGameDir({});
    setBanner(null); setConfirmQuit(false); setView("game");
    saveKey("dg-game-active", g);
  };

  const resumeGame = () => {
    let restored = [null, null, null], restoredDir = {};
    setGame(prev => {
      if (Array.isArray(prev.pending)) restored = prev.pending;
      restoredDir = prev.pendingDir || {};
      return prev;
    });
    setGamePending(restored); setGameDir(restoredDir);
    setBanner(null); setConfirmQuit(false); setView("game");
  };

  const finishGame = (g) => {
    const done = {
      startedAt: g.startedAt, endedAt: Date.now(), name: g.name || "Me",
      rounds: g.rounds, score: gameScore(g),
    };
    const list = [...games, done];
    setGames(list); setGame(null); setGameIdx(list.length - 1);
    saveKey("dg-games", list); deleteKey("dg-game-active");
    if (dbConfiguredWith(ghRef.current)) setTimeout(() => syncNow(true), 400);
    setConfirmDelete(false);
    setView("gamedetail");
  };

  const gameAnswer = (i, made, dir = null) => {
    if (gameCommitting.current) return;
    const p = [...gamePending]; p[i] = made;
    const pd = { ...gameDir };
    if (made) delete pd[i]; else pd[i] = dir;
    setGamePending(p); setGameDir(pd); gameDirRef.current = pd;
    if (p.every(v => v !== null)) {
      gameCommitting.current = true;
      setTimeout(() => commitGameRound(p), 350);
    } else {
      setGame(prev => { const next = { ...prev, pending: p, pendingDir: pd }; saveKey("dg-game-active", next); return next; });
    }
  };

  const commitGameRound = (p) => {
    const dirs = { ...gameDirRef.current };
    setGame(prev => {
      const made = p.reduce((n, v) => n + (v ? 1 : 0), 0);
      const { nf, nw, msg } = applyRules(prev.flag, prev.watch, made);
      const pts = made * flagPts(prev.flag);
      const round = { flag: prev.flag, made, putts: [...p], miss: dirs, prevFlag: prev.flag, prevWatch: prev.watch };
      const next = { ...prev, flag: nf, watch: nw, rounds: [...prev.rounds, round], pending: null };
      queueMicrotask(() => {
        setBanner(`${made}/3 at flag ${prev.flag} — +${pts} pts · ${msg.replace(/^\d\/3 — /, "")}`);
        const fxId = Date.now();
        setThrowFx({ id: fxId, flag: prev.flag, results: p.map(v => !!v), dirs: [0, 1, 2].map(i => dirs[i] || null) });
        buzz(nf > prev.flag ? [40, 60, 40, 60, 80] : nf < prev.flag ? [180] : made >= 2 ? [30] : [60, 50, 60]);
        if (next.rounds.length >= GAME_ROUNDS) finishGame(next);
        else saveKey("dg-game-active", next);
      });
      return next;
    });
    setGamePending([null, null, null]);
    setGameDir({}); gameDirRef.current = {};
    gameCommitting.current = false;
  };

  const undoGameRound = () => {
    if (!game || game.rounds.length === 0) return;
    const last = game.rounds[game.rounds.length - 1];
    const next = { ...game, flag: last.prevFlag, watch: last.prevWatch, rounds: game.rounds.slice(0, -1), pending: null };
    setGame(next); setGamePending([null, null, null]); setGameDir({});
    setBanner(`Undid round ${game.rounds.length}`);
    saveKey("dg-game-active", next);
  };

  const quitGame = () => {
    setGame(null); deleteKey("dg-game-active"); setConfirmQuit(false); setView("home");
  };

  const deleteGame = (idx) => {
    const list = games.filter((_, i) => i !== idx);
    setGames(list);
    saveKey("dg-games", list);
    setConfirmDelete(false);
    setView("home");
  };

  const [editing, setEditing] = useState(false);

  const writeSessions = (list) => {
    setSessions(list);
    saveKey("dg-sessions", list);
    if (dbConfiguredWith(ghRef.current)) setTimeout(() => syncNow(true), 400);
  };

  const togglePutt = (sIdx, rIdx, puttIdx) => {
    const list = sessions.map((s, i) => {
      if (i !== sIdx) return s;
      const rounds = s.rounds.map((r, j) => {
        if (j !== rIdx) return r;
        const putts = puttsOf(r).map((hit, k) => (k === puttIdx ? !hit : hit));
        const dirs = missOf(r);
        const miss = {};
        dirs.forEach((d, k) => { if (d && !putts[k]) miss[k] = d; });
        return { ...r, putts, miss, results: undefined, order: undefined, made: putts.filter(Boolean).length };
      });
      return { ...s, rounds: replaySession(rounds) };
    });
    writeSessions(list);
  };

  const deleteRound = (sIdx, rIdx) => {
    const list = sessions.map((s, i) => {
      if (i !== sIdx) return s;
      const rounds = s.rounds.filter((_, j) => j !== rIdx);
      return { ...s, rounds: replaySession(rounds) };
    });
    // a session with no rounds left is just removed
    writeSessions(list.filter(s => s.rounds.length > 0));
    if (list[sIdx].rounds.length === 0) { setEditing(false); setView("home"); }
  };

  const deleteSession = (idx) => {
    const list = sessions.filter((_, i) => i !== idx);
    setSessions(list);
    saveKey("dg-sessions", list);
    setConfirmDelete(false);
    setView("home");
  };

  // ---------- screens ----------
  const shell = children => (
    <div style={{ ...body, background: C.paper, color: C.ink, minHeight: "100dvh", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
      {updateReady && view !== "session" && view !== "game" && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("app-apply-update"))}
          className="w-full px-4 py-3 text-left flex items-center justify-between"
          style={{ background: C.amber, color: "#fff", ...disp, fontWeight: 700, fontSize: 17 }}>
          <span>New version available</span>
          <span style={{ textDecoration: "underline" }}>Update</span>
        </button>
      )}
      {children}
    </div>
  );

  if (!loaded) return shell(<div className="p-6" style={{ color: C.faint }}>Loading…</div>);

  // ----- SESSION -----
  if (view === "session" && active) {
    const answered = pending.filter(v => v !== null).length;
    const streak = currentStreak(active.rounds);
    return shell(
      <div className="flex flex-col px-3 pt-3 pb-3" style={{ height: "100dvh" }}>
        {/* header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div style={{ ...disp, fontWeight: 800, fontSize: 22 }}>Round {active.rounds.length + 1}</div>
            {streak >= 2 && (
              <span className="rounded-full px-2.5 py-0.5" style={{ background: "#E4EFE7", color: C.fairway, ...disp, fontWeight: 700, fontSize: 14 }}>STREAK {streak}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {active.watch && (
              <span className="rounded-full px-3 py-1" style={{ background: C.amberSoft, color: C.amber, ...disp, fontWeight: 700, fontSize: 14, letterSpacing: "0.05em" }}>ON WATCH</span>
            )}
            {!confirmEnd ? (
              <button onClick={() => setConfirmEnd(true)} className="rounded-full px-4 py-2" style={{ border: `1.5px solid ${C.line}`, color: C.faint, fontSize: 14, fontWeight: 600 }}>End</button>
            ) : (
              <button onClick={endSession} className="rounded-full px-4 py-2" style={{ background: C.ink, color: "#fff", fontSize: 14, fontWeight: 600 }}>End session?</button>
            )}
          </div>
        </div>

        {/* flag rail + current flag */}
        <FlightPath flag={active.flag} watch={active.watch}
          highest={Math.max(active.flag, ...active.rounds.map(r => r.flag), 1)}
          throwFx={throwFx} distances={distances}
          onFlightDone={() => setThrowFx(null)} />
        <div className="text-center mt-1 mb-1">
          <span style={{ ...disp, fontWeight: 800, fontSize: 38, lineHeight: 1 }}>FLAG {active.flag}</span>
          {ft(active.flag) && <span style={{ ...disp, fontWeight: 700, fontSize: 20, color: C.faint }} className="ml-2">{ft(active.flag)}</span>}
        </div>

        {/* banner */}
        <div className="rounded-xl px-3 py-2 text-center mb-2" style={{ background: banner ? C.ink : "#EDEAE0", color: banner ? "#fff" : C.faint, ...disp, fontWeight: 700, fontSize: 17, minHeight: 38 }}>
          {banner || `Tap MADE, or an arrow for where it missed (${answered}/3)`}
        </div>

        {/* one row per putter, in throw order */}
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {[0, 1, 2].map(i => (
            <PuttRow
              key={i}
              label={`${i + 1}`}
              sub="putt"
              tint={null}
              value={pending[i] ?? null}
              dir={pendingDir[i]}
              onMade={() => answer(i, true)}
              onMiss={(d) => answer(i, false, d)}
            />
          ))}
        </div>


        {/* undo */}
        <button onClick={undo} disabled={active.rounds.length === 0} className="mt-2 rounded-2xl py-3 w-full"
          style={{ border: `2px solid ${C.line}`, color: active.rounds.length ? C.ink : C.line, ...disp, fontWeight: 700, fontSize: 19 }}>
          Undo last round
        </button>
      </div>
    );
  }

  // ----- 30-SHOT GAME -----
  if (view === "game" && game) {
    const score = gameScore(game);
    const roundNum = game.rounds.length + 1;
    const answered = gamePending.filter(v => v !== null).length;
    return shell(
      <div className="flex flex-col px-3 pt-3 pb-3" style={{ height: "100dvh" }}>
        {/* header */}
        <div className="flex items-center justify-between mb-1">
          <div style={{ ...disp, fontWeight: 800, fontSize: 22 }}>Round {roundNum}/{GAME_ROUNDS}</div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-3 py-1 flex items-center gap-1" style={{ background: C.ink, color: "#fff", ...disp, fontWeight: 800, fontSize: 17 }}>
              <Icon name="trophy" size={14} />{score} pts
            </span>
            {game.watch && (
              <span className="rounded-full px-2.5 py-1" style={{ background: C.amberSoft, color: C.amber, ...disp, fontWeight: 700, fontSize: 14 }}>WATCH</span>
            )}
            {!confirmQuit ? (
              <button onClick={() => setConfirmQuit(true)} className="rounded-full px-4 py-2" style={{ border: `1.5px solid ${C.line}`, color: C.faint, fontSize: 14, fontWeight: 600 }}>Quit</button>
            ) : (
              <button onClick={quitGame} className="rounded-full px-4 py-2" style={{ background: C.red, color: "#fff", fontSize: 14, fontWeight: 600 }}>Discard run?</button>
            )}
          </div>
        </div>

        {/* flag rail */}
        <FlightPath flag={game.flag} watch={game.watch}
          highest={Math.max(game.flag, ...game.rounds.map(r => r.flag), 1)}
          throwFx={throwFx} distances={distances}
          onFlightDone={() => setThrowFx(null)} />
        <div className="text-center mt-1 mb-1">
          <span style={{ ...disp, fontWeight: 800, fontSize: 34, lineHeight: 1 }}>FLAG {game.flag}</span>
          <span style={{ ...disp, fontWeight: 700, fontSize: 19, color: C.fairway }} className="ml-2">
            {flagPts(game.flag)} pt{flagPts(game.flag) > 1 ? "s" : ""} a make
          </span>
          {ft(game.flag) && <span style={{ ...disp, fontWeight: 700, fontSize: 17, color: C.faint }} className="ml-2">{ft(game.flag)}</span>}
        </div>

        {/* banner */}
        <div className="rounded-xl px-3 py-2 text-center mb-2" style={{ background: banner ? C.ink : "#EDEAE0", color: banner ? "#fff" : C.faint, ...disp, fontWeight: 700, fontSize: 17, minHeight: 38 }}>
          {banner || `Log all three putts (${answered}/3)`}
        </div>

        {/* three putts — no colors here, just the throws */}
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {[0, 1, 2].map(i => (
            <PuttRow
              key={i}
              label={`${i + 1}`}
              sub="putt"
              tint={null}
              value={gamePending[i] ?? null}
              dir={gameDir[i]}
              onMade={() => gameAnswer(i, true)}
              onMiss={(d) => gameAnswer(i, false, d)}
            />
          ))}
        </div>

        {/* undo */}
        <button onClick={undoGameRound} disabled={game.rounds.length === 0} className="mt-2 rounded-2xl py-3 w-full"
          style={{ border: `2px solid ${C.line}`, color: game.rounds.length ? C.ink : C.line, ...disp, fontWeight: 700, fontSize: 19 }}>
          Undo last round
        </button>
      </div>
    );
  }

  // ----- GAME DETAIL (scorecard + leaderboard) -----
  if (view === "gamedetail" && gameIdx !== null && games[gameIdx]) {
    const g = games[gameIdx];
    const t = gameFlagTable(g);
    const makes = gameMakes(g), attempts = gameAttempts(g);
    const board = leaderboard(games);
    const rank = rankOf(games, gameIdx);
    const isLadderRun = Array.isArray(g.rounds);
    return shell(
      <div className="px-4 pt-4 pb-8 max-w-md mx-auto">
        <button onClick={() => { setConfirmDelete(false); setEditing(false); setView("home"); }} className="mb-3" style={{ color: C.faint, fontSize: 15, fontWeight: 600 }}>← Back</button>
        <div className="flex items-center gap-2">
          <Icon name="trophy" size={24} style={{ color: C.fairway }} />
          <span style={{ ...disp, fontWeight: 800, fontSize: 32, lineHeight: 1.05 }}>Scored run</span>
        </div>
        <div style={{ fontSize: 13, color: C.faint }} className="mb-2">{g.name || "Me"} · {fmtDate(g.startedAt)}</div>

        {/* score + placement */}
        <div className="rounded-2xl p-4 mb-3 text-center" style={{ background: rank === 1 ? C.fairway : C.card, border: `1px solid ${rank === 1 ? C.fairway : C.line}`, color: rank === 1 ? "#fff" : C.ink }}>
          <div style={{ ...disp, fontWeight: 800, fontSize: 56, lineHeight: 1 }}>{gameScore(g)}</div>
          <div style={{ fontSize: 13, opacity: rank === 1 ? 0.9 : 0.7 }}>points out of {GAME_MAX} possible</div>
          <div style={{ ...disp, fontWeight: 700, fontSize: 19 }} className="mt-2">
            {medal(rank) ? `${medal(rank)} ` : ""}{rank === 1 ? "New high score" : `#${rank} of ${games.length}`}
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          <BigNum label="Makes" value={`${makes}/${attempts}`} />
          <BigNum label="Highest flag" value={Math.max(0, ...(g.rounds || []).map(r => r.flag), ...(g.shots || []).map(x => x.flag))} />
        </div>

        {isLadderRun && (
          <StatBlock title="Progression" icon="route">
            <Progression rounds={g.rounds} />
          </StatBlock>
        )}

        <StatBlock title="Points by flag" icon="target">
          <table className="w-full" style={{ fontSize: 14 }}>
            <thead>
              <tr style={{ color: C.faint, fontWeight: 500 }}>
                <th className="text-left pb-1">Flag</th>
                <th className="text-right pb-1">Makes</th>
                <th className="text-right pb-1">Points</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map(f => (
                <tr key={f} style={{ borderTop: `1px solid ${C.line}`, color: t[f].a ? C.ink : C.line }}>
                  <td className="py-1.5" style={{ ...disp, fontWeight: 700, fontSize: 16 }}>
                    {f}{distances[f] ? <span style={{ fontSize: 11, color: C.faint, fontWeight: 400 }}> · {distances[f]}ft</span> : ""}
                  </td>
                  <td className="py-1.5 text-right">{t[f].a ? `${t[f].m}/${t[f].a}` : "·"}</td>
                  <td className="py-1.5 text-right" style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{t[f].pts || "·"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StatBlock>

        <Leaderboard board={board} games={games} highlight={gameIdx} onPick={(i) => { setGameIdx(i); setConfirmDelete(false); }} />

        <button onClick={startGame} className="w-full rounded-2xl py-4 mt-1" style={{ background: C.ink, color: "#fff", ...disp, fontWeight: 800, fontSize: 22 }}>Play again</button>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full rounded-2xl py-3 mt-3" style={{ border: `2px solid ${C.line}`, color: C.faint, ...disp, fontWeight: 700, fontSize: 18 }}>Delete this run</button>
        ) : (
          <button onClick={() => deleteGame(gameIdx)} className="w-full rounded-2xl py-3 mt-3" style={{ background: C.red, color: "#fff", ...disp, fontWeight: 700, fontSize: 18 }}>Delete permanently?</button>
        )}
      </div>
    );
  }

  // ----- DETAIL (post mortem) -----
  if (view === "detail" && detailIdx !== null && sessions[detailIdx]) {
    const s = sessions[detailIdx];
    const totalSec = s.endedAt ? (s.endedAt - s.startedAt) / 1000 : null;
    return shell(
      <div className="px-4 pt-4 pb-8 max-w-md mx-auto">
        <button onClick={() => { setConfirmDelete(false); setEditing(false); setView("home"); }} className="mb-3" style={{ color: C.faint, fontSize: 15, fontWeight: 600 }}>← Back</button>
        <div className="flex items-center gap-2">
          <Icon name="clock" size={24} style={{ color: C.fairway }} />
          <span style={{ ...disp, fontWeight: 800, fontSize: 32, lineHeight: 1.05 }}>Session post mortem</span>
        </div>
        <div style={{ fontSize: 13, color: C.faint }} className="mb-2">
          {fmtDate(s.startedAt)}{totalSec != null ? ` · ${fmtDur(totalSec)}` : ""}
        </div>
        {(() => {
          if (sessions.length < 2) return <div className="mb-2" />;
          const pb = computePBs(sessions);
          const badges = [
            pb?.streak?.idx === detailIdx && "PB · longest streak",
            pb?.climb?.idx === detailIdx && "PB · fastest climb",
            pb?.acc?.idx === detailIdx && "PB · best accuracy",
            pb?.hold5?.idx === detailIdx && "PB · flag 5 rounds",
          ].filter(Boolean);
          return badges.length ? (
            <div className="flex flex-wrap gap-2 mb-3">
              {badges.map(b => (
                <span key={b} className="rounded-full px-3 py-1" style={{ background: C.amberSoft, color: C.amber, ...disp, fontWeight: 700, fontSize: 14 }}>{b}</span>
              ))}
            </div>
          ) : <div className="mb-2" />;
        })()}
        <StatBlock title="Progression" icon="route">
          <Progression rounds={s.rounds} />
          <button onClick={() => setEditing(e => !e)} className="w-full rounded-xl py-2 mt-3 flex items-center justify-center gap-1.5"
            style={{ border: `1.5px solid ${C.line}`, color: C.faint, ...disp, fontWeight: 700, fontSize: 15 }}>
            <Icon name="pencil" size={13} />{editing ? "Done editing" : "Edit rounds"}
          </button>
        </StatBlock>

        {editing && (
          <StatBlock title="Edit rounds" icon="pencil">
            <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }} className="mb-2">
              Tap a putt to flip it between made and missed. Flags and watch status are recalculated down the whole session.
            </div>
            {s.rounds.map((r, ri) => (
              <div key={ri} className="flex items-center gap-2 py-1.5" style={{ borderTop: ri ? `1px solid ${C.line}` : "none" }}>
                <span style={{ ...disp, fontWeight: 700, fontSize: 15, width: 46, color: C.faint }}>F{r.flag}</span>
                <div className="flex gap-1.5 flex-1">
                  {puttsOf(r).map((hit, pi) => {
                    const dirs = missOf(r);
                    return (
                      <button key={pi} onClick={() => togglePutt(detailIdx, ri, pi)}
                        className="flex-1 rounded-lg py-2"
                        style={{
                          background: hit ? C.fairway : "#FAF8F2",
                          color: hit ? "#fff" : C.faint,
                          border: `1.5px solid ${hit ? C.fairway : C.line}`,
                          ...disp, fontWeight: 700, fontSize: 14,
                        }}>
                        {hit ? "made" : (dirs[pi] ? DIR_LABEL[dirs[pi]] : "miss")}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => deleteRound(detailIdx, ri)} aria-label="Delete round"
                  style={{ color: C.faint, padding: "6px 4px" }}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            ))}
          </StatBlock>
        )}
        <StatsBody segments={[s.rounds]} distances={distances} />
        <button onClick={startSession} className="w-full rounded-2xl py-4 mt-1" style={{ background: C.fairway, color: "#fff", ...disp, fontWeight: 800, fontSize: 22 }}>Start new session</button>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full rounded-2xl py-3 mt-3" style={{ border: `2px solid ${C.line}`, color: C.faint, ...disp, fontWeight: 700, fontSize: 18 }}>Delete this session</button>
        ) : (
          <button onClick={() => deleteSession(detailIdx)} className="w-full rounded-2xl py-3 mt-3" style={{ background: C.red, color: "#fff", ...disp, fontWeight: 700, fontSize: 18 }}>Delete permanently?</button>
        )}
      </div>
    );
  }

  // ----- TABBED SHELL: Play / Stats / Board / Settings -----
  const allSessionRounds = sessions.map(x => x.rounds);
  const lastSession = sessions[sessions.length - 1];

  const page = (children) => shell(
    <div className="flex flex-col" style={{ minHeight: "100dvh" }}>
      <div className="flex-1 px-4 pt-5 pb-6 max-w-md mx-auto w-full">{children}</div>
      <TabBar tab={tab} setTab={setTab} />
    </div>
  );

  const header = (title, sub) => (
    <>
      <div className="flex items-center gap-2">
        <Icon name="basket" size={26} style={{ color: C.fairway }} />
        <span style={{ ...disp, fontWeight: 800, fontSize: 32, lineHeight: 1 }}>{title}</span>
      </div>
      {sub && <div style={{ fontSize: 13, color: C.faint }} className="mb-4">{sub}</div>}
    </>
  );

  // ---- PLAY ----
  if (tab === "home") {
    const streakNow = lastSession ? computeStats([lastSession.rounds]).bestStreak : 0;
    return page(
      <>
        {header("Putting yard", "5 flags · 3 putters · earn your distance")}

        {active ? (
          <button onClick={resumeSession} className="w-full rounded-2xl py-4 mb-3" style={{ background: C.amber, color: "#fff", ...disp, fontWeight: 800, fontSize: 22 }}>
            Resume session — round {active.rounds.length + 1}, flag {active.flag}
          </button>
        ) : (
          <button onClick={startSession} className="w-full rounded-2xl py-4 mb-3" style={{ background: C.fairway, color: "#fff", ...disp, fontWeight: 800, fontSize: 22 }}>
            Start session
          </button>
        )}

        {game ? (
          <button onClick={resumeGame} className="w-full rounded-2xl py-3 mb-3" style={{ background: C.card, color: C.ink, border: `2px solid ${C.ink}`, ...disp, fontWeight: 800, fontSize: 19 }}>
            Resume run — round {game.rounds.length + 1}/{GAME_ROUNDS} · flag {game.flag} · {gameScore(game)} pts
          </button>
        ) : (
          <button onClick={startGame} className="w-full rounded-2xl py-3 mb-3" style={{ background: C.card, color: C.ink, border: `2px solid ${C.ink}`, ...disp, fontWeight: 800, fontSize: 19 }}>
            Play scored run — 10 rounds
          </button>
        )}

        {/* at-a-glance, so the Play tab still says something useful */}
        {sessions.length > 0 && (() => {
          const st = computeStats(allSessionRounds);
          const last = computeStats([lastSession.rounds]);
          return (
            <>
              <div className="flex gap-2 mt-4 mb-3">
                <BigNum label="Sessions" value={sessions.length} />
                <BigNum label="Putts" value={st.total * 3} />
                <BigNum label="Best streak" value={st.bestStreak || "—"} />
              </div>
              <button onClick={() => { setDetailIdx(sessions.length - 1); setConfirmDelete(false); setView("detail"); }}
                className="w-full rounded-2xl p-3 flex items-center justify-between text-left"
                style={{ background: C.card, border: `1px solid ${C.line}` }}>
                <div>
                  <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>Last session</div>
                  <div style={{ fontSize: 13, color: C.faint }}>
                    {fmtDate(lastSession.startedAt)} · {last.total} rounds · high flag {last.highest}
                  </div>
                </div>
                <span style={{ color: C.faint }}>›</span>
              </button>
            </>
          );
        })()}

        {sessions.length === 0 && !active && (
          <div className="rounded-2xl p-4 mt-2" style={{ background: C.card, border: `1px solid ${C.line}`, fontSize: 14, color: C.faint, lineHeight: 1.5 }}>
            Nothing logged yet. Start a session, tap three putts a round, and your stats build themselves.
          </div>
        )}
      </>
    );
  }

  // ---- STATS ----
  if (tab === "stats") {
    if (!sessions.length) return page(
      <>
        {header("Stats", "practice history")}
        <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.line}`, fontSize: 14, color: C.faint }}>
          Log a session and this fills in.
        </div>
      </>
    );
    return page(
      <>
        {header("Stats", `${sessions.length} session${sessions.length > 1 ? "s" : ""} · ${computeStats(allSessionRounds).total} rounds`)}
        <TrendBlock sessions={sessions} />
        <PersonalBests sessions={sessions} />
        <MissReport sessions={sessions} distances={distances} />
        <RhythmReport sessions={sessions} />
        <CeilingReport sessions={sessions} />
        <StatsBody segments={allSessionRounds} distances={distances} />

        <div style={{ ...disp, fontWeight: 700, fontSize: 16, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }} className="mt-5 mb-2">Sessions</div>
        {sessions.map((sn, i) => {
          const st = computeStats([sn.rounds]);
          const madeAll = sn.rounds.reduce((n, r) => n + r.made, 0);
          const durTxt = sn.endedAt ? fmtDur((sn.endedAt - sn.startedAt) / 1000) : null;
          return (
            <button key={sn.startedAt} onClick={() => { setDetailIdx(i); setConfirmDelete(false); setView("detail"); }}
              className="w-full rounded-2xl p-3 mb-2 flex items-center justify-between text-left"
              style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{fmtDate(sn.startedAt)}{durTxt ? ` · ${durTxt}` : ""}</div>
                <div style={{ fontSize: 13, color: C.faint }}>{st.total} rounds · {madeAll}/{st.total * 3} putts · high flag {st.highest}</div>
              </div>
              <span style={{ color: C.faint }}>›</span>
            </button>
          );
        }).reverse()}
      </>
    );
  }

  // ---- BOARD ----
  if (tab === "board") {
    return page(
      <>
        {header("Board", games.length ? `${games.length} scored run${games.length > 1 ? "s" : ""}` : "scored runs")}
        {games.length === 0 ? (
          <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.line}`, fontSize: 14, color: C.faint, lineHeight: 1.5 }}>
            No runs yet. A scored run is ten ladder rounds where every make scores the flag number — 120 is perfect.
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <BigNum label="Best" value={Math.max(...games.map(g => gameScore(g)))} />
              <BigNum label="Average" value={Math.round(games.reduce((n, g) => n + gameScore(g), 0) / games.length)} />
              <BigNum label="Runs" value={games.length} />
            </div>
            <Leaderboard board={leaderboard(games)} games={games} limit={20}
              onPick={(i) => { setGameIdx(i); setConfirmDelete(false); setView("gamedetail"); }} />
          </>
        )}
        {!game && (
          <button onClick={startGame} className="w-full rounded-2xl py-3 mt-1" style={{ background: C.ink, color: "#fff", ...disp, fontWeight: 800, fontSize: 19 }}>
            Play a scored run
          </button>
        )}
      </>
    );
  }

  // ---- SETTINGS ----
  return page(
    <>
      {header("Settings", "set once, forget it")}
      <div className="rounded-2xl p-4 mt-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-1.5 mb-2" style={{ color: C.faint }}>
          <Icon name="person" size={14} />
          <span style={{ ...disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase" }}>Leaderboard name</span>
        </div>
        <input
          value={playerName}
          onChange={e => { setPlayerName(e.target.value); saveKey("dg-player", e.target.value); }}
          placeholder="Me" maxLength={16}
          className="w-full rounded-xl px-3 py-2"
          style={{ border: `1.5px solid ${C.line}`, background: "#FAF8F2", fontSize: 15 }} />
        <div style={{ fontSize: 12, color: C.faint }} className="mt-2">
          Scored runs are filed under this name. Change it before handing the phone to someone else and you'll both show up on the board.
        </div>
      </div>
      <div className="rounded-2xl p-4 mt-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-1.5 mb-2" style={{ color: C.faint }}>
          <Icon name="ruler" size={14} />
          <span style={{ ...disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase" }}>Flag distances (ft)</span>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(f => (
            <div key={f} className="flex-1 text-center">
              <div style={{ ...disp, fontWeight: 700, fontSize: 15, color: C.faint }} className="mb-1">{f}</div>
              <input
                type="number" inputMode="numeric" placeholder="—"
                value={distances[f] ?? ""}
                onChange={e => setDistance(f, e.target.value)}
                className="w-full rounded-xl text-center py-2"
                style={{ border: `1.5px solid ${C.line}`, background: "#FAF8F2", ...disp, fontWeight: 700, fontSize: 18, color: C.ink }}
              />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: C.faint }} className="mt-2">Set once — distances show on the session screen and in your flag stats.</div>
      </div>
      {(() => {
        const kind = backendKind(gh);
        const fromConfig = !!cfgUrl();
        const label = fromConfig ? "· from config.js"
          : kind === "github" ? "· this device"
          : kind === "rest" ? "· this device"
          : "· off";
        return (
          <div className="rounded-2xl p-4 mt-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5" style={{ color: C.faint }}>
                <Icon name="cloud" size={14} />
                <span style={{ ...disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  Shared data {label}
                </span>
              </div>
              {kind && (
                <button onClick={() => syncNow(false)} disabled={syncing} className="rounded-full px-3 py-1"
                  style={{ border: `1.5px solid ${C.line}`, color: syncing ? C.line : C.ink, fontSize: 13, fontWeight: 600 }}>
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              )}
            </div>

            {kind ? (
              <>
                <div style={{ fontSize: 12, color: syncMsg && !/^Sync/.test(syncMsg) ? C.amber : C.faint, lineHeight: 1.5 }}>
                  {syncMsg || (lastSync
                    ? `Last synced ${fmtDate(lastSync)}. ${kind === "github" ? "Saving to " + gh.owner + "/" + gh.repo + "." : "Every device that loads this site shares this data."}`
                    : "Connected. Syncs when a session or run finishes.")}
                </div>

                {fromConfig && (
                  <div className="rounded-xl px-3 py-2 mt-2" style={{ background: "#FAF8F2", border: `1px dashed ${C.line}` }}>
                    <div style={{ fontSize: 11, color: C.faint }}>
                      Address set in config.js — nothing to configure on any phone. Open this in a browser to see your raw data:
                    </div>
                    <div style={{ fontSize: 11, wordBreak: "break-all" }} className="mt-1">{cfgUrl()}</div>
                    <button onClick={testStore} disabled={syncing}
                      className="rounded-lg px-3 py-1 mt-2" style={{ border: `1.5px solid ${C.line}`, fontSize: 12, fontWeight: 600 }}>
                      {syncing ? "Testing…" : "Test connection"}
                    </button>
                  </div>
                )}
                {kind === "rest" && !cfgUrl() && (
                  <>
                    <div className="rounded-xl px-3 py-2 mt-2" style={{ background: "#FAF8F2", border: `1px dashed ${C.line}` }}>
                      <div style={{ fontSize: 11, color: C.faint }}>Store address — put this in config.js so every device joins automatically:</div>
                      <div style={{ fontSize: 11, wordBreak: "break-all" }} className="mt-1">{storeUrl}</div>
                      <button onClick={() => { navigator.clipboard?.writeText(storeUrl); setSyncMsg("Address copied."); setTimeout(() => setSyncMsg(""), 3000); }}
                        className="rounded-lg px-3 py-1 mt-2" style={{ border: `1.5px solid ${C.line}`, fontSize: 12, fontWeight: 600 }}>
                        Copy address
                      </button>
                    </div>
                    <button onClick={forgetStore} className="w-full rounded-xl py-2 mt-2"
                      style={{ border: `1.5px solid ${C.line}`, color: C.faint, ...disp, fontWeight: 700, fontSize: 15 }}>
                      Disconnect this device
                    </button>
                  </>
                )}
                {kind === "github" && (
                  <button onClick={disconnectGh} className="w-full rounded-xl py-2 mt-3"
                    style={{ border: `1.5px solid ${C.line}`, color: C.faint, ...disp, fontWeight: 700, fontSize: 15 }}>
                    Disconnect this device
                  </button>
                )}
              </>
            ) : !showGh ? (
              <>
                <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.5 }}>
                  Off — history lives on this device only. Create a shared store and every device that has its
                  address keeps the same history, with no accounts anywhere.
                </div>
                <button onClick={makeStore} disabled={creating} className="w-full rounded-xl py-3 mt-3"
                  style={{ background: C.fairway, color: "#fff", ...disp, fontWeight: 800, fontSize: 17 }}>
                  {creating ? "Creating…" : "Create a shared store"}
                </button>
                <div className="flex gap-2 mt-2">
                  <input value={storeForm} onChange={e => setStoreForm(e.target.value)}
                    placeholder="…or paste an existing store URL" autoCapitalize="none" autoCorrect="off"
                    className="flex-1 rounded-xl px-3 py-2" style={{ border: `1.5px solid ${C.line}`, background: "#FAF8F2", fontSize: 14 }} />
                  <button onClick={() => useStore(storeForm)} className="rounded-xl px-4"
                    style={{ border: `2px solid ${C.line}`, ...disp, fontWeight: 700, fontSize: 15 }}>Join</button>
                </div>
                {syncMsg && <div style={{ fontSize: 12, color: C.amber }} className="mt-2">{syncMsg}</div>}
                <button onClick={() => setShowGh(true)} className="w-full rounded-xl py-2 mt-2"
                  style={{ color: C.faint, ...disp, fontWeight: 700, fontSize: 14 }}>
                  Or use GitHub instead
                </button>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <input value={ghForm.owner} onChange={e => setGhForm({ ...ghForm, owner: e.target.value })}
                    placeholder="GitHub username" autoCapitalize="none" autoCorrect="off"
                    className="w-full rounded-xl px-3 py-2" style={{ border: `1.5px solid ${C.line}`, background: "#FAF8F2", fontSize: 15 }} />
                  <input value={ghForm.repo} onChange={e => setGhForm({ ...ghForm, repo: e.target.value })}
                    placeholder="Repo name (e.g. putting-data)" autoCapitalize="none" autoCorrect="off"
                    className="w-full rounded-xl px-3 py-2" style={{ border: `1.5px solid ${C.line}`, background: "#FAF8F2", fontSize: 15 }} />
                  <input value={ghForm.token} onChange={e => setGhForm({ ...ghForm, token: e.target.value })}
                    placeholder="Token (github_pat_…)" type="password" autoCapitalize="none" autoCorrect="off"
                    className="w-full rounded-xl px-3 py-2" style={{ border: `1.5px solid ${C.line}`, background: "#FAF8F2", fontSize: 15 }} />
                </div>
                <button onClick={connectGh} disabled={syncing} className="w-full rounded-xl py-3 mt-2"
                  style={{ background: C.fairway, color: "#fff", ...disp, fontWeight: 700, fontSize: 17 }}>
                  {syncing ? "Connecting…" : "Connect and sync"}
                </button>
                {syncMsg && <div style={{ fontSize: 12, color: C.amber }} className="mt-2">{syncMsg}</div>}
                <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }} className="mt-2">
                  Entered once on this device and remembered. The token stays here — it is never written into the repo.
                </div>
                <button onClick={() => setShowGh(false)} className="w-full rounded-xl py-2 mt-2"
                  style={{ color: C.faint, ...disp, fontWeight: 700, fontSize: 14 }}>Cancel</button>
              </>
            )}
          </div>
        );
      })()}

      <div className="rounded-2xl p-4 mt-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex items-center gap-1.5 mb-2" style={{ color: C.faint }}>
          <Icon name="save" size={14} />
          <span style={{ ...disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase" }}>Backup</span>
        </div>
        <div className="flex gap-2">
          <button onClick={exportData} className="flex-1 rounded-xl py-3"
            style={{ border: `2px solid ${C.line}`, color: C.ink, ...disp, fontWeight: 700, fontSize: 16 }}>
            Save backup file
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex-1 rounded-xl py-3"
            style={{ border: `2px solid ${C.line}`, color: C.ink, ...disp, fontWeight: 700, fontSize: 16 }}>
            Restore backup
          </button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
          onChange={e => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ""; }} />
        <div style={{ fontSize: 12, color: C.faint }} className="mt-2">
          {backupMsg || (backendKind(gh)
            ? "Synced to your shared database. A backup file is still worth keeping now and then."
            : "Your data lives on this device only. Save a backup file now and then, or to move to a new phone.")}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-4">
        <Icon name="disc" size={13} style={{ color: C.line }} />
        <span style={{ fontSize: 12, color: C.faint }}>{BUILD}</span>
      </div>
    </>
  );
}

// Exported for the test harness; unused by the app itself.
export {
  applyRules, replaySession, computeStats, missAnalysis, currentStreak, puttsOf, missOf,
  packSession, unpackSession, packGame, unpackGame, packAll, unpackAll,
  gameScore, gameMakes, gameFlagTable, leaderboard, ceilingAnalysis,
  pressureSplit, timeOfDay, fatigueCurve, paceEffect, mergeRecords,
};
