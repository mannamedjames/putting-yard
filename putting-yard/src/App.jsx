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
const DISC = {
  orange: { label: "ORA", color: C.orange },
  red: { label: "RED", color: C.red },
  green: { label: "GRN", color: C.green },
};
const DEFAULT_ORDER = ["orange", "red", "green"];
// Bump this every release. It's shown at the bottom of the home screen so you
// can tell at a glance whether your phone picked up a new deploy.
const BUILD = "v5 · icons + scored runs";
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
  const perFlag = {}, perColor = {}, grid = {}, perPos = [{ m: 0, a: 0 }, { m: 0, a: 0 }, { m: 0, a: 0 }];
  for (let f = 1; f <= 5; f++) { perFlag[f] = { m: 0, a: 0 }; grid[f] = {}; DEFAULT_ORDER.forEach(k => grid[f][k] = { m: 0, a: 0 }); }
  DEFAULT_ORDER.forEach(k => perColor[k] = { m: 0, a: 0 });
  let highest = 0;

  rounds.forEach(r => {
    highest = Math.max(highest, r.flag);
    roundOrder(r).forEach((k, i) => {
      const hit = r.results[k] ? 1 : 0;
      perFlag[r.flag].m += hit; perFlag[r.flag].a += 1;
      perColor[k].m += hit; perColor[k].a += 1;
      grid[r.flag][k].m += hit; grid[r.flag][k].a += 1;
      perPos[i].m += hit; perPos[i].a += 1;
    });
  });

  // best make-streak (putt level, within a session)
  let bestStreak = 0;
  segments.forEach(seg => {
    let run = 0;
    seg.forEach(r => roundOrder(r).forEach(k => {
      run = r.results[k] ? run + 1 : 0;
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
  rounds.forEach(r => { if (r.prevWatch) (r.made >= 2 ? watchSaved++ : watchLost++); });

  // warm-up effect: first 3 rounds of each session vs the rest
  const early = { m: 0, a: 0 }, late = { m: 0, a: 0 };
  segments.forEach(seg => seg.forEach((r, i) => roundOrder(r).forEach(k => {
    const b = i < 3 ? early : late;
    b.m += r.results[k] ? 1 : 0; b.a += 1;
  })));

  // pace
  const durs = rounds.map(r => r.dur).filter(d => typeof d === "number");
  const avgDur = durs.length ? durs.reduce((a, b) => a + b, 0) / durs.length : null;
  const totalDur = durs.length ? durs.reduce((a, b) => a + b, 0) : null;

  return { perFlag, perColor, grid, perPos, highest, total: rounds.length, bestStreak, adv, watchSaved, watchLost, avgDur, totalDur, early, late };
}

function currentStreak(rounds) {
  let run = 0;
  rounds.forEach(r => roundOrder(r).forEach(k => { run = r.results[k] ? run + 1 : 0; }));
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
  segments.forEach(seg => seg.forEach(r => roundOrder(r).forEach(k => { m += r.results[k] ? 1 : 0; a += 1; })));
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
    s.rounds.forEach(r => roundOrder(r).forEach(k => {
      const hit = !!r.results[k];
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
const ORDERS = [
  ["orange", "red", "green"], ["orange", "green", "red"],
  ["red", "orange", "green"], ["red", "green", "orange"],
  ["green", "orange", "red"], ["green", "red", "orange"],
];
const orderIndex = (o) => {
  const i = ORDERS.findIndex(x => x[0] === o[0] && x[1] === o[1] && x[2] === o[2]);
  return i < 0 ? 0 : i;
};

function packSession(s) {
  return {
    s: s.startedAt,
    e: s.endedAt || null,
    r: s.rounds.map(r => {
      const o = roundOrder(r);
      const bits = o.reduce((n, k, i) => n | (r.results[k] ? 1 << i : 0), 0);
      return [r.flag, bits, Math.round(r.dur || 0), orderIndex(o), r.prevWatch ? 1 : 0];
    }),
  };
}
function unpackSession(p) {
  return {
    startedAt: p.s,
    endedAt: p.e || undefined,
    rounds: (p.r || []).map(([flag, bits, dur, oi, pw]) => {
      const order = ORDERS[oi] || DEFAULT_ORDER;
      const results = {};
      order.forEach((k, i) => { results[k] = !!(bits & (1 << i)); });
      const made = order.reduce((n, k) => n + (results[k] ? 1 : 0), 0);
      return { flag, results, made, order, dur, prevFlag: flag, prevWatch: !!pw };
    }),
  };
}
function packGame(g) {
  const base = { s: g.startedAt, e: g.endedAt || null, c: gameScore(g), n: g.name || "Me" };
  return Array.isArray(g.rounds)
    ? { ...base, r: g.rounds.map(x => [x.flag, x.made, x.prevWatch ? 1 : 0]) }   // ladder run
    : { ...base, h: (g.shots || []).map(x => [x.flag, x.made ? 1 : 0]) };        // legacy free-shot run
}
function unpackGame(p) {
  const base = { startedAt: p.s, endedAt: p.e || undefined, name: p.n || "Me" };
  if (p.r) {
    const rounds = p.r.map(([flag, made, pw]) => ({ flag, made, prevFlag: flag, prevWatch: !!pw }));
    return { ...base, rounds, score: p.c ?? gameScore({ rounds }) };
  }
  const shots = (p.h || []).map(([flag, made]) => ({ flag, made: !!made }));
  return { ...base, shots, score: p.c ?? gameScore({ shots }) };
}
const packAll = (sessions, games, distances) => ({
  v: 1, t: Date.now(), d: distances,
  s: sessions.map(packSession), g: games.map(packGame),
});
const unpackAll = (p) => ({
  sessions: (p.s || []).map(unpackSession),
  games: (p.g || []).map(unpackGame),
  distances: p.d || {},
});

// merge two lists of records by start time; newer/longer wins on collisions
function mergeRecords(a, b, sizeOf) {
  const by = new Map();
  [...a, ...b].forEach(x => {
    const prev = by.get(x.startedAt);
    if (!prev || sizeOf(x) > sizeOf(prev)) by.set(x.startedAt, x);
  });
  return [...by.values()].sort((x, y) => x.startedAt - y.startedAt);
};

// ---------- GitHub sync ----------
// Commits a single JSON file to a repo you own using a fine-grained token.
const b64encode = (str) => btoa(unescape(encodeURIComponent(str)));
const b64decode = (str) => decodeURIComponent(escape(atob(str.replace(/\s/g, ""))));

async function ghRequest(cfg, method, extra) {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.path}`;
  const res = await fetch(method === "GET" ? `${url}?ref=${encodeURIComponent(cfg.branch || "main")}&t=${Date.now()}` : url, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(method === "PUT" ? { "Content-Type": "application/json" } : {}),
    },
    ...(extra ? { body: JSON.stringify(extra) } : {}),
  });
  return res;
}

async function ghPull(cfg) {
  const res = await ghRequest(cfg, "GET");
  if (res.status === 404) return { data: null, sha: null };       // nothing saved yet
  if (res.status === 401) throw new Error("Token rejected — check it hasn't expired.");
  if (res.status === 403) throw new Error("Token lacks Contents write access to this repo.");
  if (!res.ok) throw new Error(`GitHub said ${res.status}.`);
  const j = await res.json();
  return { data: JSON.parse(b64decode(j.content)), sha: j.sha };
}

async function ghPush(cfg, payload, sha) {
  const res = await ghRequest(cfg, "PUT", {
    message: `putting yard sync ${new Date().toISOString()}`,
    content: b64encode(JSON.stringify(payload)),
    branch: cfg.branch || "main",
    ...(sha ? { sha } : {}),
  });
  if (res.status === 409) throw new Error("Someone else synced first — try again.");
  if (!res.ok) throw new Error(`Push failed (${res.status}).`);
  return res.json();
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
    person: <><circle cx="12" cy="8" r="3.4" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    spark: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /><circle cx="12" cy="12" r="3" /></>,
  };
  return <svg {...common} aria-hidden="true">{paths[name] || paths.disc}</svg>;
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

      <StatBlock title="By disc" icon="disc">
        <div className="flex gap-2">
          {DEFAULT_ORDER.map(k => (
            <div key={k} className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
              <div className="mx-auto mb-1 rounded-full" style={{ width: 14, height: 14, background: DISC[k].color }} />
              <div style={{ ...disp, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{pct(s.perColor[k])}</div>
              <div style={{ fontSize: 11, color: C.faint }}>{frac(s.perColor[k])}</div>
            </div>
          ))}
        </div>
      </StatBlock>

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

      <StatBlock title="Disc × flag" icon="grid">
        <table className="w-full" style={{ fontSize: 13 }}>
          <thead>
            <tr>
              <th className="text-left pb-1" style={{ color: C.faint, fontWeight: 500 }}>Flag</th>
              {DEFAULT_ORDER.map(k => (
                <th key={k} className="pb-1">
                  <div className="mx-auto rounded-full" style={{ width: 12, height: 12, background: DISC[k].color }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(f => (
              <tr key={f} style={{ borderTop: `1px solid ${C.line}` }}>
                <td className="py-1.5" style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{f}</td>
                {DEFAULT_ORDER.map(k => (
                  <td key={k} className="py-1.5 text-center" style={{ color: s.grid[f][k].a ? C.ink : C.line }}>{frac(s.grid[f][k])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
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
  const [view, setView] = useState("home"); // home | session | detail
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null); // {startedAt, flag, watch, rounds, order, anchor}
  const [pending, setPending] = useState({ orange: null, red: null, green: null });
  const [gamePending, setGamePending] = useState({ orange: null, red: null, green: null });
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
  const gameCommitting = useRef(false);
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
      const cfg = await loadKey("dg-gh");
      const ls = await loadKey("dg-lastsync");
      if (cfg) setGh(cfg);
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

  const setDistance = (f, val) => {
    const n = parseInt(val, 10);
    const next = { ...distances, [f]: Number.isFinite(n) && n > 0 ? n : null };
    setDistances(next);
    saveKey("dg-flags", next);
  };

  const fileRef = useRef(null);
  const [gh, setGh] = useState(null);            // {owner, repo, token, path, branch}
  const [ghForm, setGhForm] = useState({ owner: "", repo: "", token: "" });
  const [syncMsg, setSyncMsg] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [showSync, setShowSync] = useState(false);

  const saveGh = (cfg) => { setGh(cfg); saveKey("dg-gh", cfg); };

  // pull remote, merge with local, push the union back
  const syncNow = async (cfg = gh, quiet = false) => {
    if (!cfg || syncing) return;
    setSyncing(true);
    if (!quiet) setSyncMsg("Syncing…");
    try {
      const { data, sha } = await ghPull(cfg);
      let ns = sessions, ngm = games, nd = distances;
      if (data) {
        const remote = unpackAll(data);
        ns = mergeRecords(sessions, remote.sessions, x => x.rounds.length);
        ngm = mergeRecords(games, remote.games, x => (x.rounds || x.shots || []).length);
        nd = { ...remote.distances, ...distances };
        setSessions(ns); setGames(ngm); setDistances(nd);
        saveKey("dg-sessions", ns); saveKey("dg-games", ngm); saveKey("dg-flags", nd);
      }
      await ghPush(cfg, packAll(ns, ngm, nd), sha);
      const now = Date.now();
      setLastSync(now); saveKey("dg-lastsync", now);
      setSyncMsg(`Synced — ${ns.length} sessions, ${ngm.length} games.`);
    } catch (e) {
      setSyncMsg(e.message || "Sync failed.");
    }
    setSyncing(false);
    setTimeout(() => setSyncMsg(""), 6000);
  };

  const connectGh = async () => {
    const cfg = {
      owner: ghForm.owner.trim(), repo: ghForm.repo.trim(),
      token: ghForm.token.trim(), path: "putting-data.json", branch: "main",
    };
    if (!cfg.owner || !cfg.repo || !cfg.token) { setSyncMsg("Fill in all three fields."); return; }
    saveGh(cfg);
    setGhForm({ ...ghForm, token: "" });
    await syncNow(cfg);
  };

  const disconnectGh = () => {
    setGh(null); deleteKey("dg-gh"); setSyncMsg("Disconnected. Data stays on this device.");
    setTimeout(() => setSyncMsg(""), 5000);
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
    if (!loaded || !gh || pulledOnce.current) return;
    pulledOnce.current = true;
    syncNow(gh, true);
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

  const lastUsedOrder = () => {
    const last = sessions[sessions.length - 1];
    const lastRound = last?.rounds?.[last.rounds.length - 1];
    return lastRound ? roundOrder(lastRound) : DEFAULT_ORDER;
  };

  const startSession = () => {
    const now = Date.now();
    const a = { startedAt: now, flag: 1, watch: false, rounds: [], order: lastUsedOrder(), anchor: now, pending: null };
    setActive(a); setPending({ orange: null, red: null, green: null });
    setBanner(null); setConfirmEnd(false); setView("session");
    saveKey("dg-active", a);
  };

  const resumeSession = () => {
    // restart the round clock so time away isn't charged to the next round
    let restored = { orange: null, red: null, green: null };
    setActive(prev => {
      restored = prev.pending || restored;
      const next = { ...prev, order: prev.order || DEFAULT_ORDER, anchor: Date.now() };
      saveKey("dg-active", next);
      return next;
    });
    setPending(restored);
    const n = DEFAULT_ORDER.filter(k => restored[k] !== null).length;
    setBanner(n ? `Picked up mid-round — ${n} of 3 logged` : null);
    setConfirmEnd(false); setView("session");
  };

  const throwFirst = (key) => {
    if (committing.current) return;
    setActive(prev => {
      if (roundOrder(prev)[0] === key) return prev;
      const order = [key, ...(prev.order || DEFAULT_ORDER).filter(k => k !== key)];
      const next = { ...prev, order };
      saveKey("dg-active", next);
      return next;
    });
  };

  const answer = (key, made) => {
    if (committing.current) return;
    const p = { ...pending, [key]: made };
    setPending(p);
    const complete = DEFAULT_ORDER.every(k => p[k] !== null);
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
    setActive(prev => {
      const now = Date.now();
      const made = DEFAULT_ORDER.reduce((n, k) => n + (p[k] ? 1 : 0), 0);
      const { nf, nw, msg } = applyRules(prev.flag, prev.watch, made);
      const dur = Math.max(0, (now - (prev.anchor || prev.startedAt)) / 1000);
      const round = {
        flag: prev.flag, results: { ...p }, made,
        prevFlag: prev.flag, prevWatch: prev.watch,
        order: [...(prev.order || DEFAULT_ORDER)], dur, t: now,
      };
      const next = { ...prev, flag: nf, watch: nw, rounds: [...prev.rounds, round], anchor: now, pending: null };
      const pattern = nf > prev.flag ? [40, 60, 40, 60, 80] : nf < prev.flag ? [180] : made >= 2 ? [30] : [60, 50, 60];
      queueMicrotask(() => { saveKey("dg-active", next); setBanner(`${msg} · ${fmtClock(dur)}`); buzz(pattern); });
      return next;
    });
    setPending({ orange: null, red: null, green: null });
    committing.current = false;
  };

  const undo = () => {
    if (!active || active.rounds.length === 0) return;
    const rounds = active.rounds.slice(0, -1);
    const last = active.rounds[active.rounds.length - 1];
    const next = { ...active, flag: last.prevFlag, watch: last.prevWatch, rounds, order: roundOrder(last), anchor: Date.now(), pending: null };
    setActive(next); setPending({ orange: null, red: null, green: null });
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
    if (gh) setTimeout(() => syncNow(gh, true), 400);
    setConfirmDelete(false);
    setView("detail");
  };

  const startGame = () => {
    const g = { startedAt: Date.now(), flag: 1, watch: false, rounds: [], name: playerName || "Me", pending: null };
    setGame(g); setGamePending({ orange: null, red: null, green: null });
    setBanner(null); setConfirmQuit(false); setView("game");
    saveKey("dg-game-active", g);
  };

  const resumeGame = () => {
    let restored = { orange: null, red: null, green: null };
    setGame(prev => {
      restored = prev.pending || restored;
      return prev;
    });
    setGamePending(restored);
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
    if (gh) setTimeout(() => syncNow(gh, true), 400);
    setConfirmDelete(false);
    setView("gamedetail");
  };

  const gameAnswer = (key, made) => {
    if (gameCommitting.current) return;
    const p = { ...gamePending, [key]: made };
    setGamePending(p);
    if (DEFAULT_ORDER.every(k => p[k] !== null)) {
      gameCommitting.current = true;
      setTimeout(() => commitGameRound(p), 350);
    } else {
      setGame(prev => { const next = { ...prev, pending: p }; saveKey("dg-game-active", next); return next; });
    }
  };

  const commitGameRound = (p) => {
    setGame(prev => {
      const made = DEFAULT_ORDER.reduce((n, k) => n + (p[k] ? 1 : 0), 0);
      const { nf, nw, msg } = applyRules(prev.flag, prev.watch, made);
      const pts = made * flagPts(prev.flag);
      const round = { flag: prev.flag, made, prevFlag: prev.flag, prevWatch: prev.watch };
      const next = { ...prev, flag: nf, watch: nw, rounds: [...prev.rounds, round], pending: null };
      queueMicrotask(() => {
        setBanner(`${made}/3 at flag ${prev.flag} — +${pts} pts · ${msg.replace(/^\d\/3 — /, "")}`);
        buzz(nf > prev.flag ? [40, 60, 40, 60, 80] : nf < prev.flag ? [180] : made >= 2 ? [30] : [60, 50, 60]);
        if (next.rounds.length >= GAME_ROUNDS) finishGame(next);
        else saveKey("dg-game-active", next);
      });
      return next;
    });
    setGamePending({ orange: null, red: null, green: null });
    gameCommitting.current = false;
  };

  const undoGameRound = () => {
    if (!game || game.rounds.length === 0) return;
    const last = game.rounds[game.rounds.length - 1];
    const next = { ...game, flag: last.prevFlag, watch: last.prevWatch, rounds: game.rounds.slice(0, -1), pending: null };
    setGame(next); setGamePending({ orange: null, red: null, green: null });
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
    const order = roundOrder(active);
    const answered = DEFAULT_ORDER.filter(k => pending[k] !== null).length;
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
        <FlagRail flag={active.flag} watch={active.watch} highest={Math.max(active.flag, ...active.rounds.map(r => r.flag), 1)} />
        <div className="text-center mt-1 mb-1">
          <span style={{ ...disp, fontWeight: 800, fontSize: 38, lineHeight: 1 }}>FLAG {active.flag}</span>
          {ft(active.flag) && <span style={{ ...disp, fontWeight: 700, fontSize: 20, color: C.faint }} className="ml-2">{ft(active.flag)}</span>}
        </div>

        {/* banner */}
        <div className="rounded-xl px-3 py-2 text-center mb-2" style={{ background: banner ? C.ink : "#EDEAE0", color: banner ? "#fff" : C.faint, ...disp, fontWeight: 700, fontSize: 17, minHeight: 38 }}>
          {banner || `Rows are throw order — tap a color to throw it first (${answered}/3)`}
        </div>

        {/* disc rows in throw order */}
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {order.map((k, i) => {
            const v = pending[k];
            return (
              <div key={k} className="flex-1 flex gap-2 min-h-0">
                <button onClick={() => throwFirst(k)} className="relative flex flex-col items-center justify-center rounded-2xl" style={{ width: 64, background: DISC[k].color }}>
                  <span className="absolute top-1 left-2 rounded-full" style={{ ...disp, fontWeight: 800, fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{i + 1}</span>
                  <span style={{ ...disp, fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: "0.04em" }}>{DISC[k].label}</span>
                </button>
                <button onClick={() => answer(k, true)} className="flex-1 rounded-2xl"
                  style={{
                    background: v === true ? C.fairway : C.card,
                    color: v === true ? "#fff" : C.ink,
                    border: v === true ? `2px solid ${C.fairway}` : `2px solid ${C.line}`,
                    ...disp, fontWeight: 800, fontSize: 26,
                  }}>MADE</button>
                <button onClick={() => answer(k, false)} className="flex-1 rounded-2xl"
                  style={{
                    background: v === false ? C.miss : C.card,
                    color: v === false ? "#fff" : C.faint,
                    border: v === false ? `2px solid ${C.miss}` : `2px solid ${C.line}`,
                    ...disp, fontWeight: 800, fontSize: 26,
                  }}>MISS</button>
              </div>
            );
          })}
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
    const answered = DEFAULT_ORDER.filter(k => gamePending[k] !== null).length;
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
        <FlagRail flag={game.flag} watch={game.watch} highest={Math.max(game.flag, ...game.rounds.map(r => r.flag), 1)} />
        <div className="text-center mt-1 mb-1">
          <span style={{ ...disp, fontWeight: 800, fontSize: 34, lineHeight: 1 }}>FLAG {game.flag}</span>
          <span style={{ ...disp, fontWeight: 700, fontSize: 19, color: C.fairway }} className="ml-2">
            {flagPts(game.flag)} pt{flagPts(game.flag) > 1 ? "s" : ""} a make
          </span>
          {ft(game.flag) && <span style={{ ...disp, fontWeight: 700, fontSize: 17, color: C.faint }} className="ml-2">{ft(game.flag)}</span>}
        </div>

        {/* banner */}
        <div className="rounded-xl px-3 py-2 text-center mb-2" style={{ background: banner ? C.ink : "#EDEAE0", color: banner ? "#fff" : C.faint, ...disp, fontWeight: 700, fontSize: 17, minHeight: 38 }}>
          {banner || `Log all three putters (${answered}/3)`}
        </div>

        {/* three putters */}
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {DEFAULT_ORDER.map(k => {
            const v = gamePending[k];
            return (
              <div key={k} className="flex-1 flex gap-2 min-h-0">
                <div className="flex flex-col items-center justify-center rounded-2xl" style={{ width: 58, background: DISC[k].color }}>
                  <span style={{ ...disp, fontWeight: 800, fontSize: 15, color: "#fff", letterSpacing: "0.04em" }}>{DISC[k].label}</span>
                </div>
                <button onClick={() => gameAnswer(k, true)} className="flex-1 rounded-2xl"
                  style={{
                    background: v === true ? C.fairway : C.card,
                    color: v === true ? "#fff" : C.ink,
                    border: v === true ? `2px solid ${C.fairway}` : `2px solid ${C.line}`,
                    ...disp, fontWeight: 800, fontSize: 26,
                  }}>MADE</button>
                <button onClick={() => gameAnswer(k, false)} className="flex-1 rounded-2xl"
                  style={{
                    background: v === false ? C.miss : C.card,
                    color: v === false ? "#fff" : C.faint,
                    border: v === false ? `2px solid ${C.miss}` : `2px solid ${C.line}`,
                    ...disp, fontWeight: 800, fontSize: 26,
                  }}>MISS</button>
              </div>
            );
          })}
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
        <button onClick={() => { setConfirmDelete(false); setView("home"); }} className="mb-3" style={{ color: C.faint, fontSize: 15, fontWeight: 600 }}>← Home</button>
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
        <button onClick={() => { setConfirmDelete(false); setView("home"); }} className="mb-3" style={{ color: C.faint, fontSize: 15, fontWeight: 600 }}>← Home</button>
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
        <StatBlock title="Progression" icon="route"><Progression rounds={s.rounds} /></StatBlock>
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

  // ----- HOME / HISTORY -----
  return shell(
    <div className="px-4 pt-6 pb-8 max-w-md mx-auto">
      <div className="flex items-center gap-2">
        <Icon name="basket" size={32} style={{ color: C.fairway }} />
        <span style={{ ...disp, fontWeight: 800, fontSize: 40, lineHeight: 1 }}>Putting yard</span>
      </div>
      <div style={{ fontSize: 14, color: C.faint }} className="mb-4">
        5 flags · 3 putters · earn your distance
      </div>

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

      {games.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 mt-5 mb-2" style={{ color: C.faint }}>
            <Icon name="trophy" size={16} />
            <span style={{ ...disp, fontWeight: 700, fontSize: 17, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Scored runs · best {Math.max(...games.map(g => gameScore(g)))} pts
            </span>
          </div>
          <Leaderboard
            board={leaderboard(games)}
            games={games}
            onPick={(i) => { setGameIdx(i); setConfirmDelete(false); setView("gamedetail"); }}
          />
        </>
      )}

      {sessions.length > 0 && (
        <>
          <div style={{ ...disp, fontWeight: 700, fontSize: 17, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }} className="mt-5 mb-2">All-time · {sessions.length} session{sessions.length > 1 ? "s" : ""}</div>
          <TrendBlock sessions={sessions} />
          <PersonalBests sessions={sessions} />
          <StatsBody segments={sessions.map(s => s.rounds)} distances={distances} />

          <div className="flex items-center gap-1.5 mt-5 mb-2" style={{ color: C.faint }}>
            <Icon name="clock" size={16} />
            <span style={{ ...disp, fontWeight: 700, fontSize: 17, letterSpacing: "0.08em", textTransform: "uppercase" }}>Sessions</span>
          </div>
          {sessions.map((s, i) => {
            const st = computeStats([s.rounds]);
            const madeAll = s.rounds.reduce((n, r) => n + r.made, 0);
            const durTxt = s.endedAt ? fmtDur((s.endedAt - s.startedAt) / 1000) : null;
            return (
              <button key={s.startedAt} onClick={() => { setDetailIdx(i); setConfirmDelete(false); setView("detail"); }}
                className="w-full rounded-2xl p-3 mb-2 flex items-center justify-between text-left"
                style={{ background: C.card, border: `1px solid ${C.line}` }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{fmtDate(s.startedAt)}{durTxt ? ` · ${durTxt}` : ""}</div>
                  <div style={{ fontSize: 13, color: C.faint }}>{st.total} rounds · {madeAll}/{st.total * 3} putts · high flag {st.highest}</div>
                </div>
                <span style={{ color: C.faint }}>›</span>
              </button>
            );
          }).reverse()}
        </>
      )}

      {sessions.length === 0 && !active && (
        <div className="rounded-2xl p-4 mt-2 mb-3" style={{ background: C.card, border: `1px solid ${C.line}`, fontSize: 14, color: C.faint, lineHeight: 1.5 }}>
          No sessions yet. Start one, log each round with three taps, and your stats build here automatically.
        </div>
      )}

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

      <div className="rounded-2xl p-4 mt-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5" style={{ color: C.faint }}>
            <Icon name="cloud" size={14} />
            <span style={{ ...disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Cloud sync {gh ? "· on" : "· off"}
            </span>
          </div>
          {gh && (
            <button onClick={() => syncNow()} disabled={syncing} className="rounded-full px-3 py-1"
              style={{ border: `1.5px solid ${C.line}`, color: syncing ? C.line : C.ink, fontSize: 13, fontWeight: 600 }}>
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>

        {gh ? (
          <>
            <div style={{ fontSize: 13 }}>
              Saving to <strong>{gh.owner}/{gh.repo}</strong> → {gh.path}
            </div>
            <div style={{ fontSize: 12, color: C.faint }} className="mt-1">
              {syncMsg || (lastSync ? `Last synced ${fmtDate(lastSync)}. Syncs automatically when a session or game ends.` : "Not synced yet.")}
            </div>
            <button onClick={disconnectGh} className="w-full rounded-xl py-2 mt-3"
              style={{ border: `1.5px solid ${C.line}`, color: C.faint, ...disp, fontWeight: 700, fontSize: 15 }}>
              Disconnect
            </button>
          </>
        ) : !showSync ? (
          <>
            <div style={{ fontSize: 13, color: C.faint, lineHeight: 1.5 }}>
              Keep your history in a GitHub repo so it survives a wiped browser or a new phone.
            </div>
            <button onClick={() => setShowSync(true)} className="w-full rounded-xl py-3 mt-3"
              style={{ border: `2px solid ${C.line}`, color: C.ink, ...disp, fontWeight: 700, fontSize: 16 }}>
              Set up cloud sync
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
                placeholder="Fine-grained token (github_pat_…)" type="password" autoCapitalize="none" autoCorrect="off"
                className="w-full rounded-xl px-3 py-2" style={{ border: `1.5px solid ${C.line}`, background: "#FAF8F2", fontSize: 15 }} />
            </div>
            <button onClick={connectGh} disabled={syncing} className="w-full rounded-xl py-3 mt-2"
              style={{ background: C.fairway, color: "#fff", ...disp, fontWeight: 700, fontSize: 17 }}>
              {syncing ? "Connecting…" : "Connect and sync"}
            </button>
            <div style={{ fontSize: 12, color: syncMsg.includes("Synced") ? C.fairway : C.amber }} className="mt-2">
              {syncMsg}
            </div>
            <div style={{ fontSize: 12, color: C.faint, lineHeight: 1.5 }} className="mt-2">
              Use a <strong>private</strong> repo and a fine-grained token limited to just that repo, with Contents set to Read and write. The token is stored on this device only — never committed.
            </div>
          </>
        )}
      </div>

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
          {backupMsg || (gh
            ? "Synced to GitHub. A backup file is still handy if you ever want a copy you control outright."
            : "Your data lives on this device only. Save a backup file now and then, or to move to a new phone.")}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-4" style={{ color: C.line }}>
        <Icon name="disc" size={13} />
        <span style={{ fontSize: 12, color: C.faint }}>{BUILD}</span>
      </div>

    </div>
  );
}
