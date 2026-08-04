/* ═══════════════════════════════════════════════════════════
   PAGE — COACH
   ---------------------------------------------------------
   Roster: search by name/club, filter by club, KPI-evidence
   availability, and status band. Profile: Performance Summary
   (competency-based, 3 pillars + radar), Performance Evidence
   (KPIs, never scored), curriculum progress, period trend,
   Wins/Opportunities/Next Steps.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;
  const C = window.CALC;
  const CH = window.CHARTS;
  const K = window.COMPONENTS;
  const RECS = window.RECS;

  const state = { mode: "picker", selectedId: null, search: "", clubFilter: "ALL", statusFilter: "ALL", bandFilter: "ALL" };

  /* ═══════════════════ CLUB PORTFOLIO DRILL-THROUGH (Phase 4) ═══════════
     Binding, ID-based end to end: STATE.selectedClubId is always the raw
     club_id string (see js/app.js's viewCoachAnalyticsForClub). Matched
     against coach.club_number by strict string equality only, in
     filteredCoaches() below — never via CLUB_NORM, canonical names, or
     display-name aliases. Subscribing here (not just reading once at
     render()) means a drill-through click works whether the user is
     already on the Coach tab or navigating to it. */
  if (window.STATE) {
    const initialClubId = window.STATE.getState().selectedClubId;
    if (initialClubId) state.clubFilter = String(initialClubId);
    window.STATE.subscribe((next, prev) => {
      if (next.selectedClubId === prev.selectedClubId) return;
      state.clubFilter = next.selectedClubId ? String(next.selectedClubId) : "ALL";
      if (state.mode === "picker") render();
    });
  }

  /* ═══════════════════════════════ PICKER ═══════════════════════════════ */
  function statusFilterOptionsHtml() {
    return [
      `<option value="ALL">All Coaches</option>`,
      `<option value="matched">Has KPI Evidence</option>`,
      `<option value="no_kpi_data">No KPI Evidence</option>`,
    ].join("");
  }
  function bandFilterOptionsHtml() {
    const opts = [`<option value="ALL">All Status Bands</option>`];
    C.STATUS_BANDS.slice().reverse().forEach(b => opts.push(`<option value="${b.label}">${b.label}</option>`));
    opts.push(`<option value="INSUFFICIENT">Insufficient Data</option>`);
    return opts.join("");
  }

  function filteredCoaches() {
    const q = state.search.trim().toLowerCase();
    return D.coaches.filter((c) => {
      if (q) {
        const nameMatch = c.display_name.toLowerCase().includes(q);
        const clubMatch = (c.club_name || "").toLowerCase().includes(q);
        if (!nameMatch && !clubMatch) return false;
      }
      if (state.clubFilter !== "ALL") {
        if (c.club_number !== state.clubFilter) return false;
      }
      if (state.statusFilter !== "ALL" && c.mapping_status !== state.statusFilter) return false;
      if (state.bandFilter !== "ALL") {
        if (state.bandFilter === "INSUFFICIENT") {
          const insufficient = C.hasCompetencyScore(c) && (!c.score_coverage || !c.score_coverage.meets_threshold);
          if (!insufficient) return false;
        } else if (c.performance_band !== state.bandFilter) {
          return false;
        }
      }
      return true;
    });
  }

  function renderPickerGrid() {
    const list = filteredCoaches();
    const countLabel = document.getElementById("coach-count-label");
    if (countLabel) countLabel.textContent = `${list.length} of ${D.coaches.length} coaches across ${D.clubs.length} pilot clubs`;
    document.getElementById("coach-picker-grid").innerHTML = list.length
      ? list.map(K.coachCard).join("")
      : `<div class="empty-state">No coaches match the current filters.</div>`;
  }

  function renderPicker(container) {
    container.innerHTML = `
      <div class="section-block">
        <div class="coach-search-bar">
          <div class="search-wrap">
            ${K.icon("search", 13)}
            <input type="text" id="coach-search-input" placeholder="Search coaches or clubs..." oninput="PAGE_COACH.onSearch(this.value)">
          </div>
        </div>
        <div class="filter-bar">
          <div class="select-wrap"><select onchange="PAGE_COACH.onClubFilterChange(this.value)">${K.clubFilterOptionsHtml(D.clubs, state.clubFilter)}</select></div>
          <div class="select-wrap"><select onchange="PAGE_COACH.onStatusFilterChange(this.value)">${statusFilterOptionsHtml()}</select></div>
          <div class="select-wrap"><select onchange="PAGE_COACH.onBandFilterChange(this.value)">${bandFilterOptionsHtml()}</select></div>
          <span class="label-xs" id="coach-count-label"></span>
        </div>
        <div class="coach-grid" id="coach-picker-grid"></div>
      </div>`;
    renderPickerGrid();
  }

  function onSearch(v) { state.search = v; renderPickerGrid(); }
  function onClubFilterChange(v) { state.clubFilter = v; renderPickerGrid(); }
  function onStatusFilterChange(v) { state.statusFilter = v; renderPickerGrid(); }
  function onBandFilterChange(v) { state.bandFilter = v; renderPickerGrid(); }

  /* ═══════════════════════════════ PROFILE ═══════════════════════════════ */
  function renderPerformanceSummary(coach) {
    const hasScoreData = C.hasCompetencyScore(coach);
    if (!hasScoreData) {
      return `<div class="card card-pad"><div class="section-header"><span class="label-sm">Performance Summary</span></div>${K.dataPendingBlock("No competency ratings on record for this coach yet.")}</div>`;
    }
    const scoreInfo = K.overallScoreDisplay(coach);
    const detail = coach.score_detail || {};
    const labels = coach.pillar_coverage_labels || {};
    const axes = [], values = [];
    ["performance", "programming", "professionalism"].forEach((pillar) => {
      Object.values(detail[pillar] || {}).forEach((m) => { axes.push(m.label); values.push(m.available ? m.normalized : 0); });
    });
    return `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">Performance Summary</span><span class="label-xs" style="text-transform:none;letter-spacing:0">${K.escapeHtml(coach.coverage_label)}</span></div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;flex-wrap:wrap">
          ${CH.ring({ score: coach.overall_score || 0, size: 84, stroke: 7, color: coach.score_coverage.meets_threshold ? undefined : "var(--light-gray)", numSize: 24, showLabel: coach.score_coverage.meets_threshold })}
          <div>
            <div class="label-xs">Overall Score</div>
            <div style="font-size:20px;font-weight:700;color:var(--off-black);margin-top:4px">${scoreInfo.text}</div>
            <div class="label-xs" style="margin-top:2px;text-transform:none;letter-spacing:0">${K.escapeHtml(scoreInfo.sub)}</div>
          </div>
          <div style="flex:1;min-width:220px;max-width:280px;margin-left:auto">
            ${CH.radar({ axes, series: [{ values, color: "#1a1a1a" }] })}
          </div>
        </div>
        <div class="grid-3">
          ${K.competencyCategoryDetail("Performance · 50%", coach.performance_score, labels.performance, detail.performance)}
          ${K.competencyCategoryDetail("Professionalism · 30%", coach.professionalism_score, labels.professionalism, detail.professionalism)}
          ${K.competencyCategoryDetail("Programming · 20%", coach.programming_score, labels.programming, detail.programming)}
        </div>
      </div>`;
  }

  function renderKpiBreakdown(coach) {
    const curriculum = C.curriculumProgress(coach);
    const periods = C.kpiPeriods(coach);
    let periodsHtml = "";
    if (periods.length) {
      const series = [{ label: "Conversion %", color: "#1a1a1a", area: true, values: periods.map(p => p.conv_pct || 0) }];
      periodsHtml = `
        <div class="section-block">
          <div class="card card-pad">
            <div class="section-header"><span class="label-sm">Conversion Trend</span><span class="label-xs">${periods.length} weekly periods on record</span></div>
            ${CH.lineChart({ series, xLabels: periods.map(p => p.periodLabel), unit: "%" })}
          </div>
        </div>`;
    }
    const m = coach.calculated_metrics;
    const detailRows = [
      ["Employment Status", m ? m.coach_status : null],
      ["Hire Date", m ? m.hire_dt : null],
      ["Roster Hire Date", coach.directory_hire_date],
      ["Termination Date", m ? m.termination_dt : null],
      ["Position", m ? m.job_desc : null],
    ];
    return `
      <div class="section-block">
        <div class="card card-pad">
          <div class="section-header"><span class="label-sm">Performance Evidence</span><span class="label-xs">Not scored — supporting evidence only</span></div>
          <div class="label-xs" style="margin:4px 0">Performance</div>
          ${K.evidenceRow(C.pillarEvidence(coach, "performance"))}
          <div class="label-xs" style="margin:14px 0 4px">Programming</div>
          ${K.evidenceRow(C.pillarEvidence(coach, "programming"))}
          <div class="label-xs" style="margin:14px 0 4px">Professionalism</div>
          ${K.evidenceRow(C.pillarEvidence(coach, "professionalism"))}
        </div>
      </div>
      <div class="section-block">${K.curriculumProgressCard(curriculum)}</div>
      <div class="section-block">${K.selfAssessmentSummaryCard(coach.self_assessment)}</div>
      ${periodsHtml}
      <div class="section-block">
        <div class="card card-pad">
          <div class="section-header"><span class="label-sm">Coach Details</span></div>
          <div class="baseline-strip">
            ${detailRows.map(([lbl, val]) => `<div class="baseline-item"><span class="baseline-lbl">${K.escapeHtml(lbl)}</span><span class="baseline-val">${K.escapeHtml(val || "—")}</span></div>`).join("")}
          </div>
        </div>
      </div>`;
  }

  function renderIntelligence(coach) {
    const rec = RECS.coachIntelligence(coach.coach_id);
    return `
      <div class="intel-grid">
        <div class="intel-card">
          <div class="intel-icon-wrap wins">${K.icon("trend", 16)}</div>
          <div class="intel-head wins">Wins</div>
          <div class="intel-body"><ul>${rec.strengths.map(s => `<li>${K.escapeHtml(s)}</li>`).join("")}</ul></div>
        </div>
        <div class="intel-card">
          <div class="intel-icon-wrap opps">${K.icon("flag", 16)}</div>
          <div class="intel-head opps">Opportunities</div>
          <div class="intel-body"><ul>${rec.opportunities.map(o => `<li>${K.escapeHtml(o)}</li>`).join("")}</ul></div>
        </div>
        <div class="intel-card">
          <div class="intel-icon-wrap next">${K.icon("zap", 16)}</div>
          <div class="intel-head next">Next Steps</div>
          <div class="intel-body"><ul>${rec.nextSteps.map(n => `<li>${K.escapeHtml(n)}</li>`).join("")}</ul></div>
        </div>
      </div>`;
  }

  function renderNoKpiProfile(coach) {
    return `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">Coach Information</span></div>
        <div class="baseline-strip">
          <div class="baseline-item"><span class="baseline-lbl">Club</span><span class="baseline-val">${K.escapeHtml(coach.club_name || "—")}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Job Title</span><span class="baseline-val">${K.escapeHtml(coach.job_title || "—")}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Cohort</span><span class="baseline-val">${K.escapeHtml(coach.cohort || "—")}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Roster Status</span><span class="baseline-val">${K.escapeHtml(coach.roster_status || "—")}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Email</span><span class="baseline-val">${K.escapeHtml(coach.email || "—")}</span></div>
          <div class="baseline-item"><span class="baseline-lbl">Hire Date</span><span class="baseline-val">${K.escapeHtml(coach.directory_hire_date || "—")}</span></div>
        </div>
        <div class="empty-state" style="margin-top:14px">No KPI evidence — this coach is part of the approved pilot roster but has no KPI evidence record for this reporting period.</div>
      </div>`;
  }

  function renderProfile(container, coachId) {
    const coach = C.getCoach(coachId);
    if (!coach) { renderPicker(container); return; }
    const hasKpiEvidence = coach.mapping_status !== "no_kpi_data";
    const hasScoreData = C.hasCompetencyScore(coach);
    const scoreInfo = K.overallScoreDisplay(coach);
    const band = (hasScoreData && coach.score_coverage.meets_threshold) ? C.statusBandFor(coach.overall_score) : null;

    container.innerHTML = `
      <div class="section-block">
        <span class="back-btn" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-size:11px;color:var(--dark-gray);font-family:'DM Mono',monospace" onclick="PAGE_COACH.backToPicker()">← All Coaches</span>
      </div>
      <div class="section-block" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div class="page-title">${K.escapeHtml(coach.display_name)}</div>
          <div class="page-sub">${K.escapeHtml(coach.club_name || "—")}${coach.job_title ? " · " + K.escapeHtml(coach.job_title) : ""}${coach.cohort ? " · " + K.escapeHtml(coach.cohort) : ""}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${K.mappingBadge(coach.mapping_status)}
          ${hasScoreData
            ? `<span class="badge badge-${band ? band.tone : "foundation"}" style="font-size:11px;padding:5px 14px">${K.escapeHtml(scoreInfo.sub)}${band ? " · " + scoreInfo.text : ""}</span>`
            : `<span class="badge badge-no-kpi" style="font-size:11px;padding:5px 14px">Data pending</span>`}
        </div>
      </div>
      ${!hasKpiEvidence && !hasScoreData
        ? `<div class="section-block">${renderNoKpiProfile(coach)}</div>`
        : `
          <div class="section-block">${renderPerformanceSummary(coach)}</div>
          ${hasKpiEvidence ? renderKpiBreakdown(coach) : `<div class="section-block">${K.dataPendingBlock("No KPI evidence on record for this coach yet.")}</div>`}
          <div class="section-block">${K.developmentFocusCard(RECS.primaryDevelopmentFocus(coach.coach_id))}</div>
          <div class="section-block">
            <div class="section-header"><span class="label-sm">Coaching Intelligence</span></div>
            ${renderIntelligence(coach)}
          </div>`}
    `;
  }

  /* ═══════════════════════════════ ENTRY ═══════════════════════════════ */
  function select(coachId) { state.mode = "profile"; state.selectedId = coachId; render(); }
  function backToPicker() { state.mode = "picker"; state.selectedId = null; render(); }

  function render() {
    const el = document.getElementById("view-coach");
    el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="page-title">${state.mode === "picker" ? "Coach" : ""}</div>
          ${state.mode === "picker" ? `<div class="page-sub">Search or filter to find a coach, then select a profile for the full performance breakdown.</div>` : ""}
        </div>
        <div id="coach-content"></div>
      </div>`;
    const container = document.getElementById("coach-content");
    if (state.mode === "profile" && state.selectedId) renderProfile(container, state.selectedId);
    else renderPicker(container);
  }

  window.PAGE_COACH = { render, select, backToPicker, onSearch, onClubFilterChange, onStatusFilterChange, onBandFilterChange };
})();
