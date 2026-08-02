/* ═══════════════════════════════════════════════════════════
   PAGE — PERFORMANCE
   ---------------------------------------------------------
   Weeks 5–8 of the Precision Coaching curriculum. Competency
   scope: Engaging, Closing, Reframing only. Club Lead Totals sit
   high on this page, immediately below the summary/filters,
   clearly labeled club-level only — never attributed to an
   individual coach (binding rule, see lead_tracker_summary.json
   in calculations.js's EVIDENCE_CONFIG header). Diagnosis is
   evidence-gated (RECS.diagnoseCoach) — never rendered without
   supporting evidence.

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
  const CH = window.CHARTS;
  const RECS = window.RECS;

  const state = { coachId: "ALL", clubFilter: "ALL" };

  const PROGRAM_FOCUS = ["Developing a Pipeline", "Lead Management and Follow-Up", "Relationship Management and Client Retention", "Sales, Closing and Objection Handling"];

  const DIAGNOSIS_LABELS = {
    conversion_value_gap: "Conversion & Value Gap",
    pipeline_generation_gap: "Pipeline-Generation Gap",
    program_design_gap: "Program Design Gap",
    retention_opportunity: "Retention Opportunity",
    closing_opportunity: "Closing Opportunity",
  };

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
    return {
      calculated_metrics: {
        active_clients: orgAgg.coach_count ? orgAgg.active_clients / orgAgg.coach_count : null,
        conversion_rate: orgAgg.conversion_rate,
        comppt_completed: orgAgg.comppt_completed,
      },
    };
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

  /* Club lead totals — club-level ONLY (binding rule). A single coach shows
     their own club's totals; the pilot aggregate lists every pilot club's
     totals in one table rather than attempting to sum/average onto an
     individual. Never attributed to a coach. */
  function renderLeadTotals() {
    const el = document.getElementById("performance-lead-totals");
    if (state.coachId !== "ALL") {
      const coach = C.getCoach(state.coachId);
      const club = coach ? D.clubs.find(c => c.club_number === coach.club_number) : null;
      el.innerHTML = K.leadTotalsCard(club ? club.lead_totals : null);
      return;
    }
    if (state.clubFilter !== "ALL") {
      const club = D.clubs.find(c => c.club_number === state.clubFilter);
      el.innerHTML = K.leadTotalsCard(club ? club.lead_totals : null);
      return;
    }
    const rows = D.clubs.map((club) => {
      const lt = club.lead_totals;
      return `<div class="baseline-item"><span class="baseline-lbl">${K.escapeHtml(club.club_name)}</span><span class="baseline-val">${lt ? lt.total_leads : "—"}</span></div>`;
    }).join("");
    el.innerHTML = `
      <div class="card card-pad">
        <div class="section-header"><span class="label-sm">Club Lead Totals</span><span class="label-xs">All pilot clubs</span></div>
        <div class="baseline-strip">${rows}</div>
        <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:10px;color:var(--mid-gray)">Club-level totals only — not attributable to individual coach performance.</div>
      </div>`;
  }

  function renderDiagnosis() {
    const el = document.getElementById("performance-diagnosis");
    if (state.coachId === "ALL") {
      const pool = poolForClubFilter();
      const scored = C.reliablyScored(C.scoreableCoaches().filter(c => pool.indexOf(c) !== -1));
      const counts = {};
      scored.forEach((c) => RECS.diagnoseCoach(c).forEach((d) => { counts[d.type] = (counts[d.type] || 0) + 1; }));
      const rows = Object.keys(counts).filter(k => counts[k] > 0)
        .map(k => `<li>${counts[k]} of ${scored.length} scored coaches show a ${DIAGNOSIS_LABELS[k].toLowerCase()}.</li>`);
      el.innerHTML = rows.length ? `<ul>${rows.join("")}</ul>` : K.dataPendingBlock("No performance diagnoses triggered across scored coaches.");
      return;
    }
    const coach = C.getCoach(state.coachId);
    if (!coach) { el.innerHTML = K.dataPendingBlock("No coach selected."); return; }
    const diagnoses = RECS.diagnoseCoach(coach);
    el.innerHTML = diagnoses.length
      ? `<ul>${diagnoses.map(d => `<li><strong>${K.escapeHtml(DIAGNOSIS_LABELS[d.type])}:</strong> ${K.escapeHtml(d.statement)} <span class="label-xs">(${d.skills.map(K.escapeHtml).join(", ")})</span></li>`).join("")}</ul>`
      : K.dataPendingBlock("No performance diagnosis triggered for this coach against current evidence.");
  }

  function renderBody() {
    const data = currentScoreData();
    const el = document.getElementById("performance-score-body");
    if (!data) { el.innerHTML = K.dataPendingBlock("No coach selected."); renderLeadTotals(); renderDiagnosis(); return; }

    const meets = data.score_coverage.meets_threshold;
    const overallText = meets ? String(data.overall_score) : "—";
    const overallSub = meets ? C.statusBandFor(data.overall_score).label : `Data pending — ${data.coverage_label}`;
    const detail = data.score_detail || {};
    const labels = data.pillar_coverage_labels || {};

    const evidenceCoach = data.isAggregate ? pseudoCoachFromAgg(data.orgAgg) : data.coach;
    const performanceEvidence = C.pillarEvidence(evidenceCoach, "performance");

    const periods = data.isAggregate ? C.orgConversionTrend(data.pool) : C.kpiPeriods(data.coach);
    let trendHtml = "";
    if (periods.length) {
      const series = [{ label: "Conversion %", color: "#1a1a1a", area: true, values: periods.map(p => p.conv_pct || 0) }];
      trendHtml = `
        <div class="section-block">
          <div class="card card-pad">
            <div class="section-header"><span class="label-sm">Conversion Trend</span><span class="label-xs">${periods.length} weekly periods on record</span></div>
            ${CH.lineChart({ series, xLabels: periods.map(p => p.periodLabel), unit: "%" })}
          </div>
        </div>`;
    }

    const curriculumHtml = data.isAggregate
      ? K.curriculumSummaryCompact(C.curriculumProgressSummary(data.pool))
      : K.curriculumProgressCard(C.curriculumProgress(data.coach));

    el.innerHTML = `
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
        ${K.competencyCategoryDetail("Performance · 40%", data.performance_score, labels.performance, detail.performance)}
      </div>

      <div class="section-block">
        <div class="section-header"><span class="label-sm">Performance Evidence</span><span class="label-xs">Not scored — supporting evidence only</span></div>
        ${K.evidenceRow(performanceEvidence)}
      </div>
      ${trendHtml}

      <div class="section-block grid-2">
        <div>${curriculumHtml}</div>
        <div class="card card-pad">
          <div class="section-header"><span class="label-sm">Program Focus — Weeks 5–8</span></div>
          <ul style="padding-left:16px;font-size:12px;color:var(--dark-gray);line-height:1.9">
            ${PROGRAM_FOCUS.map(t => `<li>${K.escapeHtml(t)}</li>`).join("")}
          </ul>
        </div>
      </div>`;

    renderDiagnosis();

    const link = document.getElementById("performance-profile-link");
    if (link) {
      link.innerHTML = state.coachId === "ALL" ? "" : `<span class="view-link" onclick="App.showCoach('${state.coachId}')" style="cursor:pointer;color:var(--dark-gray);font-family:'DM Mono',monospace;font-size:11px">View full coach profile →</span>`;
    }
  }

  function onCoachChange(val) { state.coachId = val; renderBody(); renderLeadTotals(); }
  function onClubFilterChange(val) { state.clubFilter = val; state.coachId = "ALL"; render(); }

  function render() {
    const el = document.getElementById("view-performance");
    el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="page-title">Performance</div>
          <div class="page-sub">Weeks 5–8 · Engaging, Closing, and Reframing — pipeline, conversion, and client retention.</div>
        </div>

        <div class="section-block">
          <div class="coach-search-bar">
            <div class="select-wrap">
              <select id="performance-club-select" onchange="PAGE_PERFORMANCE.onClubFilterChange(this.value)">${K.clubFilterOptionsHtml(D.clubs, state.clubFilter)}</select>
            </div>
            <div class="select-wrap">
              <select id="performance-coach-select" onchange="PAGE_PERFORMANCE.onCoachChange(this.value)">${coachOptionsHtml()}</select>
            </div>
            <div id="performance-profile-link"></div>
          </div>
        </div>

        <div class="section-block" id="performance-lead-totals"></div>

        <div id="performance-score-body"></div>

        <div class="section-block">
          <div class="card card-pad">
            <div class="section-header"><span class="label-sm">Performance Diagnosis</span><span class="label-xs">Auto-generated, evidence-gated</span></div>
            <div id="performance-diagnosis"></div>
          </div>
        </div>
      </div>`;
    renderLeadTotals();
    renderBody();
  }

  window.PAGE_PERFORMANCE = { render, onCoachChange, onClubFilterChange };
})();
