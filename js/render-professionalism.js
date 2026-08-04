/* ═══════════════════════════════════════════════════════════
   PAGE — PROFESSIONALISM
   ---------------------------------------------------------
   Weeks 1–4 of the Precision Coaching curriculum. Competency
   scope: Mindset, Elevator Pitch, Floor Presence only. Curriculum
   Progress sits at the top of the page, immediately below the
   filters. Evidence follows directly below curriculum and is
   framed as portfolio averages (see calculations.js's "PER-COACH
   AVERAGE / RANKED KPI CARDS" section) — never club lead totals
   (those live exclusively on Performance, club-level only).

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

  const PROGRAM_FOCUS = ["Mindset and Emotional Intelligence", "Personal Branding and Communication", "Floor Presence and Member Experience", "Time, Calendar and Member Experience"];

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

  /* Professionalism evidence — portfolio averages over the current
     club-filtered pool of matched coaches, not the selected individual
     coach (a single coach isn't itself an "average"). Ranking modals
     always reflect the same pool, so the selected-club filter recalculates
     both the cards and their modal lists. */
  function renderEvidence(pool) {
    const eqfsAgg = C.avgEqfsCompletedPerCoach(pool);
    const bookedAgg = C.eqfsBookedSummary(pool);
    const cards = [
      {
        label: "Average Equifits Completed / Coach",
        value: eqfsAgg.average !== null ? num1(eqfsAgg.average) : "Data pending",
        sub: `Cumulative to date across ${eqfsAgg.matchedCount} coaches`,
        iconName: "zap",
        onClick: "PAGE_PROFESSIONALISM.openEqfsCompletedModal()",
      },
      bookedAgg.availableCount > 0
        ? {
            label: "Equifits Booked",
            value: bookedAgg.total,
            sub: `Cumulative to date across ${bookedAgg.availableCount} of ${bookedAgg.matchedCount} coaches`,
            iconName: "calendar",
            onClick: "PAGE_PROFESSIONALISM.openEqfsBookedModal()",
          }
        : { label: "Equifits Booked", value: "Data pending", sub: `No booked-Equifit values on record for ${filterContextLabel()}`, iconName: "calendar" },
    ];
    return `
      <div class="section-block">
        <div class="section-header"><span class="label-sm">Professionalism Evidence</span><span class="label-xs">Not scored — supporting evidence only</span></div>
        <div class="kpi-grid">${cards.map(K.kpiCard).join("")}</div>
      </div>`;
  }

  function renderBody() {
    const el = document.getElementById("professionalism-body");
    const data = currentScoreData();
    if (!data) { el.innerHTML = K.dataPendingBlock("No coach selected."); return; }

    const meets = data.score_coverage.meets_threshold;
    const overallText = meets ? String(data.overall_score) : "—";
    const overallSub = meets ? C.statusBandFor(data.overall_score).label : `Data pending — ${data.coverage_label}`;
    const detail = data.score_detail || {};
    const labels = data.pillar_coverage_labels || {};

    const curriculumHtml = data.isAggregate
      ? K.curriculumSummaryCompact(C.curriculumProgressSummary(data.pool))
      : K.curriculumProgressCard(C.curriculumProgress(data.coach));

    el.innerHTML = `
      <div class="section-block grid-2">
        <div>${curriculumHtml}</div>
        <div class="card card-pad">
          <div class="section-header"><span class="label-sm">Program Focus — Weeks 1–4</span></div>
          <ul style="padding-left:16px;font-size:12px;color:var(--dark-gray);line-height:1.9">
            ${PROGRAM_FOCUS.map(t => `<li>${K.escapeHtml(t)}</li>`).join("")}
          </ul>
        </div>
      </div>

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
        ${K.competencyCategoryDetail("Professionalism · 30%", data.professionalism_score, labels.professionalism, detail.professionalism)}
      </div>

      ${!data.isAggregate ? `<div class="section-block">${K.selfAssessmentPillarCard("professionalism", data.coach.self_assessment)}</div>` : ""}`;

    const link = document.getElementById("professionalism-profile-link");
    if (link) {
      link.innerHTML = state.coachId === "ALL" ? "" : `<span class="view-link" onclick="App.showCoach('${state.coachId}')" style="cursor:pointer;color:var(--dark-gray);font-family:'DM Mono',monospace;font-size:11px">View full coach profile →</span>`;
    }
  }

  /* ── Ranking modals ──────────────────────────────────────────── */
  function openEqfsCompletedModal() {
    const agg = C.avgEqfsCompletedPerCoach(poolForClubFilter());
    K.openRankingModal({
      title: "Average Equifits Completed / Coach",
      subtitle: filterContextLabel(),
      averageLabel: "Portfolio Average",
      averageValueText: agg.average !== null ? `${num1(agg.average)} Equifits` : "Data pending",
      columns: [
        { key: "display_name", label: "Coach" },
        { key: "club_name", label: "Club" },
        { key: "eqfs_completed", label: "Equifits Completed" },
      ],
      rows: agg.rows,
      emptyMessage: "No coaches with KPI evidence in the current filter.",
    });
  }

  function openEqfsBookedModal() {
    const agg = C.eqfsBookedSummary(poolForClubFilter());
    K.openRankingModal({
      title: "Equifits Booked",
      subtitle: filterContextLabel(),
      averageLabel: "Portfolio Total",
      averageValueText: agg.availableCount > 0 ? `${agg.total} booked` : "Data pending",
      columns: [
        { key: "display_name", label: "Coach" },
        { key: "club_name", label: "Club" },
        { key: "eqfs_scheduled", label: "Equifits Booked" },
        { key: "eqfs_completed", label: "Equifits Completed" },
      ],
      rows: agg.rows,
      emptyMessage: "No booked-Equifit values on record for the current filter.",
    });
  }

  function onCoachChange(val) { state.coachId = val; renderBody(); }
  function onClubFilterChange(val) { state.clubFilter = val; state.coachId = "ALL"; render(); }

  function render() {
    const el = document.getElementById("view-professionalism");
    el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="page-title">Professionalism</div>
          <div class="page-sub">Weeks 1–4 · Mindset, Elevator Pitch, and Floor Presence — how a coach shows up and communicates with members.</div>
        </div>

        <div class="section-block">
          <div class="coach-search-bar">
            <div class="select-wrap">
              <select id="professionalism-club-select" onchange="PAGE_PROFESSIONALISM.onClubFilterChange(this.value)">${K.clubFilterOptionsHtml(D.clubs, state.clubFilter)}</select>
            </div>
            <div class="select-wrap">
              <select id="professionalism-coach-select" onchange="PAGE_PROFESSIONALISM.onCoachChange(this.value)">${coachOptionsHtml()}</select>
            </div>
            <div id="professionalism-profile-link"></div>
          </div>
        </div>

        <div id="professionalism-body"></div>
      </div>`;
    renderBody();
  }

  window.PAGE_PROFESSIONALISM = {
    render, onCoachChange, onClubFilterChange,
    openEqfsCompletedModal, openEqfsBookedModal,
  };
})();
