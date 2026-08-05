/* ═══════════════════════════════════════════════════════════
   PAGE — PERFORMANCE
   ---------------------------------------------------------
   Weeks 5–8 of the Precision Coaching curriculum. Competency
   scope: Engaging, Closing, Reframing only. Curriculum Progress
   sits at the top of the page, immediately below the filters,
   followed directly by Club Lead Totals (club-level only — never
   attributed to an individual coach), then Performance evidence
   as portfolio averages (see calculations.js's "PER-COACH AVERAGE
   / RANKED KPI CARDS" section). Diagnosis is evidence-gated
   (RECS.diagnoseCoach) — never rendered without supporting
   evidence.

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

  function pct1(v) { return v !== null && v !== undefined ? `${Math.round(v * 1000) / 10}%` : "—"; }
  function num1(v) { return v !== null && v !== undefined ? Math.round(v * 10) / 10 : "—"; }

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

  function filterContextLabel() {
    if (state.clubFilter === "ALL") return "All Pilot Clubs";
    const club = D.clubs.find(c => c.club_number === state.clubFilter);
    return club ? club.club_name : state.clubFilter;
  }

  function coachOptionsHtml() {
    return `<option value="ALL">${K.escapeHtml(aggregateLabel())}</option>${K.groupedCoachOptionsHtml(poolForClubFilter())}`;
  }

  function currentScoreData() {
    if (state.coachId === "ALL") {
      const pool = poolForClubFilter();
      const scoreable = C.scoreableCoaches().filter(c => pool.indexOf(c) !== -1);
      const avgCompetencies = C.orgAggregateCompetencies(scoreable);
      const scored = C.scoreAggregateCompetencies(avgCompetencies);
      return { label: aggregateLabel(), isAggregate: true, coach: null, pool, ...scored };
    }
    const coach = C.getCoach(state.coachId);
    if (!coach) return null;
    return {
      label: coach.display_name, isAggregate: false, coach, pool: poolForClubFilter(),
      performance_score: coach.performance_score, programming_score: coach.programming_score, professionalism_score: coach.professionalism_score,
      overall_score: coach.overall_score, score_coverage: coach.score_coverage, score_detail: coach.score_detail,
      coverage_label: coach.coverage_label, pillar_coverage_labels: coach.pillar_coverage_labels,
    };
  }

  function renderCurriculum() {
    const el = document.getElementById("performance-curriculum");
    const data = currentScoreData();
    const curriculumHtml = !data
      ? K.dataPendingBlock("No coach selected.")
      : (data.isAggregate
        ? K.curriculumSummaryCompact(C.curriculumProgressSummary(data.pool))
        : K.curriculumProgressCard(C.curriculumProgress(data.coach)));
    el.innerHTML = `
      <div class="grid-2">
        <div>${curriculumHtml}</div>
        <div class="card card-pad">
          <div class="section-header"><span class="label-sm">Program Focus — Weeks 5–8</span></div>
          <ul style="padding-left:16px;font-size:12px;color:var(--dark-gray);line-height:1.9">
            ${PROGRAM_FOCUS.map(t => `<li>${K.escapeHtml(t)}</li>`).join("")}
          </ul>
        </div>
      </div>`;
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

  /* Performance evidence — portfolio averages over the current
     club-filtered pool of matched coaches (see Overview for the same
     pattern). Ranking modals always reflect the same pool. */
  function renderEvidence(pool) {
    const convAgg = C.avgCoachConversionRate(pool);
    const activeAgg = C.avgActiveClientsPerCoach(pool);
    const cpptAgg = C.avgComppCompletedPerCoach(pool);
    const cards = [
      {
        label: "Average Active Clients / Coach",
        value: activeAgg.average !== null ? num1(activeAgg.average) : "Data pending",
        sub: `${activeAgg.total} total active clients across ${activeAgg.matchedCount} coaches`,
        iconName: "users",
        onClick: "PAGE_PERFORMANCE.openActiveClientsModal()",
      },
      {
        label: "Average Coach Conversion Rate",
        value: convAgg.average !== null ? pct1(convAgg.average) : "Data pending",
        sub: `Average across ${convAgg.eligibleCount} of ${convAgg.matchedCount} coaches with conversion opportunities`,
        iconName: "zap",
        onClick: "PAGE_PERFORMANCE.openConversionModal()",
      },
      {
        label: "Average CPTs Completed / Coach",
        value: cpptAgg.average !== null ? num1(cpptAgg.average) : "Data pending",
        sub: `Cumulative to date across ${cpptAgg.matchedCount} coaches`,
        iconName: "flag",
        onClick: "PAGE_PERFORMANCE.openCpptModal()",
      },
    ];
    return `
      <div class="section-block">
        <div class="section-header"><span class="label-sm">Performance Evidence</span><span class="label-xs">Not scored — supporting evidence only</span></div>
        <div class="kpi-grid">${cards.map(K.kpiCard).join("")}</div>
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
    if (!data) { el.innerHTML = K.dataPendingBlock("No coach selected."); renderDiagnosis(); return; }

    const meets = data.score_coverage.meets_threshold;
    const overallText = meets ? String(data.overall_score) : "—";
    const overallSub = meets ? C.statusBandFor(data.overall_score).label : `Data pending — ${data.coverage_label}`;
    const detail = data.score_detail || {};
    const labels = data.pillar_coverage_labels || {};

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

    el.innerHTML = `
      ${renderEvidence(data.pool)}

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
        ${K.competencyCategoryDetail("Performance · 50%", data.performance_score, labels.performance, detail.performance, "PAGE_PERFORMANCE.openPillarScoreModal()")}
      </div>
      ${trendHtml}

      ${!data.isAggregate ? `<div class="section-block">${K.selfAssessmentPillarCard("performance", data.coach.self_assessment)}</div>` : ""}`;

    renderDiagnosis();

    const link = document.getElementById("performance-profile-link");
    if (link) {
      link.innerHTML = state.coachId === "ALL" ? "" : `<span class="profile-link-btn" onclick="App.showCoach('${state.coachId}')" role="button" tabindex="0">View Full Coach Profile →</span>`;
    }
  }

  /* ── Ranking modals ──────────────────────────────────────────── */
  function openConversionModal() {
    const agg = C.avgCoachConversionRate(poolForClubFilter());
    K.openRankingModal({
      title: "Average Coach Conversion Rate",
      subtitle: filterContextLabel(),
      averageLabel: "Portfolio Average",
      averageValueText: agg.average !== null ? pct1(agg.average) : "Data pending",
      columns: [
        { key: "display_name", label: "Coach" },
        { key: "club_name", label: "Club" },
        { key: "conversion_rate", label: "Conversion Rate", format: pct1 },
        { key: "conversion_eqfs", label: "Conversion Equifits" },
        { key: "ftbs_generated", label: "FTBs Generated" },
      ],
      rows: agg.rows,
      emptyMessage: "No coaches with a conversion opportunity in the current filter.",
    });
  }

  function openActiveClientsModal() {
    const agg = C.avgActiveClientsPerCoach(poolForClubFilter());
    K.openRankingModal({
      title: "Average Active Clients / Coach",
      subtitle: filterContextLabel(),
      averageLabel: "Portfolio Average",
      averageValueText: agg.average !== null ? `${num1(agg.average)} clients` : "Data pending",
      columns: [
        { key: "display_name", label: "Coach" },
        { key: "club_name", label: "Club" },
        { key: "active_clients", label: "Active Clients" },
      ],
      rows: agg.rows,
      emptyMessage: "No coaches with KPI evidence in the current filter.",
    });
  }

  function openCpptModal() {
    const agg = C.avgComppCompletedPerCoach(poolForClubFilter());
    K.openRankingModal({
      title: "Average CPTs Completed / Coach",
      subtitle: filterContextLabel(),
      averageLabel: "Portfolio Average",
      averageValueText: agg.average !== null ? `${num1(agg.average)} CPTs` : "Data pending",
      columns: [
        { key: "display_name", label: "Coach" },
        { key: "club_name", label: "Club" },
        { key: "comppt_completed", label: "CPTs Completed" },
      ],
      rows: agg.rows,
      emptyMessage: "No coaches with KPI evidence in the current filter.",
    });
  }

  /* Pillar Score deep-dive — same modal used on Overview, scoped to the
     current club filter's coach pool (never just the one selected coach —
     a ranking of one is not a ranking). */
  function openPillarScoreModal() {
    const pool = poolForClubFilter();
    const scoreable = C.scoreableCoaches().filter(c => pool.indexOf(c) !== -1);
    const avgCompetencies = C.orgAggregateCompetencies(scoreable);
    const scoredAgg = C.scoreAggregateCompetencies(avgCompetencies);
    const ranking = C.pillarScoreRanking(pool, "performance");
    const trendSeries = window.TRENDS ? window.TRENDS.orgSeries("competency.avg_performance_score") : null;
    K.pillarScoreModal({
      title: "Performance Score",
      subtitle: filterContextLabel(),
      weightLabel: "Performance · 50%",
      pillarScore: scoredAgg.performance_score,
      pillarCoverageLabel: (scoredAgg.pillar_coverage_labels || {}).performance,
      pillarDetail: (scoredAgg.score_detail || {}).performance,
      ranking,
      trendSeries,
      trendLabel: "Performance Score",
    });
  }

  function onCoachChange(val) { state.coachId = val; renderCurriculum(); renderBody(); renderLeadTotals(); }
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

        <div class="section-block" id="performance-curriculum"></div>

        <div class="section-block" id="performance-lead-totals"></div>

        <div id="performance-score-body"></div>

        <div class="section-block">
          <div class="card card-pad">
            <div class="section-header"><span class="label-sm">Performance Diagnosis</span><span class="label-xs">Auto-generated, evidence-gated</span></div>
            <div id="performance-diagnosis"></div>
          </div>
        </div>
      </div>`;
    renderCurriculum();
    renderLeadTotals();
    renderBody();
  }

  window.PAGE_PERFORMANCE = {
    render, onCoachChange, onClubFilterChange,
    openConversionModal, openActiveClientsModal, openCpptModal, openPillarScoreModal,
  };
})();
