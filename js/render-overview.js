/* ═══════════════════════════════════════════════════════════
   PAGE — OVERVIEW
   Executive summary driven entirely by pilot_coach_data.json +
   pilot_coach_directory.json: mapping totals, Three Ps org
   averages, club ranking (matched coaches only), performance
   score distribution, and KPI-based Coaching Intelligence.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;
  const C = window.CALC;
  const K = window.COMPONENTS;

  function overviewKpis() {
    const scoreable = C.scoreableCoaches(); // matched + needs_data — needs_data stays in overall totals
    const orgAvg = C.orgAverageScores(scoreable);
    const orgAgg = C.orgAggregateMetrics(scoreable);
    const scoreSub = orgAvg.overall_score !== null
      ? `Org avg · ${orgAvg.scored_count} of ${orgAvg.total_count} coaches reliably scored`
      : "Insufficient data to calculate a reliable score";

    return [
      { label: "Total Performance Records", value: D.meta.performance_record_count, sub: "pilot_coach_data.json", iconName: "users" },
      { label: "Matched Pilot Coaches", value: D.mappingSummary.matched_count, sub: "Performance + directory matched", iconName: "userCheck" },
      { label: "Needs Directory Data", value: D.mappingSummary.needs_data_count, sub: "Performance data, no directory match", iconName: "userQuestion" },
      { label: "No KPI Data", value: D.mappingSummary.no_kpi_data_count, sub: "Roster coaches, no performance record", iconName: "userQuestion" },
      { label: "Overall Performance Score", value: orgAvg.overall_score !== null ? orgAvg.overall_score : "—", sub: scoreSub, iconName: "award" },
      { label: "Production Score", value: orgAvg.production_score !== null ? orgAvg.production_score : "—", sub: "50% of overall — Active Clients + Conversion Rate", iconName: "target" },
      { label: "Process Score", value: orgAvg.process_score !== null ? orgAvg.process_score : "—", sub: "30% of overall — Equifits + CPTs vs target", iconName: "activity" },
      { label: "Persistence Score", value: orgAvg.persistence_score !== null ? orgAvg.persistence_score : "—", sub: "20% of overall — Sessions/Month vs target", iconName: "flag" },
      { label: "Active Clients", value: orgAgg.active_clients, sub: `Across ${orgAgg.coach_count} scoreable coaches`, iconName: "users" },
      { label: "Conversion Rate", value: orgAgg.conversion_rate !== null ? `${Math.round(orgAgg.conversion_rate * 1000) / 10}%` : "—", sub: "Target: 45%", iconName: "zap" },
      { label: "Activity Volume", value: orgAgg.activity_volume, sub: "Equifits + CPTs, cumulative to date", iconName: "activity" },
      { label: "Recurring Rate", value: orgAgg.recurring_rate !== null ? `${Math.round(orgAgg.recurring_rate * 1000) / 10}%` : "—", sub: "Recurring / Active Clients", iconName: "repeat" },
    ];
  }

  function clubRankingHtml() {
    const rankings = C.clubRankings();
    const scoredOnly = rankings.filter(r => r.avg_score !== null);
    const max = Math.max(...scoredOnly.map(r => r.avg_score), 1);
    return rankings.map((r, i) => `
      <div class="rank-row">
        <div class="rank-num">${i + 1}</div>
        <div class="rank-info">
          <div class="rank-name">${K.escapeHtml(r.club_name)}</div>
          <div class="rank-meta">${r.scored_coach_count} scored · ${r.matched_coach_count} matched · ${r.avg_coverage_pct}% avg coverage</div>
        </div>
        <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${r.avg_score !== null ? Math.round((r.avg_score / max) * 100) : 0}%"></div></div>
        <div class="rank-score">${r.avg_score !== null ? r.avg_score : "—"}</div>
      </div>`).join("");
  }

  function distributionHtml() {
    const dist = C.performanceScoreDistribution();
    const max = Math.max(...dist.map(d => d.count), 1);
    const toneColor = { risk: "var(--coral)", foundation: "var(--mid-gray)", momentum: "var(--amber)", standard: "var(--green)" };
    return `<div class="dist-bars">
      ${dist.map(d => `
        <div class="dist-col">
          <div class="dist-count">${d.count}</div>
          <div class="dist-bar" style="height:${Math.max(4, Math.round((d.count / max) * 100))}%;background:${toneColor[d.tone]}"></div>
          <div class="dist-lbl">${d.label}<br>${d.min}–${d.max}</div>
        </div>`).join("")}
    </div>`;
  }

  function intelHtml() {
    const rec = window.RECS.orgIntelligence();
    return `
      <div class="intel-grid">
        <div class="intel-card">
          <div class="intel-icon-wrap wins">${K.icon("trend", 16)}</div>
          <div class="intel-head wins">Wins</div>
          <div class="intel-body"><ul>${rec.wins.map(w => `<li>${K.escapeHtml(w)}</li>`).join("")}</ul></div>
        </div>
        <div class="intel-card">
          <div class="intel-icon-wrap opps">${K.icon("flag", 16)}</div>
          <div class="intel-head opps">Opportunities</div>
          <div class="intel-body"><ul>${rec.opportunities.map(o => `<li>${K.escapeHtml(o)}</li>`).join("")}</ul></div>
        </div>
        <div class="intel-card">
          <div class="intel-icon-wrap next">${K.icon("zap", 16)}</div>
          <div class="intel-head next">Recommended Actions</div>
          <div class="intel-body"><ul>${rec.actions.map(a => `<li>${K.escapeHtml(a)}</li>`).join("")}</ul></div>
        </div>
      </div>`;
  }

  function render() {
    const el = document.getElementById("view-overview");
    el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="page-title">Precision Coaching Overview</div>
          <div class="page-sub">Where the pilot stands today, sourced directly from pilot_coach_data.json and pilot_coach_directory.json — coach mapping, Three Ps performance, and business results across all pilot clubs.</div>
        </div>

        <div class="section-block">
          <div class="kpi-grid">${overviewKpis().map(K.kpiCard).join("")}</div>
        </div>

        <div class="section-block grid-2">
          <div class="card card-pad">
            <div class="section-header"><span class="label-sm">Club Ranking</span><span class="label-xs">By avg Three Ps score · matched coaches only</span></div>
            ${clubRankingHtml()}
          </div>
          <div class="card card-pad">
            <div class="section-header"><span class="label-sm">Performance Score Distribution</span><span class="label-xs">Scoreable coaches</span></div>
            ${distributionHtml()}
          </div>
        </div>

        <div class="section-block">
          <div class="section-header"><span class="label-sm">Coaching Intelligence</span></div>
          ${intelHtml()}
        </div>
      </div>`;
  }

  window.PAGE_OVERVIEW = { render };
})();
