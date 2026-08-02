/* ═══════════════════════════════════════════════════════════
   PAGE — OVERVIEW
   ---------------------------------------------------------
   Concise, executive summary of the pilot: coach/data-coverage
   counts, Three Ps score, a compact curriculum-progress roll-up,
   the highest-value existing KPI evidence, and entry points into
   each pillar page. Club Ranking, Score Distribution, and
   org-wide Coaching Intelligence have been intentionally removed
   from this tab (approved) — they were generic/duplicative and
   didn't drive an action from this page.

   Market/Club filters narrow the pilot coach pool used for every
   KPI row and the pillar-score hero. Market is sourced only from
   club_map_data.json's `market` field (attached to D.clubs[i].market
   in coach-performance-data.js via strict club_id matching) — never
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
      { label: "Performance Score", value: s.scoredAgg.performance_score !== null ? s.scoredAgg.performance_score : "—", sub: "40% of overall — Engaging, Closing, Reframing", iconName: "target" },
      { label: "Programming Score", value: s.scoredAgg.programming_score !== null ? s.scoredAgg.programming_score : "—", sub: "30% of overall — Structure, Coaching, Recommendation", iconName: "activity" },
      { label: "Professionalism Score", value: s.scoredAgg.professionalism_score !== null ? s.scoredAgg.professionalism_score : "—", sub: "30% of overall — Mindset, Elevator Pitch, Floor Presence", iconName: "flag" },
    ];
  }

  /* Highest-value existing KPI evidence only — conversion and active
     clients are always shown (source always carries them); avg weekly
     sessions and recurring rate only appear when the aggregate actually
     has a value; week-over-week conversion change only appears when 2+
     valid weekly periods exist across the pool (C.orgConversionTrend
     returns [] otherwise — never a fabricated trend). */
  function evidenceKpis(s) {
    const cards = [
      { label: "Conversion Rate", value: pct1(s.orgAgg.conversion_rate), sub: "Evidence — Performance pillar", iconName: "zap" },
      { label: "Active Clients", value: s.orgAgg.active_clients, sub: `Across ${s.withKpiEvidence.length} coaches with KPI evidence`, iconName: "users" },
    ];
    if (s.orgAgg.avg_weekly_sessions !== null && s.orgAgg.avg_weekly_sessions !== undefined) {
      cards.push({ label: "Avg Weekly Sessions", value: num1(s.orgAgg.avg_weekly_sessions), sub: "Per active week", iconName: "calendar" });
    }
    if (s.orgAgg.recurring_rate !== null && s.orgAgg.recurring_rate !== undefined) {
      cards.push({ label: "Recurring Clients", value: pct1(s.orgAgg.recurring_rate), sub: "Recurring / Active Clients", iconName: "repeat" });
    }
    const periods = C.orgConversionTrend(s.pool);
    if (periods.length >= 2) {
      const last = periods[periods.length - 1], prev = periods[periods.length - 2];
      const change = Math.round((last.conv_pct - prev.conv_pct) * 10) / 10;
      const sign = change > 0 ? "+" : "";
      cards.push({ label: "Conversion — Week over Week", value: `${sign}${change} pts`, sub: `${prev.periodLabel} → ${last.periodLabel}`, iconName: "trend" });
    }
    return cards;
  }

  function overallScoreHero(s) {
    const meets = s.scoredAgg.score_coverage.meets_threshold;
    const scoreText = meets ? String(s.scoredAgg.overall_score) : "—";
    const sub = meets
      ? `${C.statusBandFor(s.scoredAgg.overall_score).label} · Performance 40% + Programming 30% + Professionalism 30%`
      : `Data pending — ${s.scoredAgg.coverage_label}`;
    return `
      <div class="card card-pad">
        <div class="section-header">
          <span class="label-sm">Overall Performance Score</span>
          <span class="label-xs" style="text-transform:none;letter-spacing:0">${K.escapeHtml(s.scoredAgg.coverage_label)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:20px">
          ${CH.ring({ score: meets ? s.scoredAgg.overall_score : 0, size: 108, stroke: 8, color: meets ? undefined : "var(--light-gray)", numSize: 30, showLabel: meets })}
          <div>
            <div style="font-size:36px;font-weight:700;letter-spacing:-1px;color:var(--off-black)">${scoreText}</div>
            <div class="label-xs" style="text-transform:none;letter-spacing:0;margin-top:4px">${K.escapeHtml(sub)}</div>
          </div>
        </div>
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

  function renderBody() {
    const s = pilotSummary();
    document.getElementById("overview-body").innerHTML = `
      <div class="section-block">
        <div class="kpi-grid kpi-grid-3">${rowOneKpis(s).map(K.kpiCard).join("")}</div>
      </div>

      <div class="section-block">
        ${overallScoreHero(s)}
      </div>

      <div class="section-block">
        <div class="section-header"><span class="label-sm">Three-Pillar Performance</span><span class="label-xs">Competency-based · coaches with a rating</span></div>
        <div class="kpi-grid kpi-grid-3">${rowTwoKpis(s).map(K.kpiCard).join("")}</div>
      </div>

      <div class="section-block">
        ${K.curriculumSummaryCompact(C.curriculumProgressSummary(s.pool))}
      </div>

      <div class="section-block">
        <div class="section-header"><span class="label-sm">Evidence</span><span class="label-xs">Not scored — supporting evidence only</span></div>
        <div class="kpi-grid">${evidenceKpis(s).map(K.kpiCard).join("")}</div>
      </div>

      <div class="section-block">
        <div class="section-header"><span class="label-sm">Precision Coaching Program</span></div>
        ${pillarEntryHtml(s)}
      </div>`;
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
          <div class="page-sub">Where the pilot stands today: coach coverage, three-pillar scores, curriculum progress, and results.</div>
        </div>
        <div class="section-block" id="overview-filters"></div>
        <div id="overview-body"></div>
      </div>`;
    renderFilters();
    renderBody();
  }

  window.PAGE_OVERVIEW = { render, onMarketChange, onClubChange };
})();
