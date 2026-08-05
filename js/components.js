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

  /* ── KPI card — optional onClick (a JS expression string, same
     convention as every other onclick= in this codebase) makes the card
     an accessible button that opens a ranking modal. ── */
  function kpiCard({ label, value, sub, iconName, onClick }) {
    const clickableAttrs = onClick ? ` onclick="${onClick}" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();(${onClick})}"` : "";
    return `
      <div class="kpi-card card${onClick ? " kpi-card-clickable" : ""}"${clickableAttrs}>
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
  function competencyCategoryDetail(categoryLabel, categoryScore, coverageLabel, detail, onClick) {
    const rows = Object.values(detail || {}).map((m) => competencyBar({ label: m.label, raw: m.raw, normalized: m.normalized, available: m.available })).join("");
    const clickAttrs = onClick ? ` onclick="${escapeHtml(onClick)}" style="cursor:pointer" role="button" tabindex="0"` : "";
    return `
      <div class="score-category-card"${clickAttrs}>
        <div class="score-category-head">
          <span class="label-sm">${escapeHtml(categoryLabel)}</span>
          <span class="score-category-num">${categoryScore !== null && categoryScore !== undefined ? Math.round(categoryScore) : "—"}</span>
        </div>
        <div class="label-xs" style="text-transform:none;letter-spacing:0;margin:2px 0 6px">${escapeHtml(coverageLabel || "")}</div>
        <div class="score-category-metrics">${rows}</div>
        ${onClick ? `<div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:8px;color:var(--mid-gray)">View deeper dive →</div>` : ""}
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

  /* ── Self-assessment card (Professionalism/Performance/Programming pages,
     Coach profile) — informational only, NEVER folds into Overall Score
     or any pillar score. Sourced from coach_self_assessed_competency_scores.json
     (coach.self_assessment, attached by js/self-assessment-data.js), a
     separate 37-item weekly curriculum self-reflection distinct from the
     9-item observer-scored competency framework driving calculations.js.
     Binding decision confirmed 2026-08-04: display only, never blended. ── */
  function selfAssessmentPillarCard(pillarKey, selfAssessment) {
    const pillarData = selfAssessment && selfAssessment.competencies ? selfAssessment.competencies[pillarKey] : null;
    if (!selfAssessment || !pillarData) {
      return `<div class="card card-pad"><div class="section-header"><span class="label-sm">Self-Assessment</span><span class="badge badge-foundation">Self-reported</span></div>${dataPendingBlock("This coach has not yet submitted a self-assessment.")}</div>`;
    }
    const items = (pillarData.items || []).map((it) => `
      <div class="baseline-item">
        <span class="baseline-lbl">Week ${it.week_number} — ${escapeHtml(it.focus_area || "")}: ${escapeHtml(it.question || "")}</span>
        <span class="baseline-val">${escapeHtml(it.response || "—")}${it.rating !== null && it.rating !== undefined ? ` (${it.rating}/5)` : ""}</span>
      </div>`).join("");
    return `
      <div class="card card-pad">
        <div class="section-header">
          <span class="label-sm">Self-Assessment</span>
          <span class="badge badge-foundation">Self-reported — not part of Overall Score</span>
        </div>
        <div class="baseline-strip">
          <div class="baseline-item"><span class="baseline-lbl">Self-Reported Score</span><span class="baseline-val">${pillarData.score}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Average Rating</span><span class="baseline-val">${pillarData.average_rating} / 5</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Items Completed</span><span class="baseline-val">${pillarData.item_count} of ${pillarData.expected_item_count}</span></div>
        </div>
        <details style="margin-top:10px">
          <summary class="label-xs" style="cursor:pointer;color:var(--mid-gray)">View item-level responses</summary>
          <div class="baseline-strip" style="margin-top:8px">${items}</div>
        </details>
        <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:10px;color:var(--mid-gray)">Submitted ${escapeHtml(selfAssessment.assessment_date || "—")}</div>
      </div>`;
  }

  /* ── Self-assessment summary card (Coach profile) — all three pillars
     compactly, same informational-only framing. ── */
  function selfAssessmentSummaryCard(selfAssessment) {
    if (!selfAssessment || !selfAssessment.competencies) {
      return `<div class="card card-pad"><div class="section-header"><span class="label-sm">Self-Assessment</span><span class="badge badge-foundation">Self-reported</span></div>${dataPendingBlock("This coach has not yet submitted a self-assessment.")}</div>`;
    }
    const c = selfAssessment.competencies;
    const rows = [
      { key: "performance", label: "Performance" },
      { key: "professionalism", label: "Professionalism" },
      { key: "programming", label: "Programming" },
    ].map(({ key, label }) => {
      const p = c[key];
      return `<div class="baseline-item"><span class="baseline-lbl">${label}</span><span class="baseline-val">${p ? `${p.score} (${p.item_count}/${p.expected_item_count} items)` : "—"}</span></div>`;
    }).join("");
    return `
      <div class="card card-pad">
        <div class="section-header">
          <span class="label-sm">Self-Assessment</span>
          <span class="badge badge-foundation">Self-reported — not part of Overall Score</span>
        </div>
        <div class="baseline-strip">${rows}</div>
        <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:10px;color:var(--mid-gray)">Submitted ${escapeHtml(selfAssessment.assessment_date || "—")}${selfAssessment.self_identified_development_pillar ? ` — self-identified focus: ${escapeHtml(selfAssessment.self_identified_development_pillar)}` : ""}</div>
      </div>`;
  }

  /* ── Development Focus card (Coach profile) — the coach's single
     highest-priority competency gap, paired with its evidence KPI and
     recommended skills (js/recommendations.js primaryDevelopmentFocus,
     sourced from SKILLS_MATRIX). Distinct from the Strengths/
     Opportunities/Next Steps lists — this is one ranked pick, not a
     list, matching how a manager would prioritize a single observation
     focus for the next coaching conversation. ── */
  function developmentFocusCard(focus) {
    if (!focus) {
      return `<div class="card card-pad"><div class="section-header"><span class="label-sm">Development Focus</span></div>${dataPendingBlock("No competency ratings on record yet — development focus will populate once ratings are logged.")}</div>`;
    }
    return `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">Development Focus</span><span class="label-xs">${escapeHtml(focus.primary_development_pillar)}</span></div>
        <div style="display:flex;align-items:baseline;gap:12px;margin-top:6px">
          <div class="score-category-num" style="font-size:32px">${focus.competency_score !== null && focus.competency_score !== undefined ? focus.competency_score : "—"}</div>
          <div>
            <div style="font-weight:600;font-size:14px;color:var(--off-black)">${escapeHtml(focus.development_competency)}</div>
            ${focus.development_focus ? `<div class="label-xs" style="text-transform:none;letter-spacing:0">${escapeHtml(focus.development_focus)}${focus.evidence_kpi ? ` · evidence KPI: ${escapeHtml(focus.evidence_kpi)}` : ""}</div>` : ""}
          </div>
        </div>
        ${focus.recommended_skills ? `<div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:10px">Recommended skills: ${escapeHtml(focus.recommended_skills.join(", "))}</div>` : ""}
        <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:8px;color:var(--mid-gray)">${escapeHtml(focus.next_coaching_action)}</div>
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

  /* ── Business Performance card (Coach profile) — full 17-field KPI
     breakdown sourced directly from coach.raw_performance (the source
     record from pilot_coach_data.json, joined 1:1 by directory name in
     js/data.js). Deliberately reads raw_performance rather than the
     derived calculated_metrics so every number shown here is the
     unmodified source value — no recomputation, no rounding drift.
     Never scored, informational only. Refreshes automatically whenever
     pilot_coach_data.json is updated (data.js re-fetches on load). ── */
  function businessPerformanceCard(rawPerformance) {
    if (!rawPerformance) {
      return `<div class="card card-pad"><div class="section-header"><span class="label-sm">Business Performance</span></div>${dataPendingBlock("No KPI evidence on record for this coach yet.")}</div>`;
    }
    const r = rawPerformance;
    const pct = (v) => (v === null || v === undefined) ? "—" : `${Math.round(v * 1000) / 10}%`;
    const num = (v) => (v === null || v === undefined) ? "—" : v;
    const FIELDS = [
      ["eqfs_scheduled", "Equifits Scheduled", num],
      ["eqfs_completed", "Equifits Completed", num],
      ["comppt_scheduled", "CPTs Scheduled", num],
      ["comppt_completed", "CPTs Completed", num],
      ["active_clients", "Active Clients", num],
      ["conversion_eqfs", "Conversion Equifits", num],
      ["ftbs_generated", "FTBs Generated", num],
      ["conversion_rate", "Conversion Rate", pct],
      ["lost_clients", "Lost Clients", num],
      ["total_sessions", "Total Sessions", num],
      ["active_weeks", "Active Weeks", num],
      ["avg_weekly_sessions", "Avg Weekly Sessions", num],
      ["recurring_clients", "Recurring Clients", num],
      ["pct_recurring_clients", "% Recurring Clients", pct],
      ["ftb_clients", "FTB Clients", num],
      ["repurchased_clients", "Repurchased Clients", num],
      ["repurchase_rate", "Repurchase Rate", pct],
    ];
    const rows = FIELDS.map(([key, label, fmt]) => `
      <div class="baseline-item"><span class="baseline-lbl">${escapeHtml(label)}</span><span class="baseline-val">${escapeHtml(String(fmt(r[key])))}</span></div>`).join("");
    return `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">Business Performance</span><span class="label-xs">Not scored — supporting evidence only</span></div>
        <div class="baseline-strip">${rows}</div>
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

  /* ═══════════════════════════════════════════════════════════
     MODAL — accessible ranking popups (Overview/Professionalism/
     Performance "Average X / Coach" cards). No static container
     exists in index.html; the root is created lazily on first use
     so this file is fully self-contained. Backdrop click, Escape,
     and an explicit close button all close it; only one modal is
     ever open at a time.
  ═══════════════════════════════════════════════════════════ */
  function ensureModalRoot() {
    let root = document.getElementById("app-modal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "app-modal-root";
      document.body.appendChild(root);
    }
    return root;
  }
  function handleModalKeydown(e) { if (e.key === "Escape") closeModal(); }
  function closeModal() {
    const root = document.getElementById("app-modal-root");
    if (root) root.innerHTML = "";
    document.removeEventListener("keydown", handleModalKeydown);
  }
  function openModal({ title, subtitle, bodyHtml }) {
    const root = ensureModalRoot();
    root.innerHTML = `
      <div class="modal-backdrop" onclick="COMPONENTS.closeModal()">
        <div class="modal-card" onclick="event.stopPropagation()" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
          <div class="modal-head">
            <div>
              <div class="modal-title">${escapeHtml(title)}</div>
              ${subtitle ? `<div class="modal-sub">${escapeHtml(subtitle)}</div>` : ""}
            </div>
            <button type="button" class="modal-close" onclick="COMPONENTS.closeModal()" aria-label="Close">&times;</button>
          </div>
          <div class="modal-body">${bodyHtml}</div>
        </div>
      </div>`;
    document.addEventListener("keydown", handleModalKeydown);
    const closeBtn = root.querySelector(".modal-close");
    if (closeBtn) closeBtn.focus();
  }

  /* Ranking table — rows must already be sorted (descending) by the
     caller; this only renders the 1-based rank column plus whatever
     columns are supplied. `format` is optional per-column formatting. */
  function rankingTableHtml({ columns, rows }) {
    const headHtml = columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join("");
    const bodyHtml = rows.map((r, i) => `
      <tr>
        <td class="modal-rank-cell">${i + 1}</td>
        ${columns.map(c => `<td>${c.format ? c.format(r[c.key], r) : escapeHtml(r[c.key] === null || r[c.key] === undefined ? "—" : String(r[c.key]))}</td>`).join("")}
      </tr>`).join("");
    return `<div class="modal-table-wrap"><table class="modal-table"><thead><tr><th></th>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
  }

  /* High-level ranking modal — pairs the portfolio-average banner with the
     ranking table and opens it. Every "Average X / Coach" card in
     Overview/Professionalism/Performance calls this with real rows only
     — never a fabricated ranking. */
  function openRankingModal({ title, subtitle, averageLabel, averageValueText, columns, rows, emptyMessage }) {
    const avgHtml = averageValueText
      ? `<div class="modal-average"><span class="label-xs">${escapeHtml(averageLabel || "Portfolio Average")}</span><span class="modal-average-val">${escapeHtml(averageValueText)}</span></div>`
      : "";
    const tableHtml = (rows && rows.length) ? rankingTableHtml({ columns, rows }) : dataPendingBlock(emptyMessage || "No eligible coaches for this view.");
    openModal({ title, subtitle, bodyHtml: `${avgHtml}${tableHtml}` });
  }

  /* Pillar Score deep-dive modal — opened by clicking a Performance /
     Professionalism / Programming score card (Overview and each pillar
     page). Three parts, in order: the competency-level breakdown for
     the current filtered pool (same bar style as the coach profile and
     pillar pages — never a new visual language), a week-over-week trend
     of the portfolio-average pillar score (window.TRENDS.orgSeries,
     same "needs 2+ captures" gate as Overview's Week-Over-Week Trends
     section — never a misleading single-point line), then the full
     per-coach ranking. trendSeries is optional — pass null/undefined
     if the caller has no trend path for this metric. */
  function pillarScoreModal({ title, subtitle, weightLabel, pillarScore, pillarCoverageLabel, pillarDetail, ranking, trendSeries, trendLabel }) {
    const breakdownHtml = `<div class="section-block">${competencyCategoryDetail(weightLabel, pillarScore, pillarCoverageLabel, pillarDetail)}</div>`;
    let trendHtml = "";
    if (trendSeries) {
      trendHtml = trendSeries.totalCaptures >= 2
        ? `<div class="section-block"><div class="card card-pad"><div class="section-header"><span class="label-sm">${escapeHtml(trendLabel || "Trend")}</span><span class="label-xs">${trendSeries.weeksCaptured} week${trendSeries.weeksCaptured === 1 ? "" : "s"} on record</span></div>${window.CHARTS.lineChart({ series: [{ label: trendLabel || "Score", color: "#1a1a1a", area: true, values: trendSeries.values.map(v => v || 0) }], xLabels: trendSeries.xLabels, unit: "" })}</div></div>`
        : `<div class="section-block">${dataPendingBlock(`${trendSeries.totalCaptures} of 2+ snapshots captured — trend line appears once a second weekly snapshot lands.`)}</div>`;
    }
    const avgHtml = `<div class="modal-average"><span class="label-xs">Portfolio Average</span><span class="modal-average-val">${ranking.average !== null && ranking.average !== undefined ? Math.round(ranking.average * 10) / 10 : "—"}</span></div>`;
    const tableHtml = (ranking.rows && ranking.rows.length)
      ? rankingTableHtml({ columns: [{ key: "display_name", label: "Coach" }, { key: "club_name", label: "Club" }, { key: "score", label: "Score" }, { key: "band", label: "Status Band" }], rows: ranking.rows })
      : dataPendingBlock("No coaches have a rated score for this pillar in the current filter.");
    openModal({ title, subtitle, bodyHtml: `${breakdownHtml}${trendHtml}${avgHtml}${tableHtml}` });
  }

  /* ── KPI Performance Index card (Overview, primary Overall Performance
     Score) — entirely separate from the competency score below it. ── */
  function kpiIndexCard(kpiIndex) {
    const hasIndex = kpiIndex.index !== null && kpiIndex.index !== undefined;
    const scoreText = hasIndex ? String(kpiIndex.index) : "—";
    const band = hasIndex ? window.CALC.statusBandFor(kpiIndex.index) : null;
    return `
      <div class="card card-pad">
        <div class="section-header">
          <span class="label-sm">KPI Performance Index</span>
          <span class="label-xs" style="text-transform:none;letter-spacing:0">${escapeHtml(kpiIndex.coverageLabel)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:20px">
          ${window.CHARTS.ring({ score: hasIndex ? kpiIndex.index : 0, size: 84, stroke: 7, color: hasIndex ? undefined : "var(--light-gray)", numSize: 24, showLabel: hasIndex })}
          <div>
            <div style="font-size:30px;font-weight:700;letter-spacing:-1px;color:var(--off-black)">${scoreText}</div>
            <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:4px">${hasIndex ? band.label : "Data pending"}</div>
          </div>
        </div>
        <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:12px;color:var(--mid-gray)">Derived from available portfolio KPI evidence</div>
      </div>`;
  }

  /* ── Competency Score card — kept fully separate from the KPI Index
     above; never merged, never substituted, never shown as a fabricated
     0 while ratings are pending. ── */
  function competencyScoreCard(scoredAgg) {
    const meets = scoredAgg.score_coverage.meets_threshold;
    const scoreText = meets ? String(scoredAgg.overall_score) : "—";
    const sub = meets ? window.CALC.statusBandFor(scoredAgg.overall_score).label : `Data pending — ${scoredAgg.coverage_label}`;
    return `
      <div class="card card-pad">
        <div class="section-header">
          <span class="label-sm">Competency Score</span>
          <span class="label-xs" style="text-transform:none;letter-spacing:0">${escapeHtml(scoredAgg.coverage_label)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:20px">
          ${window.CHARTS.ring({ score: meets ? scoredAgg.overall_score : 0, size: 84, stroke: 7, color: meets ? undefined : "var(--light-gray)", numSize: 24, showLabel: meets })}
          <div>
            <div style="font-size:30px;font-weight:700;letter-spacing:-1px;color:var(--off-black)">${scoreText}</div>
            <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:4px">${escapeHtml(sub)}</div>
          </div>
        </div>
        <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:12px;color:var(--mid-gray)">Performance 50% + Professionalism 30% + Programming 20%</div>
      </div>`;
  }

  window.COMPONENTS = {
    icon, escapeHtml, badgeForScore, mappingBadge, overallScoreDisplay, coverageBadge, dataPendingBlock,
    kpiCard, targetBar, competencyBar, competencyCategoryDetail, evidenceRow, curriculumProgressCard, leadTotalsCard,
    selfAssessmentPillarCard, selfAssessmentSummaryCard, developmentFocusCard, businessPerformanceCard,
    clubFilterOptionsHtml, coachCard, groupedCoachOptionsHtml, pillarEntryCard, curriculumSummaryCompact,
    openModal, closeModal, openRankingModal, rankingTableHtml, pillarScoreModal, kpiIndexCard, competencyScoreCard, ICONS,
  };
})();
