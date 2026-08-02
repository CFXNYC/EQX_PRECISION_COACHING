/* ═══════════════════════════════════════════════════════════
   PAGE — PROGRAMMING
   ---------------------------------------------------------
   Weeks 9–12 of the Precision Coaching curriculum. Competency
   scope: Structure, Coaching, Recommendation only. Curriculum
   Progress is placed prominently near the top of this page per
   product spec. Evidence: Program Repurchase Rate; SPU has no
   source field anywhere in the supplied data and always reads
   Data pending (binding decision — see calculations.js's
   EVIDENCE_CONFIG.programming).

   CLUB PORTFOLIO DRILL-THROUGH — binding, ID-based end to end:
   the club filter here is driven by STATE.selectedClubId, always
   the raw club_id string (see js/app.js's viewCoachAnalyticsForClub).
   Coaches are matched by strict `coach.club_number === clubFilter`
   string equality only — never via CLUB_NORM, canonical names, or
   display-name aliases.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;
  const C = window.CALC;
  const K = window.COMPONENTS;

  const state = { coachId: "ALL", clubFilter: "ALL" };

  const PROGRAM_FOCUS = ["The Equifit Experience", "Coaching, Cueing and Session Structure", "Movement Patterns, Exercise Selection and Tools", "Reassessments, Recommendations and Repurchases"];

  if (window.STATE) {
    const initialClubId = window.STATE.getState().selectedClubId;
    if (initialClubId) state.clubFilter = String(initialClubId);
    window.STATE.subscribe((next, prev) => {
      if (next.selectedClubId === prev.selectedClubId) return;
      state.clubFilter = next.selectedClubId ? String(next.selectedClubId) : "ALL";
      state.coachId = "ALL";
      render();
    });
  }

  function poolForClubFilter() {
    return state.clubFilter === "ALL" ? C.allApprovedCoaches() : C.allApprovedCoaches().filter(c => c.club_number === state.clubFilter);
  }

  function aggregateLabel() {
    if (state.clubFilter === "ALL") return "All Coaches — Pilot Aggregate";
    const club = D.clubs.find(c => c.club_number === state.clubFilter);
    return `All Coaches — ${club ? club.club_name : state.clubFilter}`;
  }

  function coachOptionsHtml() {
    return `<option value="ALL">${K.escapeHtml(aggregateLabel())}</option>${K.groupedCoachOptionsHtml(poolForClubFilter())}`;
  }

  function pseudoCoachFromAgg(orgAgg) {
    return { calculated_metrics: { repurchase_rate: orgAgg.repurchase_rate } };
  }

  function currentScoreData() {
    if (state.coachId === "ALL") {
      const pool = poolForClubFilter();
      const scoreable = C.scoreableCoaches().filter(c => pool.indexOf(c) !== -1);
      const matched = C.matchedCoaches().filter(c => pool.indexOf(c) !== -1);
      const avgCompetencies = C.orgAggregateCompetencies(scoreable);
      const scored = C.scoreAggregateCompetencies(avgCompetencies);
      const orgAgg = C.orgAggregateMetrics(matched);
      return { label: aggregateLabel(), isAggregate: true, orgAgg, coach: null, pool, ...scored };
    }
    const coach = C.getCoach(state.coachId);
    if (!coach) return null;
    return {
      label: coach.display_name, isAggregate: false, coach,
      performance_score: coach.performance_score, programming_score: coach.programming_score, professionalism_score: coach.professionalism_score,
      overall_score: coach.overall_score, score_coverage: coach.score_coverage, score_detail: coach.score_detail,
      coverage_label: coach.coverage_label, pillar_coverage_labels: coach.pillar_coverage_labels,
    };
  }

  function renderBody() {
    const el = document.getElementById("programming-body");
    const data = currentScoreData();
    if (!data) { el.innerHTML = K.dataPendingBlock("No coach selected."); return; }

    const meets = data.score_coverage.meets_threshold;
    const overallText = meets ? String(data.overall_score) : "—";
    const overallSub = meets ? C.statusBandFor(data.overall_score).label : `Data pending — ${data.coverage_label}`;
    const detail = data.score_detail || {};
    const labels = data.pillar_coverage_labels || {};

    const evidenceCoach = data.isAggregate ? pseudoCoachFromAgg(data.orgAgg) : data.coach;
    const programmingEvidence = C.pillarEvidence(evidenceCoach, "programming");

    const curriculumHtml = data.isAggregate
      ? K.curriculumSummaryCompact(C.curriculumProgressSummary(data.pool))
      : K.curriculumProgressCard(C.curriculumProgress(data.coach));

    el.innerHTML = `
      <div class="section-block grid-2">
        <div>${curriculumHtml}</div>
        <div class="card card-pad">
          <div class="section-header"><span class="label-sm">Program Focus — Weeks 9–12</span></div>
          <ul style="padding-left:16px;font-size:12px;color:var(--dark-gray);line-height:1.9">
            ${PROGRAM_FOCUS.map(t => `<li>${K.escapeHtml(t)}</li>`).join("")}
          </ul>
        </div>
      </div>

      <div class="card card-pad" style="margin-bottom:16px">
        <div class="section-header">
          <span class="label-sm">Overall Score — ${K.escapeHtml(data.label)}</span>
          <span class="label-xs" style="text-transform:none;letter-spacing:0">${K.escapeHtml(data.coverage_label)}</span>
        </div>
        <div style="display:flex;align-items:baseline;gap:12px">
          <div class="score-category-num" style="font-size:44px">${overallText}</div>
          <div class="label-xs">${K.escapeHtml(overallSub)}</div>
        </div>
      </div>

      <div class="section-block">
        ${K.competencyCategoryDetail("Programming · 30%", data.programming_score, labels.programming, detail.programming)}
      </div>

      <div class="section-block">
        <div class="section-header"><span class="label-sm">Programming Evidence</span><span class="label-xs">Not scored — supporting evidence only</span></div>
        ${K.evidenceRow(programmingEvidence)}
      </div>`;

    const link = document.getElementById("programming-profile-link");
    if (link) {
      link.innerHTML = state.coachId === "ALL" ? "" : `<span class="view-link" onclick="App.showCoach('${state.coachId}')" style="cursor:pointer;color:var(--dark-gray);font-family:'DM Mono',monospace;font-size:11px">View full coach profile →</span>`;
    }
  }

  function onCoachChange(val) { state.coachId = val; renderBody(); }
  function onClubFilterChange(val) { state.clubFilter = val; state.coachId = "ALL"; render(); }

  function render() {
    const el = document.getElementById("view-programming");
    el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="page-title">Programming</div>
          <div class="page-sub">Weeks 9–12 · Structure, Coaching, and Recommendation — the Equifit experience through reassessment and repurchase.</div>
        </div>

        <div class="section-block">
          <div class="coach-search-bar">
            <div class="select-wrap">
              <select id="programming-club-select" onchange="PAGE_PROGRAMMING.onClubFilterChange(this.value)">${K.clubFilterOptionsHtml(D.clubs, state.clubFilter)}</select>
            </div>
            <div class="select-wrap">
              <select id="programming-coach-select" onchange="PAGE_PROGRAMMING.onCoachChange(this.value)">${coachOptionsHtml()}</select>
            </div>
            <div id="programming-profile-link"></div>
          </div>
        </div>

        <div id="programming-body"></div>
      </div>`;
    renderBody();
  }

  window.PAGE_PROGRAMMING = { render, onCoachChange, onClubFilterChange };
})();
