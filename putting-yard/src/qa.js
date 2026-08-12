// QA harness: exercises the pure logic against hand-computed expectations.
// Run with: node qa.js
import * as A from "./src/App.jsx";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
};

// helper: build a round the way the app does
const R = (results, order = ["orange", "red", "green"], miss = {}, dur = 60) => ({
  results, order, miss, dur,
  made: order.reduce((n, k) => n + (results[k] ? 1 : 0), 0),
});
const M = (o, r, g) => ({ orange: !!o, red: !!r, green: !!g });

console.log("\n— ladder rules —");
eq("3/3 advances", A.applyRules(2, false, 3).nf, 3);
eq("3/3 at flag 5 holds", A.applyRules(5, false, 3).nf, 5);
eq("2/3 repeats", A.applyRules(3, false, 2).nf, 3);
eq("2/3 clears watch", A.applyRules(3, true, 2).nw, false);
eq("1/3 sets watch", A.applyRules(3, false, 1).nw, true);
eq("1/3 stays put", A.applyRules(3, false, 1).nf, 3);
eq("1/3 on watch drops", A.applyRules(3, true, 1).nf, 2);
eq("drop clears watch", A.applyRules(3, true, 1).nw, false);
eq("0/3 drops", A.applyRules(4, false, 0).nf, 3);
eq("0/3 at flag 1 floors", A.applyRules(1, false, 0).nf, 1);
eq("1/3 on watch at flag 1 floors", A.applyRules(1, true, 1).nf, 1);
eq("3/3 clears watch", A.applyRules(2, true, 3).nw, false);

console.log("\n— replay after an edit —");
{
  // 3/3 → 3/3 → 1/3 → 1/3(on watch, drops) → 0/3
  const rounds = [
    R(M(1, 1, 1)), R(M(1, 1, 1)), R(M(1, 0, 0)), R(M(1, 0, 0)), R(M(0, 0, 0)),
  ];
  const rep = A.replaySession(rounds);
  eq("flags replay correctly", rep.map(r => r.flag), [1, 2, 3, 3, 2]);
  eq("watch replays correctly", rep.map(r => r.prevWatch), [false, false, false, true, false]);
  eq("made counts", rep.map(r => r.made), [3, 3, 1, 1, 0]);

  // flip the second round's green putt to a miss → 2/3, so no advance to flag 3
  const edited = rounds.map((r, i) => i === 1 ? R(M(1, 1, 0)) : r);
  const rep2 = A.replaySession(edited);
  eq("edit renumbers downstream flags", rep2.map(r => r.flag), [1, 2, 2, 2, 1]);
}

console.log("\n— per-colour stats follow the disc, not the slot —");
{
  // orange always makes; green always misses; order changes every round
  const rounds = A.replaySession([
    R(M(1, 1, 0), ["orange", "red", "green"]),
    R(M(1, 0, 0), ["green", "orange", "red"]),
    R(M(1, 1, 0), ["red", "green", "orange"]),
  ]);
  const st = A.computeStats([rounds]);
  eq("orange 3/3 across reorders", [st.perColor.orange.m, st.perColor.orange.a], [3, 3]);
  eq("green 0/3 across reorders", [st.perColor.green.m, st.perColor.green.a], [0, 3]);
  eq("red 2/3 across reorders", [st.perColor.red.m, st.perColor.red.a], [2, 3]);

  // throw position must track the ORDER, not the colour
  // r1 slots: orange(1) red(1) green(0) → pos 1,2 make, 3 miss
  // r2 slots: green(0) orange(1) red(0)  → pos 2 makes
  // r3 slots: red(1) green(0) orange(1)  → pos 1,3 make
  eq("1st-throw record", [st.perPos[0].m, st.perPos[0].a], [2, 3]);
  eq("2nd-throw record", [st.perPos[1].m, st.perPos[1].a], [2, 3]);
  eq("3rd-throw record", [st.perPos[2].m, st.perPos[2].a], [1, 3]);
  eq("totals line up", st.perPos.reduce((n, p) => n + p.m, 0), 5);
}

console.log("\n— per-flag stats —");
{
  const rounds = A.replaySession([R(M(1, 1, 1)), R(M(1, 1, 0)), R(M(0, 0, 0))]);
  // flag 1: 3/3, flag 2: 2/3 then 0/3 → 2/6
  const st = A.computeStats([rounds]);
  eq("flag 1 counts", [st.perFlag[1].m, st.perFlag[1].a], [3, 3]);
  eq("flag 2 counts", [st.perFlag[2].m, st.perFlag[2].a], [2, 6]);
  eq("highest flag", st.highest, 2);
  eq("disc x flag grid", [st.grid[2].orange.m, st.grid[2].orange.a], [1, 2]);
}

console.log("\n— streaks —");
{
  // order matters: streak counts putts in throw order across rounds
  const rounds = A.replaySession([R(M(0, 1, 1)), R(M(1, 1, 0))]);
  const st = A.computeStats([rounds]);
  eq("best streak spans the round boundary", st.bestStreak, 4);
  eq("current streak ends at last miss", A.currentStreak(rounds), 0);
}

