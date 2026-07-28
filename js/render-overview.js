/* ═══════════════════════════════════════════════════════════
   PAGE — OVERVIEW
   Business performance summary: approved pilot coach count,
   Three Ps org scores, and weighted business KPIs (computed from
   approved coaches with performance data). Data-quality diagnostics
   are intentionally NOT shown on this tab; they remain available
   internally via CALC/D for validation.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const C = window.CALC;
  const K = window.COMPONENTS;
  const CH = window.CHARTS;

  function pct1(v) { return v !== null && v !== undefined ? `${Math.round(v * 1000) / 10}%` : "—"; }
  function num1(v) { return v !== null && v !== undefined ? Math.round(v * 10) / 10 : "—"; }

  /* Weighted business summary for the Overview tab — matched pilot coaches
     only. Reuses CALC.orgAggregateMetrics (sum/sum aggregation, never an
     average of individual coach percentages) for the raw KPIs, and
     CALC.scoreAggregateMetrics (same target-based scorer used everywhere
     else in the app) for Production/Process/Persistence/Overall — so
     Overall Score is always exactly production*0.50 + process*0.30 +
     persistence*0.20 computed on the org-level figures, not an average of
     each coach's own overall_score. */
  function pilotSummary() {
    const matched = C.matchedCoaches();
    const orgAgg = C.orgAggregateMetrics(matched);
    const avgActiveClients = orgAgg.coach_count ? orgAgg.active_clients / orgAgg.coach_count : null;
    const scored = C.scoreAggregateMetrics({
      active_clients: avgActiveClients,
      conversion_rate: orgAgg.conversion_rate,
      equifits_per_month: orgAgg.equifits_per_month,
      cpt_per_week: orgAgg.cpt_per_week,
      sessions_per_month: orgAgg.sessions_per_month,
    });
    return { matchedCount: matched.length, orgAgg, scored };
  }

  function rowOneKpis(s) {
    return [
      { label: "Pilot Coaches", value: s.matchedCount, sub: "Coaches with performance data", iconName: "userCheck" },
      { label: "Active Clients", value: s.orgAgg.active_clients, sub: `Across ${s.matchedCount} pilot coaches`, iconName: "users" },
      { label: "Average Weekly Sessions", value: num1(s.orgAgg.avg_weekly_sessions), sub: "Total sessions / active weeks", iconName: "calendar" },
    ];
  }

  function rowTwoKpis(s) {
    return [
      { label: "Production Score", value: s.scored.production_score !== null ? s.scored.production_score : "—", sub: "50% of overall — Active Clients + Conversion Rate", iconName: "target" },
      { label: "Process Score", value: s.scored.process_score !== null ? s.scored.process_score : "—", sub: "30% of overall — Equifits + CPTs vs target", iconName: "activity" },
      { label: "Persistence Score", value: s.scored.persistence_score !== null ? s.scored.persistence_score : "—", sub: "20% of overall — Sessions/Month vs target", iconName: "flag" },
    ];
  }

  function rowThreeKpis(s) {
    return [
      { label: "Conversion Rate", value: pct1(s.orgAgg.conversion_rate), sub: "FTBs Generated / Conversion Equifits · Target 45%", iconName: "zap" },
      { label: "Activity Volume", value: s.orgAgg.activity_volume, sub: "Equifits + CPTs, cumulative to date", iconName: "activity" },
      { label: "Recurring Client Rate", value: pct1(s.orgAgg.recurring_rate), sub: "Recurring Clients / Active Clients", iconName: "repeat" },
    ];
  }

  function overallScoreHero(s) {
    const meets = s.scored.score_coverage.meets_threshold;
    const scoreText = meets ? String(s.scored.overall_score) : "—";
    const sub = meets
      ? `${C.statusBandFor(s.scored.overall_score).label} · Production 50% + Process 30% + Persistence 20%`
      : "Insufficient data to calculate a reliable score";
    return `
      <div class="card card-pad">
        <div class="section-header">
          <span class="label-sm">Overall Performance Score</span>
          ${K.coverageBadge(s.scored.score_coverage.overall_coverage, meets)}
        </div>
        <div style="display:flex;align-items:center;gap:20px">
          ${CH.ring({ score: meets ? s.scored.overall_score : 0, size: 108, stroke: 8, color: meets ? undefined : "var(--light-gray)", numSize: 30, showLabel: meets })}
          <div>
            <div style="font-size:36px;font-weight:700;letter-spacing:-1px;color:var(--off-black)">${scoreText}</div>
            <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:4px">${K.escapeHtml(sub)}</div>
          </div>
        </div>
      </div>`;
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
          <div class="rank-meta">${r.scored_coach_count} of ${r.roster_coach_count} coaches scored · ${r.avg_coverage_pct}% avg coverage</div>
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
    const s = pilotSummary();
    el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="page-title">Precision Coaching Overview</div>
          <div class="page-sub">Where the pilot stands today, including business performance, Three Ps scores, and results by club.</div>
        </div>

        <div class="section-block">
          <div class="kpi-grid kpi-grid-3">${rowOneKpis(s).map(K.kpiCard).join("")}</div>
        </div>

        <div class="section-block">
          ${overallScoreHero(s)}
        </div>

        <div class="section-block">
          <div class="section-header"><span class="label-sm">Three Ps Performance</span><span class="label-xs">Weighted aggregate · coaches with performance data</span></div>
          <div class="kpi-grid kpi-grid-3">${rowTwoKpis(s).map(K.kpiCard).join("")}</div>
        </div>

        <div class="section-block">
          <div class="kpi-grid kpi-grid-3">${rowThreeKpis(s).map(K.kpiCard).join("")}</div>
        </div>

        <div class="section-block grid-2">
          <div class="card card-pad">
            <div class="section-header"><span class="label-sm">Club Ranking</span><span class="label-xs">By avg Three Ps score · coaches with performance data</span></div>
            ${clubRankingHtml()}
          </div>
          <div class="card card-pad">
            <div class="section-header"><span class="label-sm">Performance Score Distribution</span><span class="label-xs">Coaches with performance data</span></div>
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
