/* ═══════════════════════════════════════════════════════════
   PAGE — BEHAVIOR
   ---------------------------------------------------------
   Shows Process + Persistence KPIs, their target attainment, and
   an automatically generated behavior diagnosis.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;
  const C = window.CALC;
  const K = window.COMPONENTS;
  const RECS = window.RECS;

  const state = { coachId: "ALL" };

  const DIAGNOSIS_LABELS = {
    closing_issue: "Closing Issue",
    pipeline_issue: "Pipeline Issue",
    follow_up_issue: "Follow-Up Issue",
    low_recurring_rate: "Low Recurring Rate",
    process_vs_production: "Activity Not Converting",
    production_vs_persistence: "Results Not Sustainable",
  };

  function coachOptionsHtml() {
    const opts = [`<option value="ALL">All Coaches — Pilot Aggregate</option>`];
    C.allApprovedCoaches().slice().sort((a, b) => a.display_name.localeCompare(b.display_name)).forEach((c) => {
      opts.push(`<option value="${c.coach_id}">${K.escapeHtml(c.display_name)} — ${K.escapeHtml(c.club_name || "—")}</option>`);
    });
    return opts.join("");
  }

  function currentScoreData() {
    if (state.coachId === "ALL") {
      const scoreable = C.scoreableCoaches();
      const orgAgg = C.orgAggregateMetrics(scoreable);
      const avgActiveClients = orgAgg.coach_count ? orgAgg.active_clients / orgAgg.coach_count : null;
      const scored = C.scoreAggregateMetrics({
        active_clients: avgActiveClients,
        conversion_rate: orgAgg.conversion_rate,
        equifits_per_month: orgAgg.equifits_per_month,
        cpt_per_week: orgAgg.cpt_per_week,
        sessions_per_month: orgAgg.sessions_per_month,
      });
      return { label: "All Coaches — Pilot Aggregate", orgAgg, ...scored };
    }
    const coach = C.getCoach(state.coachId);
    if (!coach) return null;
    if (!coach.raw_performance) return { label: coach.display_name, noPerformanceData: true };
    return {
      label: coach.display_name, cm: coach.calculated_metrics,
      process_score: coach.process_score, persistence_score: coach.persistence_score,
      score_coverage: coach.score_coverage, score_detail: coach.score_detail,
    };
  }

  function renderKpis() {
    const data = currentScoreData();
    const el = document.getElementById("behavior-kpi-grid");
    if (!data) { el.innerHTML = `<div class="empty-state">No coach selected.</div>`; return; }
    if (data.noPerformanceData) { el.innerHTML = `<div class="empty-state">No Performance Data available for this coach yet.</div>`; return; }
    const m = state.coachId === "ALL" ? data.orgAgg : data.cm;
    const cards = [
      { label: "Equifits Completed", value: m.eqfs_completed, sub: "Cumulative to date", iconName: "zap" },
      { label: "CPTs Completed", value: m.comppt_completed, sub: "Cumulative to date", iconName: "flag" },
      { label: "Activity Volume", value: m.eqfs_completed + m.comppt_completed, sub: "Equifits + CPTs", iconName: "activity" },
      { label: "Active Clients", value: m.active_clients, sub: "Target: 12-15", iconName: "users" },
      { label: "Recurring Clients", value: m.recurring_clients, sub: "Count", iconName: "repeat" },
      { label: "Recurring Rate", value: m.recurring_rate !== null && m.recurring_rate !== undefined ? `${Math.round(m.recurring_rate * 1000) / 10}%` : "—", sub: "Recurring / Active Clients", iconName: "repeat" },
      { label: "Repurchase Rate", value: m.repurchase_rate !== null && m.repurchase_rate !== undefined ? `${Math.round(m.repurchase_rate * 1000) / 10}%` : "—", sub: "Repurchased / First-Time-Booked", iconName: "trend" },
      { label: "Avg Weekly Sessions", value: m.avg_weekly_sessions !== null && m.avg_weekly_sessions !== undefined ? Math.round(m.avg_weekly_sessions * 10) / 10 : "—", sub: "Per active week", iconName: "calendar" },
    ];
    el.innerHTML = cards.map(K.kpiCard).join("");
  }

  function renderScoreBreakdown() {
    const el = document.getElementById("behavior-score-breakdown");
    const data = currentScoreData();
    if (!data || data.noPerformanceData) { el.innerHTML = `<div class="empty-state">No Performance Data available for this coach yet.</div>`; return; }
    el.innerHTML = `
      <div class="grid-2">
        ${K.scoreCategoryDetail("Process · 30% of overall", data.process_score, data.score_coverage.process_coverage, data.score_detail.process)}
        ${K.scoreCategoryDetail("Persistence · 20% of overall", data.persistence_score, data.score_coverage.persistence_coverage, data.score_detail.persistence)}
      </div>`;
  }

  function renderDiagnosis() {
    const el = document.getElementById("behavior-diagnosis");
    if (state.coachId === "ALL") {
      const scored = C.reliablyScored(C.scoreableCoaches());
      const counts = {};
      scored.forEach((c) => RECS.diagnoseCoach(c).forEach((d) => { counts[d.type] = (counts[d.type] || 0) + 1; }));
      const rows = Object.keys(counts).filter(k => counts[k] > 0)
        .map(k => `<li>${counts[k]} of ${scored.length} scored coaches show ${DIAGNOSIS_LABELS[k].toLowerCase()}.</li>`);
      el.innerHTML = rows.length ? `<ul>${rows.join("")}</ul>` : `<div class="empty-state">No behavior diagnoses triggered across scored coaches.</div>`;
      return;
    }
    const coach = C.getCoach(state.coachId);
    if (!coach || !coach.raw_performance) { el.innerHTML = `<div class="empty-state">No Performance Data available for this coach yet.</div>`; return; }
    const diagnoses = RECS.diagnoseCoach(coach);
    el.innerHTML = diagnoses.length
      ? `<ul>${diagnoses.map(d => `<li><strong>${K.escapeHtml(DIAGNOSIS_LABELS[d.type])}:</strong> ${K.escapeHtml(d.statement)} <span class="label-xs">(${d.skills.map(K.escapeHtml).join(", ")})</span></li>`).join("")}</ul>`
      : `<div class="empty-state">No behavior diagnosis triggered for this coach against current KPI values.</div>`;
  }

  function renderAll() {
    renderKpis();
    renderScoreBreakdown();
    renderDiagnosis();
    const link = document.getElementById("behavior-profile-link");
    if (link) {
      link.innerHTML = state.coachId === "ALL" ? "" : `<span class="view-link" onclick="App.showCoach('${state.coachId}')" style="cursor:pointer;color:var(--dark-gray);font-family:'DM Mono',monospace;font-size:11px">View full coach profile →</span>`;
    }
  }

  function onCoachChange(val) { state.coachId = val; renderAll(); }

  function render() {
    const el = document.getElementById("view-behavior");
    el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="page-title">Behavior</div>
          <div class="page-sub">Review the Process and Persistence behaviors influencing coach performance and development.</div>
        </div>

        <div class="section-block">
          <div class="coach-search-bar">
            <div class="select-wrap">
              <select id="behavior-coach-select" onchange="PAGE_BEHAVIOR.onCoachChange(this.value)">${coachOptionsHtml()}</select>
            </div>
            <div id="behavior-profile-link"></div>
          </div>
        </div>

        <div class="section-block">
          <div class="kpi-grid" id="behavior-kpi-grid"></div>
        </div>

        <div class="section-block" id="behavior-score-breakdown"></div>

        <div class="section-block">
          <div class="card card-pad">
            <div class="section-header"><span class="label-sm">Behavior Diagnosis</span><span class="label-xs">Auto-generated from KPI values vs. target</span></div>
            <div id="behavior-diagnosis"></div>
          </div>
        </div>
      </div>`;
    renderAll();
  }

  window.PAGE_BEHAVIOR = { render, onCoachChange };
})();
