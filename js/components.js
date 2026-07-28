/* ═══════════════════════════════════════════════════════════
   UI COMPONENTS — reusable HTML-string renderers
   ---------------------------------------------------------
   Shared building blocks used across all four pages: KPI cards,
   status/mapping badges, coach cards, target-vs-actual bars,
   coverage indicators, icons. Depends on CALC for status band
   lookups and CHARTS for score-to-color mapping only.

   All source-derived strings (coach names, club names, emails)
   are passed through escapeHtml before entering innerHTML.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  const ICONS = {
    users: `<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>`,
    userCheck: `<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>`,
    userQuestion: `<path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M18 9a2 2 0 113 1.7c-.5.4-1 .8-1 1.8"/><line x1="20" y1="16" x2="20" y2="16.01"/>`,
    activity: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
    target: `<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>`,
    award: `<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>`,
    trend: `<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>`,
    calendar: `<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`,
    zap: `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
    flag: `<line x1="4" y1="22" x2="4" y2="15"/><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z"/>`,
    repeat: `<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/>`,
    search: `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
  };

  function icon(name, size) {
    const s = size || 16;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;
  }

  /* ── Status / mapping badges ─────────────────────────────────── */
  function badgeForScore(score) {
    const band = window.CALC.statusBandFor(score);
    return `<span class="badge badge-${band.tone}">${band.label}</span>`;
  }

  function mappingBadge(mappingStatus) {
    if (mappingStatus === "needs_data") return `<span class="badge badge-needs-data">Needs Data</span>`;
    if (mappingStatus === "no_kpi_data") return `<span class="badge badge-no-kpi">No KPI Data</span>`;
    return `<span class="badge badge-matched">Matched</span>`;
  }

  /* Overall-score text shown anywhere a coach's score appears. Honors the
     60% coverage gate and the no_kpi_data case — never renders a numeric
     score for either. */
  function overallScoreDisplay(coach) {
    if (!coach.raw_performance) return { text: "—", sub: "No KPI data available", insufficient: false, noKpi: true };
    if (!coach.score_coverage || !coach.score_coverage.meets_threshold) {
      return { text: "—", sub: "Insufficient data to calculate a reliable score", insufficient: true, noKpi: false };
    }
    return { text: String(coach.overall_score), sub: coach.performance_band, insufficient: false, noKpi: false };
  }

  function coverageBadge(coveragePct, meetsThreshold) {
    const pctText = `${Math.round((coveragePct || 0) * 100)}%`;
    const cls = meetsThreshold ? "coverage-ok" : "coverage-low";
    return `<span class="coverage-badge ${cls}">${pctText} data coverage</span>`;
  }

  /* ── KPI card ────────────────────────────────────────────────── */
  function kpiCard({ label, value, sub, iconName }) {
    return `
      <div class="kpi-card card">
        <div class="kpi-lbl label-xs">${escapeHtml(label)}</div>
        <div class="kpi-body">
          ${iconName ? `<div class="kpi-icon">${icon(iconName, 16)}</div>` : ""}
          <div>
            <div class="kpi-num">${value}</div>
            ${sub ? `<div class="kpi-sub">${escapeHtml(sub)}</div>` : ""}
          </div>
        </div>
      </div>`;
  }

  /* ── Target-vs-actual progress bar ───────────────────────────── */
  function targetBar({ label, actualText, targetText, score, available }) {
    if (!available) {
      return `
        <div class="target-bar-row">
          <div class="target-bar-head"><span class="target-bar-label">${escapeHtml(label)}</span><span class="target-bar-value target-bar-unavailable">Not available</span></div>
          <div class="target-bar-track"><div class="target-bar-fill" style="width:0%;background:var(--light-gray)"></div></div>
        </div>`;
    }
    const color = window.CHARTS ? window.CHARTS.scoreColor(score) : "#1a1a1a";
    const fillPct = Math.max(4, Math.min(100, score));
    return `
      <div class="target-bar-row">
        <div class="target-bar-head">
          <span class="target-bar-label">${escapeHtml(label)}</span>
          <span class="target-bar-value">${escapeHtml(actualText)} <span class="target-bar-vs">/ target ${escapeHtml(targetText)}</span></span>
        </div>
        <div class="target-bar-track"><div class="target-bar-fill" style="width:${fillPct}%;background:${color}"></div></div>
      </div>`;
  }

  /* Word units ("clients") get a space before them; symbol/suffix units
     ("%", "/mo", "/wk") attach directly to the number. */
  function withUnit(value, unit) {
    if (!unit) return `${value}`;
    if (unit === "%" || unit.startsWith("/")) return `${value}${unit}`;
    return `${value} ${unit}`;
  }

  /* ── Score-detail block: renders every metric in a scoring category ── */
  function scoreCategoryDetail(categoryLabel, categoryScore, categoryCoverage, detail) {
    const rows = Object.values(detail).map((m) => {
      const targetText = (m.target && typeof m.target === "object")
        ? `${m.target.min}-${m.target.max}`
        : (m.unit === "%" ? `${Math.round(m.target * 1000) / 10}%` : withUnit(m.target, m.unit));
      const actualText = m.available
        ? (m.unit === "%" ? `${Math.round(m.actual * 1000) / 10}%` : withUnit(Math.round(m.actual * 10) / 10, m.unit))
        : "—";
      return targetBar({ label: m.label, actualText, targetText, score: m.score, available: m.available });
    }).join("");
    return `
      <div class="score-category-card">
        <div class="score-category-head">
          <span class="label-sm">${escapeHtml(categoryLabel)}</span>
          <span class="score-category-num">${categoryScore !== null && categoryScore !== undefined ? Math.round(categoryScore) : "—"}</span>
        </div>
        ${coverageBadge(categoryCoverage, categoryCoverage >= 0.6)}
        <div class="score-category-metrics">${rows}</div>
      </div>`;
  }

  /* ── Needs-data legend line (Coach interface requirement) ────── */
  function needsDataLegend() {
    return `<div class="data-legend">** Coach is included in pilot performance data, but club and directory information still need to be confirmed.</div>`;
  }

  /* ── Coach card (grid item) ───────────────────────────────────── */
  function miniScoreRow(coach) {
    const vals = [
      { lbl: "PROD", v: coach.production_score },
      { lbl: "PROC", v: coach.process_score },
      { lbl: "PERS", v: coach.persistence_score },
    ];
    return `<div class="coach-card-minis">${vals.map(x => `
      <div class="coach-card-mini">
        <span class="coach-card-mini-lbl">${x.lbl}</span>
        <span class="coach-card-mini-val">${x.v === null || x.v === undefined ? "—" : Math.round(x.v)}</span>
      </div>`).join("")}</div>`;
  }

  function coachCard(coach) {
    const scoreInfo = overallScoreDisplay(coach);
    const band = (!scoreInfo.insufficient && !scoreInfo.noKpi) ? window.CALC.statusBandFor(coach.overall_score) : null;
    const toneColor = band
      ? { risk: "var(--coral)", foundation: "var(--mid-gray)", momentum: "var(--amber)", standard: "var(--green)" }[band.tone]
      : "var(--light-gray)";
    const clubText = coach.club_name || "—";
    // coach_id is always either a directory id ("PC-###") or synthesized from
    // normalizeCoachName (alphanumeric only) — never contains quotes/HTML.
    return `
      <div class="coach-card" onclick="App.showCoach('${coach.coach_id}')">
        <div class="coach-card-accent" style="background:${toneColor}"></div>
        <div class="coach-card-top">
          <div>
            <div class="coach-card-name">${escapeHtml(coach.display_name)}</div>
            <div class="coach-card-meta">${escapeHtml(clubText)}</div>
          </div>
          <div class="coach-card-score" style="color:${toneColor}">${scoreInfo.text}</div>
        </div>
        ${coach.mapping_status !== "no_kpi_data" ? miniScoreRow(coach) : `<div class="coach-card-minis"><span class="label-xs">No KPI data available</span></div>`}
        <div class="coach-card-foot">
          ${mappingBadge(coach.mapping_status)}
        </div>
      </div>`;
  }

  window.COMPONENTS = {
    icon, escapeHtml, badgeForScore, mappingBadge, overallScoreDisplay, coverageBadge,
    kpiCard, targetBar, scoreCategoryDetail, needsDataLegend, coachCard, ICONS,
  };
})();
