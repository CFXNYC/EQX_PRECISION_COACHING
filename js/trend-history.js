/* ═══════════════════════════════════════════════════════════
   TREND HISTORY — week-over-week snapshot loader
   ---------------------------------------------------------
   Loads ./data/history/weekly_snapshots.json, built by
   scripts/capture_weekly_snapshot.py each time a fresh weekly data
   drop lands (the Monday data point is the week's benchmark).
   Standalone, optional — a missing/empty history file degrades to
   an empty series everywhere, never breaks any other view.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const HISTORY_URL = "./data/history/weekly_snapshots.json";

  async function fetchHistory() {
    const bustedUrl = `${HISTORY_URL}?v=${Date.now()}`;
    const res = await fetch(bustedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`weekly_snapshots.json returned HTTP ${res.status} ${res.statusText}.`);
    const json = await res.json();
    if (!json || !Array.isArray(json.snapshots)) throw new Error("weekly_snapshots.json did not contain a snapshots array.");
    return json.snapshots.slice().sort((a, b) => a.week_of.localeCompare(b.week_of));
  }

  async function run() {
    try {
      window.TREND_HISTORY = await fetchHistory();
    } catch (err) {
      console.warn("trend-history.js: failed to load weekly snapshot history —", err.message);
      window.TREND_HISTORY = [];
    }
    return window.TREND_HISTORY;
  }

  /* Date label like "8/3" from an ISO "2026-08-03..." string. */
  function dateLabel(iso) {
    const [, m, d] = iso.slice(0, 10).split("-");
    return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
  }

  /* Pulls a dotted-path metric (e.g. "kpi.avg_conversion_rate") out of
     EVERY capture's org block — benchmark (Monday) and intraweek alike,
     in chronological order — so a within-week spike shows up as a bump
     in the same line, not just week-to-week movement. isBenchmark is a
     parallel array a renderer can use to mark Monday points distinctly.
     weeksCaptured/totalCaptures are both exposed since gating logic may
     care about either ("N distinct weeks" vs "N data points so far"). */
  function orgSeries(path) {
    const captures = window.TREND_HISTORY || [];
    const parts = path.split(".");
    const values = captures.map((s) => parts.reduce((acc, k) => (acc ? acc[k] : undefined), s.org));
    return {
      xLabels: captures.map((s) => dateLabel(s.captured_at)),
      values,
      isBenchmark: captures.map((s) => !!s.is_benchmark),
      totalCaptures: captures.length,
      weeksCaptured: new Set(captures.map((s) => s.week_of)).size,
    };
  }

  window.TREND_HISTORY_READY = run();
  window.TRENDS = { orgSeries, dateLabel };
})();
