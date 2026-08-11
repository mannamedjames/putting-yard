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

// ---------- 30-shot game ----------
const GAME_SHOTS = 30;
const flagPts = f => f; // flag number = points per make
const gameScore = shots => shots.reduce((n, s) => n + (s.made ? flagPts(s.flag) : 0), 0);
function gameFlagTable(shots) {
  const t = {};
  for (let f = 1; f <= 5; f++) t[f] = { m: 0, a: 0, pts: 0 };
  shots.forEach(s => { t[s.flag].a += 1; if (s.made) { t[s.flag].m += 1; t[s.flag].pts += flagPts(s.flag); } });
  return t;
}

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
// Local to this device, via localStorage. No account, no server.
const NS = "puttingyard:";
async function loadKey(key) {
  try { const v = localStorage.getItem(NS + key); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
async function saveKey(key, val) {
  try { localStorage.setItem(NS + key, JSON.stringify(val)); }
  catch (e) { console.error("save failed", e); }
}
async function deleteKey(key) {
  try { localStorage.removeItem(NS + key); } catch { /* nothing to remove */ }
}

// haptics: Android Chrome buzzes; iOS Safari ignores this silently
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* unsupported */ }
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

function StatBlock({ title, children }) {
  return (
    <div className="rounded-2xl p-4 mb-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div style={{ ...disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }} className="mb-2">{title}</div>
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

      <StatBlock title="By flag">
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

      <StatBlock title="Rounds to advance">
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
        <StatBlock title="Warm-up effect">
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

      <StatBlock title="By disc">
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

      <StatBlock title="By throw position">
        <div className="flex gap-2">
          {["1st", "2nd", "3rd"].map((lbl, i) => (
            <div key={lbl} className="flex-1 rounded-xl p-2 text-center" style={{ background: "#FAF8F2", border: `1px solid ${C.line}` }}>
              <div style={{ ...disp, fontWeight: 800, fontSize: 22, lineHeight: 1 }}>{pct(s.perPos[i])}</div>
              <div style={{ fontSize: 11, color: C.faint }}>{lbl} · {frac(s.perPos[i])}</div>
            </div>
          ))}
        </div>
      </StatBlock>

      <StatBlock title="Disc × flag (makes/attempts)">
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
    <StatBlock title="Trend">
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
    <StatBlock title="Personal bests">
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
  const wakeLock = useRef(null);

  useEffect(() => {
    (async () => {
      const s = await loadKey("dg-sessions");
      const a = await loadKey("dg-active");
      const d = await loadKey("dg-flags");
      const g = await loadKey("dg-games");
      const ga = await loadKey("dg-game-active");
      if (s) setSessions(s);
      if (a) setActive(a);
      if (d) setDistances(d);
      if (g) setGames(g);
      if (ga) setGame(ga);
      setLoaded(true);
    })();
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
    setConfirmDelete(false);
    setView("detail");
  };

  const startGame = () => {
    const g = { startedAt: Date.now(), flag: game?.flag || 1, shots: [] };
    setGame(g); setBanner(null); setConfirmQuit(false); setView("game");
    saveKey("dg-game-active", g);
  };

  const resumeGame = () => { setBanner(null); setConfirmQuit(false); setView("game"); };

  const pickGameFlag = (f) => {
    setGame(prev => {
      const next = { ...prev, flag: f };
      saveKey("dg-game-active", next);
      return next;
    });
  };

  const finishGame = (g) => {
    const done = { startedAt: g.startedAt, endedAt: Date.now(), shots: g.shots, score: gameScore(g.shots) };
    const list = [...games, done];
    setGames(list); setGame(null); setGameIdx(list.length - 1);
    saveKey("dg-games", list); deleteKey("dg-game-active");
    setConfirmDelete(false);
    setView("gamedetail");
  };

  const gameShot = (made) => {
    setGame(prev => {
      const shot = { flag: prev.flag, made };
      const next = { ...prev, shots: [...prev.shots, shot] };
      const pts = made ? flagPts(prev.flag) : 0;
      queueMicrotask(() => {
        setBanner(made ? `Made — +${pts} pts` : "Miss — 0 pts");
        buzz(made ? [30] : [80]);
        if (next.shots.length >= GAME_SHOTS) finishGame(next);
        else saveKey("dg-game-active", next);
      });
      return next;
    });
  };

  const undoShot = () => {
    if (!game || game.shots.length === 0) return;
    const last = game.shots[game.shots.length - 1];
    const next = { ...game, shots: game.shots.slice(0, -1), flag: last.flag };
    setGame(next); setBanner(`Undid shot ${game.shots.length}`);
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
    const score = gameScore(game.shots);
    const shotNum = game.shots.length + 1;
    return shell(
      <div className="flex flex-col px-3 pt-3 pb-3" style={{ height: "100dvh" }}>
        {/* header */}
        <div className="flex items-center justify-between mb-1">
          <div style={{ ...disp, fontWeight: 800, fontSize: 22 }}>Shot {shotNum}/{GAME_SHOTS}</div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-3 py-1" style={{ background: C.ink, color: "#fff", ...disp, fontWeight: 800, fontSize: 17 }}>{score} pts</span>
            {!confirmQuit ? (
              <button onClick={() => setConfirmQuit(true)} className="rounded-full px-4 py-2" style={{ border: `1.5px solid ${C.line}`, color: C.faint, fontSize: 14, fontWeight: 600 }}>Quit</button>
            ) : (
              <button onClick={quitGame} className="rounded-full px-4 py-2" style={{ background: C.red, color: "#fff", fontSize: 14, fontWeight: 600 }}>Discard game?</button>
            )}
          </div>
        </div>

        {/* banner */}
        <div className="rounded-xl px-3 py-2 text-center mb-2" style={{ background: banner ? C.ink : "#EDEAE0", color: banner ? "#fff" : C.faint, ...disp, fontWeight: 700, fontSize: 17, minHeight: 38 }}>
          {banner || "Pick your flag, then log the shot"}
        </div>

        {/* flag picker */}
        <div className="flex gap-1.5 mb-2">
          {[1, 2, 3, 4, 5].map(f => {
            const sel = game.flag === f;
            return (
              <button key={f} onClick={() => pickGameFlag(f)} className="flex-1 rounded-2xl py-2 flex flex-col items-center"
                style={{
                  background: sel ? C.fairway : C.card,
                  border: sel ? `2px solid ${C.fairway}` : `2px solid ${C.line}`,
                  color: sel ? "#fff" : C.ink,
                }}>
                <span style={{ ...disp, fontWeight: 800, fontSize: 24, lineHeight: 1 }}>{f}</span>
                <span style={{ ...disp, fontWeight: 700, fontSize: 13, color: sel ? "rgba(255,255,255,0.85)" : C.faint }}>
                  {flagPts(f)} pt{flagPts(f) > 1 ? "s" : ""}{distances[f] ? ` · ${distances[f]}ft` : ""}
                </span>
              </button>
            );
          })}
        </div>

        {/* made / miss */}
        <div className="flex-1 flex gap-2 min-h-0">
          <button onClick={() => gameShot(true)} className="flex-1 rounded-2xl"
            style={{ background: C.fairway, color: "#fff", ...disp, fontWeight: 800, fontSize: 34 }}>
            MADE<div style={{ fontSize: 17, fontWeight: 700, opacity: 0.85 }}>+{flagPts(game.flag)} pts</div>
          </button>
          <button onClick={() => gameShot(false)} className="flex-1 rounded-2xl"
            style={{ background: C.card, color: C.faint, border: `2px solid ${C.line}`, ...disp, fontWeight: 800, fontSize: 34 }}>
            MISS
          </button>
        </div>

        {/* undo */}
        <button onClick={undoShot} disabled={game.shots.length === 0} className="mt-2 rounded-2xl py-3 w-full"
          style={{ border: `2px solid ${C.line}`, color: game.shots.length ? C.ink : C.line, ...disp, fontWeight: 700, fontSize: 19 }}>
          Undo last shot
        </button>
      </div>
    );
  }

  // ----- GAME DETAIL -----
  if (view === "gamedetail" && gameIdx !== null && games[gameIdx]) {
    const g = games[gameIdx];
    const t = gameFlagTable(g.shots);
    const makes = g.shots.filter(s => s.made).length;
    const best = Math.max(...games.map(o => o.score));
    const isHigh = games.length >= 2 && g.score === best && games.findIndex(o => o.score === best) === gameIdx;
    return shell(
      <div className="px-4 pt-4 pb-8 max-w-md mx-auto">
        <button onClick={() => { setConfirmDelete(false); setView("home"); }} className="mb-3" style={{ color: C.faint, fontSize: 15, fontWeight: 600 }}>← Home</button>
        <div style={{ ...disp, fontWeight: 800, fontSize: 32, lineHeight: 1.05 }}>30-shot game</div>
        <div style={{ fontSize: 13, color: C.faint }} className="mb-2">{fmtDate(g.startedAt)}</div>
        {isHigh && (
          <span className="inline-block rounded-full px-3 py-1 mb-3" style={{ background: C.amberSoft, color: C.amber, ...disp, fontWeight: 700, fontSize: 14 }}>HIGH SCORE</span>
        )}
        <div className="flex gap-2 mb-3">
          <BigNum label="Score" value={g.score} />
          <BigNum label="Makes" value={`${makes}/${g.shots.length}`} />
        </div>
        <StatBlock title="By flag">
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
                  <td className="py-1.5" style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{f}{distances[f] ? <span style={{ fontSize: 11, color: C.faint, fontWeight: 400 }}> · {distances[f]}ft</span> : ""}</td>
                  <td className="py-1.5 text-right">{t[f].a ? `${t[f].m}/${t[f].a}` : "·"}</td>
                  <td className="py-1.5 text-right" style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{t[f].pts || "·"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </StatBlock>
        <button onClick={startGame} className="w-full rounded-2xl py-4 mt-1" style={{ background: C.ink, color: "#fff", ...disp, fontWeight: 800, fontSize: 22 }}>Play again</button>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="w-full rounded-2xl py-3 mt-3" style={{ border: `2px solid ${C.line}`, color: C.faint, ...disp, fontWeight: 700, fontSize: 18 }}>Delete this game</button>
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
        <div style={{ ...disp, fontWeight: 800, fontSize: 32, lineHeight: 1.05 }}>Session post mortem</div>
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
        <StatBlock title="Progression"><Progression rounds={s.rounds} /></StatBlock>
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
      <div style={{ ...disp, fontWeight: 800, fontSize: 40, lineHeight: 1 }}>Putting yard</div>
      <div style={{ fontSize: 14, color: C.faint }} className="mb-4">5 flags · 3 putters · earn your distance</div>

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
          Resume game — shot {game.shots.length + 1}/{GAME_SHOTS} · {gameScore(game.shots)} pts
        </button>
      ) : (
        <button onClick={startGame} className="w-full rounded-2xl py-3 mb-3" style={{ background: C.card, color: C.ink, border: `2px solid ${C.ink}`, ...disp, fontWeight: 800, fontSize: 19 }}>
          Play 30-shot game
        </button>
      )}

      {games.length > 0 && (
        <>
          <div style={{ ...disp, fontWeight: 700, fontSize: 17, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }} className="mt-5 mb-2">
            30-shot game · high score {Math.max(...games.map(g => g.score))}
          </div>
          {games.map((g, i) => (
            <button key={g.startedAt} onClick={() => { setGameIdx(i); setConfirmDelete(false); setView("gamedetail"); }}
              className="w-full rounded-2xl p-3 mb-2 flex items-center justify-between text-left"
              style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{fmtDate(g.startedAt)}</div>
                <div style={{ fontSize: 13, color: C.faint }}>{g.shots.filter(s => s.made).length}/{g.shots.length} makes</div>
              </div>
              <span style={{ ...disp, fontWeight: 800, fontSize: 22 }}>{g.score} <span style={{ fontSize: 13, color: C.faint, fontWeight: 400 }}>pts</span></span>
            </button>
          )).reverse()}
        </>
      )}

      {sessions.length > 0 && (
        <>
          <div style={{ ...disp, fontWeight: 700, fontSize: 17, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }} className="mt-5 mb-2">All-time · {sessions.length} session{sessions.length > 1 ? "s" : ""}</div>
          <TrendBlock sessions={sessions} />
          <PersonalBests sessions={sessions} />
          <StatsBody segments={sessions.map(s => s.rounds)} distances={distances} />

          <div style={{ ...disp, fontWeight: 700, fontSize: 17, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }} className="mt-5 mb-2">Sessions</div>
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
        <div style={{ ...disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }} className="mb-2">Flag distances (ft)</div>
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
        <div style={{ ...disp, fontWeight: 700, fontSize: 15, letterSpacing: "0.08em", textTransform: "uppercase", color: C.faint }} className="mb-2">Backup</div>
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
          {backupMsg || "Your data lives on this device only. Save a backup file now and then, or to move to a new phone."}
        </div>
      </div>

    </div>
  );
}
