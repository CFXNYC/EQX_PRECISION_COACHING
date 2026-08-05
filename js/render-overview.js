/* ═══════════════════════════════════════════════════════════
   PAGE — OVERVIEW
   ---------------------------------------------------------
   Concise, executive summary of the pilot: coach/data-coverage
   counts, a KPI Performance Index (evidence-only) and Competency
   Score shown as two clearly separated metrics, the Performance
   KPI set, Three Ps competency scores, a compact curriculum-
   progress roll-up, and entry points into each pillar page.

   "Average X / Coach" cards are the arithmetic mean of each
   eligible coach's own rate/value (see calculations.js's
   "PER-COACH AVERAGE / RANKED KPI CARDS" section) — never a
   total-over-total portfolio rollup where a per-coach average is
   the meaningful management measure. Each is clickable and opens
   a ranking modal built only from real per-coach evidence.

   Market/Club filters narrow the pilot coach pool used for every
   card on this page, including the KPI Performance Index and every
   modal's coach list. Market is sourced only from club_map_data.json's
   `market` field (attached to D.clubs[i].market in
   coach-performance-data.js via strict club_id matching) — never
   inferred or hardcoded.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;
  const C = window.CALC;
  const K = window.COMPONENTS;
  const CH = window.CHARTS;

  const state = { market: "ALL", club: "ALL" };

  function pct1(v) { return v !== null && v !== undefined ? `${Math.round(v * 1000) / 10}%` : "—"; }
  function num1(v) { return v !== null && v !== undefined ? Math.round(v * 10) / 10 : "—"; }

  function clubMarket(club) { return (club && club.market) || "Unassigned"; }

  function marketOptionsHtml() {
    const markets = Array.from(new Set(D.clubs.map(clubMarket))).sort();
    const opts = [`<option value="ALL">All Markets</option>`];
    markets.forEach(m => opts.push(`<option value="${K.escapeHtml(m)}" ${state.market === m ? "selected" : ""}>${K.escapeHtml(m)}</option>`));
    return opts.join("");
  }

  function clubOptionsHtml() {
    const clubsInMarket = D.clubs.filter(c => state.market === "ALL" || clubMarket(c) === state.market);
    return K.clubFilterOptionsHtml(clubsInMarket);
  }

  function filteredCoaches() {
    return D.coaches.filter((c) => {
      if (state.club !== "ALL" && c.club_number !== state.club) return false;
      if (state.market !== "ALL") {
        const club = D.clubs.find(cl => cl.club_number === c.club_number);
        if (clubMarket(club) !== state.market) return false;
      }
      return true;
    });
  }

  /* Selected-club (or market) context shown in every modal's subtitle. */
  function filterContextLabel() {
    if (state.club !== "ALL") {
      const club = D.clubs.find(c => c.club_number === state.club);
      return club ? club.club_name : state.club;
    }
    if (state.market !== "ALL") return `${state.market} market`;
    return "All Pilot Clubs";
  }

  /* Pilot summary for the current Market/Club filter — pilot coach count,
     scored-coach count, data coverage, and pillar scores from real
     competency data (never KPI targets — see calculations.js header). */
  function pilotSummary() {
    const pool = filteredCoaches();
    const scoreable = C.scoreableCoaches().filter(c => pool.indexOf(c) !== -1);
    const scored = C.reliablyScored(scoreable);
    const avgCompetencies = C.orgAggregateCompetencies(scoreable);
    const scoredAgg = C.scoreAggregateCompetencies(avgCompetencies);
    const withKpiEvidence = pool.filter(c => c.raw_performance);
    const orgAgg = C.orgAggregateMetrics(withKpiEvidence);
    return { pool, scoreable, scored, scoredAgg, orgAgg, withKpiEvidence };
  }

  function rowOneKpis(s) {
    const coveragePct = s.pool.length ? Math.round((s.scoreable.length / s.pool.length) * 100) : 0;
    return [
      { label: "Pilot Coaches", value: s.pool.length, sub: "Approved active pilot roster", iconName: "userCheck" },
      { label: "Scored Coaches", value: s.scored.length, sub: "Meet the 60% coverage threshold", iconName: "award" },
      { label: "Data Coverage", value: `${coveragePct}%`, sub: `${s.scoreable.length} of ${s.pool.length} have at least one rating`, iconName: "target" },
    ];
  }

  function rowTwoKpis(s) {
    return [
      { label: "Performance Score", value: s.scoredAgg.performance_score !== null ? s.scoredAgg.performance_score : "—", sub: "50% of overall — Engaging, Closing, Reframing", iconName: "target", onClick: "PAGE_OVERVIEW.openPillarScoreModal('performance')" },
      { label: "Professionalism Score", value: s.scoredAgg.professionalism_score !== null ? s.scoredAgg.professionalism_score : "—", sub: "30% of overall — Mindset, Elevator Pitch, Floor Presence", iconName: "flag", onClick: "PAGE_OVERVIEW.openPillarScoreModal('professionalism')" },
      { label: "Programming Score", value: s.scoredAgg.programming_score !== null ? s.scoredAgg.programming_score : "—", sub: "20% of overall — Structure, Coaching, Recommendation", iconName: "activity", onClick: "PAGE_OVERVIEW.openPillarScoreModal('programming')" },
    ];
  }

  const PILLAR_META = {
    performance: { label: "Performance Score", weightLabel: "Performance · 50%", trendPath: "competency.avg_performance_score" },
    professionalism: { label: "Professionalism Score", weightLabel: "Professionalism · 30%", trendPath: "competency.avg_professionalism_score" },
    programming: { label: "Programming Score", weightLabel: "Programming · 20%", trendPath: "competency.avg_programming_score" },
  };

  /* Performance KPI set — real per-coach averages only (see calculations.js
     header for why these are means-of-rates, not totals-over-totals).
     Average Weekly Sessions is the one exception, unchanged: a portfolio
     rate (total sessions / total active weeks), same as before. */
  function performanceKpis(s) {
    const convAgg = C.avgCoachConversionRate(s.pool);
    const activeAgg = C.avgActiveClientsPerCoach(s.pool);
    const recurAgg = C.avgRecurringClientRate(s.pool);
    const cards = [
      {
        label: "Average Coach Conversion Rate",
        value: convAgg.average !== null ? pct1(convAgg.average) : "Data pending",
        sub: `Average across ${convAgg.eligibleCount} of ${convAgg.matchedCount} coaches with conversion opportunities`,
        iconName: "zap",
        onClick: "PAGE_OVERVIEW.openConversionModal()",
      },
      {
        label: "Average Active Clients / Coach",
        value: activeAgg.average !== null ? num1(activeAgg.average) : "Data pending",
        sub: `${activeAgg.total} total active clients across ${activeAgg.matchedCount} coaches`,
        iconName: "users",
        onClick: "PAGE_OVERVIEW.openActiveClientsModal()",
      },
    ];
    if (s.orgAgg.avg_weekly_sessions !== null && s.orgAgg.avg_weekly_sessions !== undefined) {
      cards.push({ label: "Avg Weekly Sessions", value: num1(s.orgAgg.avg_weekly_sessions), sub: "Per active week", iconName: "calendar" });
    }
    cards.push({
      label: "Average Recurring Client Rate",
      value: recurAgg.average !== null ? pct1(recurAgg.average) : "Data pending",
      sub: `Average across ${recurAgg.eligibleCount} of ${recurAgg.matchedCount} coaches with active clients`,
      iconName: "repeat",
      onClick: "PAGE_OVERVIEW.openRecurringModal()",
    });
    return cards;
  }

  /* Overall Performance Score — two clearly separated metrics: the
     KPI Performance Index (primary, evidence-only) and the Competency
     Score (unchanged, still "Data pending" until ratings exist). Never
     merged or substituted for one another. */
  function overallScoreSection(s) {
    const kpiIndex = C.kpiPerformanceIndex(s.pool);
    return `
      <div class="grid-2">
        ${K.kpiIndexCard(kpiIndex)}
        ${K.competencyScoreCard(s.scoredAgg)}
      </div>`;
  }

  function pillarEntryHtml(s) {
    const labels = s.scoredAgg.pillar_coverage_labels || {};
    return `
      <div class="grid-3">
        ${K.pillarEntryCard({ pillarKey: "professionalism", label: "Professionalism", weightLabel: "Weeks 1–4 · 30%", score: s.scoredAgg.professionalism_score, coverageLabel: labels.professionalism, onClick: "App.showView('professionalism')" })}
        ${K.pillarEntryCard({ pillarKey: "performance", label: "Performance", weightLabel: "Weeks 5–8 · 40%", score: s.scoredAgg.performance_score, coverageLabel: labels.performance, onClick: "App.showView('performance')" })}
        ${K.pillarEntryCard({ pillarKey: "programming", label: "Programming", weightLabel: "Weeks 9–12 · 30%", score: s.scoredAgg.programming_score, coverageLabel: labels.programming, onClick: "App.showView('programming')" })}
      </div>`;
  }

  /* ── Week-Over-Week Trends — reads data/history/weekly_snapshots.json
     (js/trend-history.js). Plots EVERY capture, not just Monday
     benchmarks, so an intraweek spike shows up as a visible bump in the
     line rather than being hidden until the following Monday. Larger
     dark points mark the Monday benchmark for each week; smaller gray
     points are intraweek updates — see js/charts.js's pointRadii/
     pointColors. Needs at least 2 total captures to plot a line; with
     0-1 it shows a plain placeholder instead of an empty/misleading
     chart. ── */
  function trendSection() {
    const totalCaptures = (window.TREND_HISTORY || []).length;
    if (totalCaptures < 2) {
      return `
        <div class="card card-pad">
          <div class="section-header"><span class="label-sm">Week-Over-Week Trends</span></div>
          ${K.dataPendingBlock(`${totalCaptures} of 2+ snapshots captured — trend lines appear once a second snapshot (weekly benchmark or intraweek update) lands.`)}
        </div>`;
    }
    const charts = [
      { path: "kpi.avg_conversion_rate", label: "Avg Conversion Rate", unit: "%", scale: 100 },
      { path: "competency.avg_overall_score", label: "Avg Competency Score", unit: "" },
      { path: "curriculum.avg_progress_pct", label: "Avg Curriculum Progress", unit: "%" },
      { path: "leads.total_leads", label: "Total Leads", unit: "" },
    ];
    const cards = charts.map(({ path, label, unit, scale }) => {
      const series = window.TRENDS.orgSeries(path);
      const values = series.values.map((v) => (v === null || v === undefined ? null : scale ? v * scale : v));
      const hasAny = values.some((v) => v !== null);
      const pointRadii = series.isBenchmark.map((b) => (b ? 3.6 : 2.2));
      const pointColors = series.isBenchmark.map((b) => (b ? "#1a1a1a" : "#999"));
      return `
        <div class="card card-pad">
          <div class="section-header"><span class="label-sm">${K.escapeHtml(label)}</span><span class="label-xs">${series.totalCaptures} capture${series.totalCaptures === 1 ? "" : "s"} · ${series.weeksCaptured} week${series.weeksCaptured === 1 ? "" : "s"}</span></div>
          ${hasAny
            ? CH.lineChart({ series: [{ label, color: "#1a1a1a", area: true, values: values.map((v) => v || 0), pointRadii, pointColors }], xLabels: series.xLabels, unit })
            : K.dataPendingBlock("No data captured for this metric yet.")}
        </div>`;
    }).join("");
    return `
      <div class="section-block">
        <div class="section-header"><span class="label-sm">Week-Over-Week Trends</span><span class="label-xs">Dark points = Monday benchmark · gray points = intraweek update</span></div>
        <div class="kpi-grid kpi-grid-3">${cards}</div>
      </div>`;
  }

  function renderBody() {
    const s = pilotSummary();
    document.getElementById("overview-body").innerHTML = `
      <div class="section-block">
        <div class="kpi-grid kpi-grid-3">${rowOneKpis(s).map(K.kpiCard).join("")}</div>
      </div>

      <div class="section-block">
        ${overallScoreSection(s)}
      </div>

      <div class="section-block">
        <div class="section-header"><span class="label-sm">Performance</span></div>
        <div class="kpi-grid">${performanceKpis(s).map(K.kpiCard).join("")}</div>
      </div>

      <div class="section-block">
        <div class="section-header"><span class="label-sm">Three-Pillar Performance</span><span class="label-xs">Competency-based · coaches with a rating</span></div>
        <div class="kpi-grid kpi-grid-3">${rowTwoKpis(s).map(K.kpiCard).join("")}</div>
      </div>

      <div class="section-block">
        ${K.curriculumSummaryCompact(C.curriculumProgressSummary(s.pool))}
      </div>

      ${trendSection()}

      <div class="section-block">
        <div class="section-header"><span class="label-sm">Precision Coaching Program</span></div>
        ${pillarEntryHtml(s)}
      </div>`;
  }

  /* ── Ranking modals ──────────────────────────────────────────── */
  function openConversionModal() {
    const agg = C.avgCoachConversionRate(filteredCoaches());
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
    const agg = C.avgActiveClientsPerCoach(filteredCoaches());
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

  function openRecurringModal() {
    const agg = C.avgRecurringClientRate(filteredCoaches());
    K.openRankingModal({
      title: "Average Recurring Client Rate",
      subtitle: filterContextLabel(),
      averageLabel: "Portfolio Average",
      averageValueText: agg.average !== null ? pct1(agg.average) : "Data pending",
      columns: [
        { key: "display_name", label: "Coach" },
        { key: "club_name", label: "Club" },
        { key: "recurring_clients", label: "Recurring Clients" },
        { key: "active_clients", label: "Active Clients" },
        { key: "recurring_rate", label: "Recurring Rate", format: pct1 },
      ],
      rows: agg.rows,
      emptyMessage: "No coaches with active clients in the current filter.",
    });
  }

  /* Pillar Score deep-dive — Performance/Professionalism/Programming
     Score cards above. Breakdown + ranking scoped to the current
     Market/Club filter pool; trend is portfolio-wide (weekly snapshots
     don't carry a per-market/club breakdown). */
  function openPillarScoreModal(pillarKey) {
    const meta = PILLAR_META[pillarKey];
    const s = pilotSummary();
    const ranking = C.pillarScoreRanking(s.pool, pillarKey);
    const trendSeries = window.TRENDS ? window.TRENDS.orgSeries(meta.trendPath) : null;
    K.pillarScoreModal({
      title: meta.label,
      subtitle: filterContextLabel(),
      weightLabel: meta.weightLabel,
      pillarScore: s.scoredAgg[`${pillarKey}_score`],
      pillarCoverageLabel: (s.scoredAgg.pillar_coverage_labels || {})[pillarKey],
      pillarDetail: (s.scoredAgg.score_detail || {})[pillarKey],
      ranking,
      trendSeries,
      trendLabel: meta.label,
    });
  }

  function onMarketChange(v) { state.market = v; state.club = "ALL"; renderFilters(); renderBody(); }
  function onClubChange(v) { state.club = v; renderBody(); }

  function renderFilters() {
    const el = document.getElementById("overview-filters");
    if (!el) return;
    el.innerHTML = `
      <div class="filter-bar">
        <div class="select-wrap"><select onchange="PAGE_OVERVIEW.onMarketChange(this.value)">${marketOptionsHtml()}</select></div>
        <div class="select-wrap"><select onchange="PAGE_OVERVIEW.onClubChange(this.value)">${clubOptionsHtml()}</select></div>
      </div>`;
  }

  function render() {
    const el = document.getElementById("view-overview");
    el.innerHTML = `
      <div class="wrap">
        <div class="page-head">
          <div class="page-title">Precision Coaching Overview</div>
          <div class="page-sub">Where the pilot stands today: coach coverage, KPI and competency scores, curriculum progress, and results.</div>
        </div>
        <div class="section-block" id="overview-filters"></div>
        <div id="overview-body"></div>
      </div>`;
    renderFilters();
    renderBody();
  }

  window.PAGE_OVERVIEW = {
    render, onMarketChange, onClubChange,
    openConversionModal, openActiveClientsModal, openRecurringModal, openPillarScoreModal,
  };
})();
