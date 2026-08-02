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

  /* Only the exception case (no KPI evidence record yet) gets a badge — the
     normal case (has KPI evidence) is unmarked to keep the roster clean.
     This is about raw_performance/mapping_status specifically (KPI evidence
     availability) — an independent axis from competency-score availability,
     see overallScoreDisplay below. */
  function mappingBadge(mappingStatus) {
    if (mappingStatus === "no_kpi_data") return `<span class="badge badge-no-kpi">No Performance Data</span>`;
    return "";
  }

  /* Overall-score text shown anywhere a coach's competency-based score
     appears. Honors the 60% coverage gate and the no-rating case — never
     renders a numeric score for either, and never renders 0. A coach can
     have KPI evidence with no competency rating yet (or vice versa) — this
     gates on overall_score (real ratings present), not raw_performance or
     mere row-matching (see calculations.js's hasCompetencyScore comment for
     why row-matching alone is not "has a score"). */
  function overallScoreDisplay(coach) {
    if (coach.overall_score === null || coach.overall_score === undefined) {
      return { text: "—", sub: "Data pending", insufficient: false, noScore: true };
    }
    if (!coach.score_coverage || !coach.score_coverage.meets_threshold) {
      return { text: "—", sub: `Data pending — ${coach.coverage_label || "below coverage threshold"}`, insufficient: true, noScore: false };
    }
    return { text: String(coach.overall_score), sub: coach.performance_band, insufficient: false, noScore: false };
  }

  /* Standard "Data pending" empty-state block — consolidates the ad hoc
     empty-state HTML previously duplicated across render-*.js files. */
  function dataPendingBlock(message) {
    return `<div class="empty-state">${escapeHtml(message || "Data pending.")}</div>`;
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

  /* ── Competency bar: a single 1-5 rating normalized to 0-100, with no
     "target" implied (competencies aren't scored against a target — only
     KPI evidence historically was). Renders "Data pending" when unrated,
     never a fake 0. Reuses the existing target-bar-* CSS classes since the
     visual shape (label, value, track, fill) is identical — only the
     semantics differ from the old KPI target bar. ── */
  function competencyBar({ label, raw, normalized, available }) {
    if (!available) {
      return `
        <div class="target-bar-row">
          <div class="target-bar-head"><span class="target-bar-label">${escapeHtml(label)}</span><span class="target-bar-value target-bar-unavailable">Data pending</span></div>
          <div class="target-bar-track"><div class="target-bar-fill" style="width:0%;background:var(--light-gray)"></div></div>
        </div>`;
    }
    const color = window.CHARTS ? window.CHARTS.scoreColor(normalized) : "#1a1a1a";
    const fillPct = Math.max(4, Math.min(100, normalized));
    return `
      <div class="target-bar-row">
        <div class="target-bar-head">
          <span class="target-bar-label">${escapeHtml(label)}</span>
          <span class="target-bar-value">${escapeHtml(String(raw))}/5</span>
        </div>
        <div class="target-bar-track"><div class="target-bar-fill" style="width:${fillPct}%;background:${color}"></div></div>
      </div>`;
  }

  /* ── Competency-detail block: renders every competency in a pillar,
     replacing the old KPI-target scoreCategoryDetail for scored content.
     coverageLabel is the count-based "X of 3 competency inputs available"
     string computed once in calculations.js — never re-derived here. ── */
  function competencyCategoryDetail(categoryLabel, categoryScore, coverageLabel, detail) {
    const rows = Object.values(detail || {}).map((m) => competencyBar({ label: m.label, raw: m.raw, normalized: m.normalized, available: m.available })).join("");
    return `
      <div class="score-category-card">
        <div class="score-category-head">
          <span class="label-sm">${escapeHtml(categoryLabel)}</span>
          <span class="score-category-num">${categoryScore !== null && categoryScore !== undefined ? Math.round(categoryScore) : "—"}</span>
        </div>
        <div class="label-xs" style="text-transform:none;letter-spacing:0;margin:2px 0 6px">${escapeHtml(coverageLabel || "")}</div>
        <div class="score-category-metrics">${rows}</div>
      </div>`;
  }

  /* ── Evidence row: plain, non-scored KPI cards shown alongside a pillar's
     competency detail. Never implies a target/score — evidence only. ── */
  function evidenceRow(items) {
    const cards = (items || []).map((e) => {
      const value = e.available
        ? (e.unit === "%" ? `${Math.round(e.value * 1000) / 10}%` : withUnit(Math.round(e.value * 10) / 10, e.unit))
        : "Data pending";
      return kpiCard({ label: e.label, value, sub: e.available ? "Evidence" : undefined });
    }).join("");
    return `<div class="kpi-grid">${cards}</div>`;
  }

  /* ── Curriculum progress card (Professionalism/Performance/Programming
     pages, Coach profile) ───────────────────────────────────────── */
  function curriculumProgressCard(curriculum) {
    if (!curriculum || !curriculum.totalCount) {
      return `<div class="card card-pad"><div class="section-header"><span class="label-sm">Curriculum Progress</span></div>${dataPendingBlock("No curriculum enrollment on record.")}</div>`;
    }
    const rows = curriculum.paths.map((p) => `
      <div class="baseline-item">
        <span class="baseline-lbl">${escapeHtml(p.path_title || "—")}</span>
        <span class="baseline-val">${p.learner_completion_date ? "Completed" : escapeHtml(p.learner_status || "In progress")}${p.progress !== null && p.progress !== undefined ? ` · ${p.progress}%` : ""}</span>
      </div>`).join("");
    return `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">Curriculum Progress</span><span class="label-xs">${curriculum.completedCount} of ${curriculum.totalCount} paths completed</span></div>
        <div class="baseline-strip">${rows}</div>
      </div>`;
  }

  /* ── Club lead totals card — club-level ONLY. Carries an explicit caption
     so it is never mistaken for a per-coach figure (binding rule: lead
     totals must be clearly distinguished from individual coach metrics,
     never divided or allocated to a coach). ── */
  function leadTotalsCard(leadTotals) {
    if (!leadTotals) {
      return `<div class="card card-pad"><div class="section-header"><span class="label-sm">Club Lead Totals</span></div>${dataPendingBlock("No lead data on record for this club.")}</div>`;
    }
    return `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">Club Lead Totals</span></div>
        <div class="baseline-strip">
          <div class="baseline-item"><span class="baseline-lbl">Fitness Specialist Leads</span><span class="baseline-val">${leadTotals.fitness_specialist_leads}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Special Event Leads</span><span class="baseline-val">${leadTotals.special_event_leads}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Total Leads</span><span class="baseline-val">${leadTotals.total_leads}</span></div>
        </div>
        <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:10px;color:var(--mid-gray)">Club-level total — not attributable to individual coach performance.</div>
      </div>`;
  }

  /* ── Club filter <select> options — shared by Overview, Professionalism,
     Performance, Programming, and Coach. Values are
     always the raw club_number string (never a CLUB_NORM canonical name),
     so this list is safe to drive from STATE.selectedClubId directly via
     strict string equality. selectedValue (optional) marks the matching
     option `selected` so a programmatic filter change (e.g. the Club
     Portfolio drill-through) stays visually in sync after a re-render. ── */
  function clubFilterOptionsHtml(clubs, selectedValue) {
    const sel = selectedValue || "ALL";
    const opts = [`<option value="ALL"${sel === "ALL" ? " selected" : ""}>All Clubs</option>`];
    (clubs || []).forEach(c => opts.push(`<option value="${c.club_number}"${sel === c.club_number ? " selected" : ""}>${escapeHtml(c.club_name)}</option>`));
    return opts.join("");
  }

  /* ── Grouped coach <option> list — clubs as non-selectable <optgroup>
     headers, coaches indented beneath (native <select> behavior handles
     the non-selectable/keyboard/scrolling requirements for free). Shared
     by every page that offers a per-coach dropdown. Groups by each coach's
     own raw club_number/club_name (already attached in data.js from the
     approved pilot_coach_directory.json) — deliberately NOT through
     CLUB_NORM or any canonical/display-name resolution, so this dropdown
     has zero dependency on club-name normalization. ── */
  function groupedCoachOptionsHtml(coaches) {
    const groups = new Map(); // clubKey -> { label, coaches: [] }
    (coaches || []).forEach((c) => {
      const key = c.club_number || `unassigned:${c.club_name || ""}`;
      const label = c.club_name || "Unassigned";
      if (!groups.has(key)) groups.set(key, { label, coaches: [] });
      groups.get(key).coaches.push(c);
    });
    return Array.from(groups.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((g) => {
        const options = g.coaches.slice()
          .sort((a, b) => a.display_name.localeCompare(b.display_name))
          .map((c) => `<option value="${c.coach_id}">${escapeHtml(c.display_name)}</option>`)
          .join("");
        return `<optgroup label="${escapeHtml(g.label)}">${options}</optgroup>`;
      })
      .join("");
  }

  /* ── Coach card (grid item) ───────────────────────────────────── */
  function miniScoreRow(coach) {
    const vals = [
      { lbl: "PERF", v: coach.performance_score },
      { lbl: "PROG", v: coach.programming_score },
      { lbl: "PROF", v: coach.professionalism_score },
    ];
    return `<div class="coach-card-minis">${vals.map(x => `
      <div class="coach-card-mini">
        <span class="coach-card-mini-lbl">${x.lbl}</span>
        <span class="coach-card-mini-val">${x.v === null || x.v === undefined ? "—" : Math.round(x.v)}</span>
      </div>`).join("")}</div>`;
  }

  const TONE_COLOR = { risk: "var(--coral)", foundation: "var(--mid-gray)", momentum: "var(--amber)", results: "var(--blue)", standard: "var(--green)" };

  function coachCard(coach) {
    const scoreInfo = overallScoreDisplay(coach);
    const band = (!scoreInfo.insufficient && !scoreInfo.noScore) ? window.CALC.statusBandFor(coach.overall_score) : null;
    const toneColor = band ? TONE_COLOR[band.tone] : "var(--light-gray)";
    const clubText = coach.club_name || "—";
    const hasScore = !scoreInfo.noScore && !scoreInfo.insufficient;
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
        ${hasScore ? miniScoreRow(coach) : `<div class="coach-card-minis"><span class="label-xs">Data pending</span></div>`}
        <div class="coach-card-foot">
          ${mappingBadge(coach.mapping_status)}
        </div>
      </div>`;
  }

  /* ── Pillar entry card (Overview → Professionalism/Performance/
     Programming). pillarKey drives the CSS accent color via the existing
     --pillar-professionalism/--pillar-programming/--pillar-performance
     tokens in styles.css. score/coverageLabel come straight from the same
     scored aggregate Overview already computes — never re-derived here. ── */
  function pillarEntryCard({ pillarKey, label, weightLabel, score, coverageLabel, onClick }) {
    const scoreText = score !== null && score !== undefined ? Math.round(score) : "—";
    return `
      <div class="pillar-entry-card pillar-entry-${escapeHtml(pillarKey)}" onclick="${onClick}">
        <div class="pillar-entry-top">
          <span class="pillar-entry-label">${escapeHtml(label)}</span>
          <span class="pillar-entry-weight">${escapeHtml(weightLabel)}</span>
        </div>
        <div class="pillar-entry-score">${scoreText}</div>
        <div class="label-xs" style="text-transform:none;letter-spacing:0">${escapeHtml(coverageLabel || "")}</div>
        <div class="pillar-entry-cta">Open ${escapeHtml(label)} →</div>
      </div>`;
  }

  /* ── Curriculum summary, compact (Overview) — aggregate roll-up only;
     see calculations.js's curriculumProgressSummary header for why this
     never shows per-topic completion. ── */
  function curriculumSummaryCompact(summary) {
    if (!summary || !summary.enrolledCount) {
      return `<div class="card card-pad"><div class="section-header"><span class="label-sm">Curriculum Progress</span></div>${dataPendingBlock("No curriculum enrollment on record.")}</div>`;
    }
    return `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">Curriculum Progress</span><span class="label-xs">Coach Curriculum · Precision Coaching</span></div>
        <div class="baseline-strip">
          <div class="baseline-item"><span class="baseline-lbl">Enrolled</span><span class="baseline-val">${summary.enrolledCount} of ${summary.totalCoaches}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Completed</span><span class="baseline-val">${summary.completedCount}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">On Time</span><span class="baseline-val">${summary.onTimeCount}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Not Yet Started</span><span class="baseline-val">${summary.notStartedCount}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Avg Progress</span><span class="baseline-val">${summary.avgProgressPct !== null ? summary.avgProgressPct + "%" : "—"}</span></div>
        </div>
      </div>`;
  }

  window.COMPONENTS = {
    icon, escapeHtml, badgeForScore, mappingBadge, overallScoreDisplay, coverageBadge, dataPendingBlock,
    kpiCard, targetBar, competencyBar, competencyCategoryDetail, evidenceRow, curriculumProgressCard, leadTotalsCard,
    clubFilterOptionsHtml, coachCard, groupedCoachOptionsHtml, pillarEntryCard, curriculumSummaryCompact, ICONS,
  };
})();
