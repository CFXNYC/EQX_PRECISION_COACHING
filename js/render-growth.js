/* ═══════════════════════════════════════════════════════════
   PAGE — GROWTH
   ---------------------------------------------------------
   Shows a current-state Three Ps comparison: Production / Process /
   Persistence component breakdowns with target-vs-actual bars, for
   either the pilot aggregate or an individual coach.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;
  const C = window.CALC;
  const K = window.COMPONENTS;

  const state = { coachId: "ALL" };

  function coachOptionsHtml() {
    return `<option value="ALL">All Coaches — Pilot Aggregate</option>${K.groupedCoachOptionsHtml(C.allApprovedCoaches())}`;
  }

  /* Builds a score-shaped object for either "ALL" (org aggregate, scored
     against the same Three Ps targets via CALC.scoreAggregateMetrics) or
     a single coach (already scored — read directly off the coach object). */
  function currentScoreData() {
    if (state.coachId === "ALL") {
      const scoreable = C.scoreableCoaches();
      const orgAgg = C.orgAggregateMetrics(scoreable);
      const avgActiveClients = orgAgg.coach_count ? orgAgg.active_clients / orgAgg.coach_count : null;
      const values = {
        active_clients: avgActiveClients,
        conversion_rate: orgAgg.conversion_rate,
        equifits_per_month: orgAgg.equifits_per_month,
        cpt_per_week: orgAgg.cpt_per_week,
        sessions_per_month: orgAgg.sessions_per_month,
      };
      const scored = C.scoreAggregateMetrics(values);
      return { label: "All Coaches — Pilot Aggregate", ...scored };
    }
    const coach = C.getCoach(state.coachId);
    if (!coach) return null;
    if (!coach.raw_performance) return { label: coach.display_name, noPerformanceData: true };
    return {
      label: coach.display_name,
      production_score: coach.production_score, process_score: coach.process_score,
      persistence_score: coach.persistence_score, overall_score: coach.overall_score,
      score_coverage: coach.score_coverage, score_detail: coach.score_detail,
    };
  }

  function renderScoreCards() {
    const el = document.getElementById("growth-score-cards");
    const data = currentScoreData();
    if (!data) { el.innerHTML = `<div class="empty-state">No coach selected.</div>`; return; }
    if (data.noPerformanceData) {
      el.innerHTML = `<div class="card card-pad"><div class="section-header"><span class="label-sm">${K.escapeHtml(data.label)}</span></div><div class="empty-state">No Performance Data available for this coach yet.</div></div>`;
      return;
    }

    const overallText = data.score_coverage.meets_threshold ? String(data.overall_score) : "—";
    const overallSub = data.score_coverage.meets_threshold
      ? C.statusBandFor(data.overall_score).label
      : "Insufficient data to calculate a reliable score";

    el.innerHTML = `
      <div class="card card-pad" style="margin-bottom:16px">
        <div class="section-header">
          <span class="label-sm">Overall Three Ps Score — ${K.escapeHtml(data.label)}</span>
          ${K.coverageBadge(data.score_coverage.overall_coverage, data.score_coverage.meets_threshold)}
        </div>
        <div style="display:flex;align-items:baseline;gap:12px">
          <div class="score-category-num" style="font-size:44px">${overallText}</div>
          <div class="label-xs">${K.escapeHtml(overallSub)}</div>
        </div>
      </div>
      <div class="grid-3">
        ${K.scoreCategoryDetail("Production · 50%", data.production_score, data.score_coverage.production_coverage, data.score_detail.production)}
        ${K.scoreCategoryDetail("Process · 30%", data.process_score, data.score_coverage.process_coverage, data.score_detail.process)}
        ${K.scoreCategoryDetail("Persistence · 20%", data.persistence_score, data.score_coverage.persistence_coverage, data.score_detail.persistence)}
      </div>`;

    const link = document.getElementById("growth-profile-link");
    if (link) {
      link.innerHTML = state.coachId === "ALL" ? "" : `<span class="view-link" onclick="App.showCoach('${state.coachId}')" style="cursor:pointer;color:var(--dark-gray);font-family:'DM Mono',monospace;font-size:11px">View full coach profile →</span>`;
    }
  }

  function onCoachChange(val) { state.coachId = val; renderScoreCards(); }

  function render() {
    const el = document.getElementById("view-growth");
    el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="page-title">Growth</div>
          <div class="page-sub">Is the coach improving? Review current Three Ps performance against established targets for the pilot or an individual coach.</div>
        </div>

        <div class="section-block">
          <div class="coach-search-bar">
            <div class="select-wrap">
              <select id="growth-coach-select" onchange="PAGE_GROWTH.onCoachChange(this.value)">${coachOptionsHtml()}</select>
            </div>
            <div id="growth-profile-link"></div>
          </div>
        </div>

        <div class="section-block" id="growth-score-cards"></div>
      </div>`;
    renderScoreCards();
  }

  window.PAGE_GROWTH = { render, onCoachChange };
})();