console.log("\n— miss directions —");
{
  const rounds = A.replaySession([
    R(M(1, 0, 0), ["orange", "red", "green"], { red: "L", green: "L" }),
    R(M(0, 0, 1), ["orange", "red", "green"], { orange: "R", red: "H" }),
    R(M(1, 1, 0), ["orange", "red", "green"], {}),  // undirected: counts as Prior
  ]);
  const m = A.missAnalysis(rounds);
  eq("left tally", m.all.L, 2);
  eq("right tally", m.all.R, 1);
  eq("high tally", m.all.H, 1);
  eq("low tally", m.all.Lo, 0);
  eq("prior (undirected) tally", m.prior, 1);
  eq("known total", m.known, 4);
  eq("dominant direction", m.worst, "L");
  eq("misses + makes = all putts", m.known + m.prior + rounds.reduce((n, r) => n + r.made, 0), 9);
}

console.log("\n— pressure and ceiling —");
{
  const rounds = A.replaySession([R(M(1, 0, 0)), R(M(1, 1, 0)), R(M(1, 1, 1))]);
  const sessions = [{ startedAt: Date.now(), rounds }];
  const p = A.pressureSplit(sessions);
  // round 2 is the only one thrown while on watch (round 1 was 1/3)
  eq("watch-round putts counted once", p.on.a, 3);
  eq("watch-round makes", p.on.m, 2);
  eq("non-watch putts", p.off.a, 6);
  const c = A.ceilingAnalysis(sessions);
  eq("never reached flag 5", c.reached5, 0);
  eq("busiest flag", c.busiestFlag, 1);
}

console.log("\n— sync round-trip must lose nothing —");
{
  const rounds = A.replaySession([
    R(M(1, 0, 0), ["green", "orange", "red"], { orange: "L", red: "Lo" }, 42),
    R(M(1, 1, 1), ["red", "green", "orange"], {}, 88),
  ]);
  const s = { startedAt: 1700000000000, endedAt: 1700000500000, rounds };
  const back = A.unpackSession(A.packSession(s));
  eq("round count", back.rounds.length, 2);
  const norm = (x) => ["orange", "red", "green"].map(k => !!x[k]);
  eq("results survive", norm(back.rounds[0].results), norm(rounds[0].results));
  eq("throw order survives", back.rounds[0].order, ["green", "orange", "red"]);
  eq("miss directions survive", back.rounds[0].miss, { orange: "L", red: "Lo" });
  eq("duration survives", back.rounds[0].dur, 42);
  eq("stats identical after round-trip",
    A.computeStats([back.rounds]).perColor,
    A.computeStats([rounds]).perColor);
  eq("miss analysis identical after round-trip",
    A.missAnalysis(back.rounds).all, A.missAnalysis(rounds).all);
}

console.log("\n— scored runs —");
{
  const g = {
    startedAt: 1, endedAt: 2, name: "Me",
    rounds: [
      { flag: 1, made: 3, putts: [true, true, true], miss: {}, prevWatch: false },
      { flag: 2, made: 1, putts: [true, false, false], miss: { 1: "L", 2: "R" }, prevWatch: false },
      { flag: 2, made: 0, putts: [false, false, false], miss: {}, prevWatch: true },
    ],
  };
  // 3 makes at flag 1 (3pts) + 1 make at flag 2 (2pts) = 5
  eq("score weights by flag", A.gameScore(g), 5);
  eq("makes counted", A.gameMakes(g), 4);
  const t = A.gameFlagTable(g);
  eq("flag 1 points", t[1].pts, 3);
  eq("flag 2 points", t[2].pts, 2);
  eq("flag 2 attempts", t[2].a, 6);
  const back = A.unpackGame(A.packGame(g));
  eq("run survives round-trip", A.gameScore(back), 5);
  eq("run miss dirs survive", back.rounds[1].miss, { 1: "L", 2: "R" });
  const board = A.leaderboard([g, { ...g, startedAt: 9, rounds: [{ flag: 5, made: 3, putts: [], miss: {} }] }]);
  eq("leaderboard sorts by score", board.map(b => b.score), [15, 5]);
}

console.log("\n— merge (two devices) —");
{
  const mk = (t, n) => ({ startedAt: t, rounds: Array.from({ length: n }, () => R(M(1, 1, 1))) });
  const local = [mk(1, 2), mk(2, 3)];
  const remote = [mk(2, 3), mk(3, 1)];
  const merged = A.mergeRecords(local, remote, x => x.rounds.length);
  eq("union, no duplicates", merged.map(x => x.startedAt), [1, 2, 3]);
  const richer = A.mergeRecords([mk(2, 1)], [mk(2, 5)], x => x.rounds.length);
  eq("keeps the fuller copy on conflict", richer[0].rounds.length, 5);
}


console.log("\n— store containing junk —");
{
  const ok = A.unpackAll({ app: "putting-yard" });
  eq("starter content yields empty history", [ok.sessions.length, ok.games.length], [0, 0]);
  const messy = A.unpackAll({ s: "not-an-array", g: [null, { s: 5, r: [] }], d: "nope" });
  eq("bad sessions ignored", messy.sessions.length, 0);
  eq("bad games skipped, good kept", messy.games.length, 1);
  eq("bad distances ignored", messy.distances, {});
  eq("null store is safe", A.unpackAll(null).sessions.length, 0);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
