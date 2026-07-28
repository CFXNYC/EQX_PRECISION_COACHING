/* ═══════════════════════════════════════════════════════════
   PAGE — COACH
   ---------------------------------------------------------
   Roster: search by name/club, filter by club, performance-data
   availability, and performance band. Profile: Performance
   Summary, KPI Breakdown, Wins, Opportunities, Next Steps.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;
  const C = window.CALC;
  const CH = window.CHARTS;
  const K = window.COMPONENTS;
  const RECS = window.RECS;

  const state = { mode: "picker", selectedId: null, search: "", clubFilter: "ALL", statusFilter: "ALL", bandFilter: "ALL" };

  /* ═══════════════════════════════ PICKER ═══════════════════════════════ */
  function clubFilterOptionsHtml() {
    const opts = [`<option value="ALL">All Clubs</option>`];
    D.clubs.forEach(c => opts.push(`<option value="${c.club_number}">${K.escapeHtml(c.club_name)}</option>`));
    return opts.join("");
  }
  function statusFilterOptionsHtml() {
    return [
      `<option value="ALL">All Coaches</option>`,
      `<option value="matched">Has Performance Data</option>`,
      `<option value="no_kpi_data">No Performance Data</option>`,
    ].join("");
  }
  function bandFilterOptionsHtml() {
    const opts = [`<option value="ALL">All Performance Bands</option>`];
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
          const insufficient = !!c.raw_performance && (!c.score_coverage || !c.score_coverage.meets_threshold);
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
          <div class="select-wrap"><select onchange="PAGE_COACH.onClubFilterChange(this.value)">${clubFilterOptionsHtml()}</select></div>
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
    const scoreInfo = K.overallScoreDisplay(coach);
    return `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">Performance Summary</span>${K.coverageBadge(coach.score_coverage.overall_coverage, coach.score_coverage.meets_threshold)}</div>
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">
          ${CH.ring({ score: coach.overall_score || 0, size: 84, stroke: 7, color: coach.score_coverage.meets_threshold ? undefined : "var(--light-gray)", numSize: 24, showLabel: coach.score_coverage.meets_threshold })}
          <div>
            <div class="label-xs">Overall Score</div>
            <div style="font-size:20px;font-weight:700;color:var(--off-black);margin-top:4px">${scoreInfo.text}</div>
            <div class="label-xs" style="margin-top:2px;text-transform:none;letter-spacing:0">${K.escapeHtml(scoreInfo.sub)}</div>
          </div>
        </div>
        <div class="grid-3">
          ${K.scoreCategoryDetail("Production · 50%", coach.production_score, coach.score_coverage.production_coverage, coach.score_detail.production)}
          ${K.scoreCategoryDetail("Process · 30%", coach.process_score, coach.score_coverage.process_coverage, coach.score_detail.process)}
          ${K.scoreCategoryDetail("Persistence · 20%", coach.persistence_score, coach.score_coverage.persistence_coverage, coach.score_detail.persistence)}
        </div>
      </div>`;
  }

  function renderKpiBreakdown(coach) {
    const m = coach.calculated_metrics;
    const pctOrDash = (v) => (v === null || v === undefined ? "—" : `${Math.round(v * 1000) / 10}%`);
    const numOrDash = (v, d) => (v === null || v === undefined ? "—" : Math.round(v * Math.pow(10, d || 0)) / Math.pow(10, d || 0));
    const rows = [
      ["Conversion Rate", pctOrDash(m.conversion_rate)],
      ["Activity Volume", numOrDash(m.activity_volume)],
      ["Active Clients", numOrDash(m.active_clients)],
      ["Avg Weekly Sessions", numOrDash(m.avg_weekly_sessions, 1)],
      ["Total Sessions (cumulative)", numOrDash(m.total_sessions, 1)],
      ["Equifits Completed", numOrDash(m.eqfs_completed)],
      ["Equifits Scheduled", numOrDash(m.eqfs_scheduled)],
      ["CPTs Completed", numOrDash(m.comppt_completed)],
      ["CPTs Scheduled", numOrDash(m.comppt_scheduled)],
      ["Recurring Clients", numOrDash(m.recurring_clients)],
      ["Recurring Rate", pctOrDash(m.recurring_rate)],
      ["First-Time-Booked Clients", numOrDash(m.ftb_clients)],
      ["Repurchased Clients", numOrDash(m.repurchased_clients)],
      ["Repurchase Rate", pctOrDash(m.repurchase_rate)],
      ["Lost Clients", numOrDash(m.lost_clients)],
      ["Employment Status", m.coach_status || "—"],
      ["Hire Date", m.hire_dt || "—"],
      ["Roster Hire Date", coach.directory_hire_date || "—"],
      ["Termination Date", m.termination_dt || "—"],
      ["Position", m.job_desc || "—"],
    ];
    return `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">KPI Breakdown</span></div>
        <div class="baseline-strip">
          ${rows.map(([lbl, val]) => `<div class="baseline-item"><span class="baseline-lbl">${K.escapeHtml(lbl)}</span><span class="baseline-val">${K.escapeHtml(String(val))}</span></div>`).join("")}
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
        <div class="empty-state" style="margin-top:14px">No Performance Data — this coach is part of the approved pilot roster but has no performance record for this reporting period.</div>
      </div>`;
  }

  function renderProfile(container, coachId) {
    const coach = C.getCoach(coachId);
    if (!coach) { renderPicker(container); return; }
    const isNoKpi = coach.mapping_status === "no_kpi_data";
    const scoreInfo = K.overallScoreDisplay(coach);
    const band = (!isNoKpi && coach.score_coverage.meets_threshold) ? C.statusBandFor(coach.overall_score) : null;

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
          ${!isNoKpi ? `<span class="badge badge-${band ? band.tone : "foundation"}" style="font-size:11px;padding:5px 14px">${K.escapeHtml(scoreInfo.sub)}${band ? " · " + scoreInfo.text : ""}</span>` : ""}
        </div>
      </div>
      ${isNoKpi
        ? `<div class="section-block">${renderNoKpiProfile(coach)}</div>`
        : `
          <div class="section-block">${renderPerformanceSummary(coach)}</div>
          <div class="section-block">${renderKpiBreakdown(coach)}</div>
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
