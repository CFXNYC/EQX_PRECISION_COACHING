/* ═══════════════════════════════════════════════════════════
   CALCULATIONS ENGINE
   ---------------------------------------------------------
   Pure functions only. No DOM access, no presentation strings.
   Reads from window.PRECISION_DATA and derives every number the
   UI needs: the Three Ps (Production / Process / Persistence)
   scores, coverage, club rollups, and org-wide aggregates.

   THREE Ps SCORING MODEL
   -----------------------
   overall_score = production*0.50 + process*0.30 + persistence*0.20

   Every metric below is target-based: metric_score = min(actual/target, 1) * 100.
   Only metrics with a documented, justified target are included in the
   weighted score. Recurring Rate and Repurchase Rate are real, verified
   source metrics but have NO documented target anywhere in the project
   requirements — per hard rule, they are excluded from the weighted score
   (shown everywhere as raw KPIs instead) rather than scored against an
   invented threshold.

   Category assignment rationale:
     Production  — the tangible business results a coach produces
                   (Active Clients, Conversion Rate).
     Process     — the specific coaching activities/workflow steps
                   (Equifits booked, CPTs booked).
     Persistence — sustained delivery/consistency over time
                   (Sessions per month — the only documented target
                   that fits "persistence").

   COVERAGE
   --------
   Every category's metric weights sum to 1, so "coverage" for a category
   is simply the sum of the weights of its AVAILABLE metrics. A metric is
   unavailable when its real denominator is zero/undefined (e.g. no active
   weeks yet, no equifits ever booked) — never because a value happens to
   be a real zero. When a metric is unavailable, remaining weights within
   its category are renormalized (score = weighted sum / available weight).
   The same renormalization happens one level up across categories.
   overall_coverage is NOT renormalized — it is the true fraction of the
   full 100% weight that is backed by real data, and gates the 60% display
   threshold (score_coverage.meets_threshold).
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;

  const WEEKS_PER_MONTH = 4.345; // 52 weeks / 12 months
  const COVERAGE_THRESHOLD = 0.60; // minimum overall_coverage to show a confident score

  const STATUS_BANDS = [
    { min: 0,  max: 59,  label: "Needs Support", tone: "risk" },
    { min: 60, max: 74,  label: "Developing",    tone: "foundation" },
    { min: 75, max: 84,  label: "On Track",       tone: "momentum" },
    { min: 85, max: 100, label: "Excelling",       tone: "standard" },
  ];
  function statusBandFor(score) {
    return STATUS_BANDS.find(b => score >= b.min && score <= b.max) || STATUS_BANDS[0];
  }

  /* Defensive: some source systems encode a rate as a whole-number percent
     (e.g. 45) instead of a decimal (0.45). This dataset's rate fields are
     confirmed decimals (0-1), but this guard costs nothing and protects
     against a future export format change. */
  function safeRate(v) {
    if (v === null || v === undefined) return null;
    return v > 1 ? v / 100 : v;
  }

  /* ═══════════════════════════════════════════════════════════
     SCORING CONFIGURATION — single source of truth for every
     target, weight, and category boundary in the Three Ps model.
  ═══════════════════════════════════════════════════════════ */
  const SCORING_CONFIG = {
    weeksPerMonth: WEEKS_PER_MONTH,
    coverageThreshold: COVERAGE_THRESHOLD,
    production: {
      weight: 0.50,
      metrics: {
        active_clients: {
          label: "Active Clients",
          weight: 0.5,
          targetMin: 12, targetMax: 15, // confirmed target range: 12-15 active clients
          unit: "clients",
          available: (raw) => raw.active_clients !== null && raw.active_clients !== undefined,
          actual: (raw, cm) => cm.active_clients,
          // Within [min,max] scores 100. Below min scores proportionally.
          // Above max is capped at 100 — no extra credit for exceeding the target band.
          score: (v, cfg) => (v >= cfg.targetMin ? 100 : Math.min(v / cfg.targetMin, 1) * 100),
        },
        conversion_rate: {
          label: "Conversion Rate",
          weight: 0.5,
          target: 0.45, // confirmed target: 45% Equifit → FTB conversion
          unit: "%",
          available: (raw) => (raw.conversion_eqfs || 0) > 0, // needs real opportunities to be meaningful
          actual: (raw, cm) => cm.conversion_rate,
          score: (v, cfg) => Math.min(v / cfg.target, 1) * 100,
        },
      },
    },
    process: {
      weight: 0.30,
      metrics: {
        equifits_per_month: {
          label: "Equifits / Month",
          weight: 0.5,
          target: 12, // confirmed target: ~12 Equifits per month
          unit: "/mo",
          available: (raw) => (raw.active_weeks || 0) > 0,
          actual: (raw, cm) => cm.equifits_per_month,
          score: (v, cfg) => Math.min(v / cfg.target, 1) * 100,
        },
        cpt_per_week: {
          label: "CPTs / Week",
          weight: 0.5,
          target: 3, // confirmed target: ~3 CPTs per week
          unit: "/wk",
          available: (raw) => (raw.active_weeks || 0) > 0,
          actual: (raw, cm) => cm.cpt_per_week,
          score: (v, cfg) => Math.min(v / cfg.target, 1) * 100,
        },
      },
    },
    persistence: {
      weight: 0.20,
      metrics: {
        sessions_per_month: {
          label: "Sessions / Month",
          weight: 1.0,
          target: 90, // confirmed target: ~90 full-time sessions per month
          unit: "/mo",
          available: (raw) => (raw.active_weeks || 0) > 0,
          actual: (raw, cm) => cm.sessions_per_month,
          score: (v, cfg) => Math.min(v / cfg.target, 1) * 100,
        },
      },
    },
    // Verified, real source metrics with NO documented target — excluded from
    // the weighted score by design (see file header). Surfaced as raw KPIs
    // throughout the UI and used by the diagnosis engine via relative
    // (org-average) comparison instead of an invented absolute threshold.
    unscored_metrics: {
      recurring_rate: { label: "Recurring Rate", reason: "no documented target — Recurring Clients / Active Clients" },
      repurchase_rate: { label: "Repurchase Rate", reason: "no documented target — Repurchased / First-Time-Booked Clients" },
    },
  };

  /* ═══════════════════════════════════════════════════════════
     Raw KPI figures — always computed when raw_performance exists,
     independent of scoring. This is what KPI Breakdown / Behavior
     cards read from.
  ═══════════════════════════════════════════════════════════ */
  function buildCalculatedMetrics(raw) {
    const activeWeeks = raw.active_weeks || 0;
    const monthsElapsed = activeWeeks > 0 ? activeWeeks / WEEKS_PER_MONTH : null;
    return {
      active_clients: raw.active_clients,
      // Conversion Rate = Conversions / Opportunities. Source's own conversion_rate
      // field is verified to equal ftbs_generated / eqfs_completed (conversion_eqfs) —
      // used directly rather than recomputed, to avoid floating-point drift.
      conversion_rate: (raw.conversion_eqfs || 0) > 0 ? safeRate(raw.conversion_rate) : null,
      // Activity Volume = Total Equifits + Total CPTs (cumulative to date — the
      // source has no reporting-period field, so this is lifetime-to-date, not monthly).
      activity_volume: (raw.eqfs_completed || 0) + (raw.comppt_completed || 0),
      // Recurring Rate: source's pct_recurring_clients is verified to equal
      // recurring_clients / active_clients.
      recurring_rate: (raw.active_clients || 0) > 0 ? safeRate(raw.pct_recurring_clients) : null,
      // Repurchase Rate: source's repurchase_rate is verified to equal
      // repurchased_clients / ftb_clients.
      repurchase_rate: (raw.ftb_clients || 0) > 0 ? safeRate(raw.repurchase_rate) : null,
      // Monthly/weekly normalization of cumulative totals, using each coach's
      // own tenure-to-date (active_weeks) — needed to compare against the
      // monthly/weekly coaching targets.
      equifits_per_month: monthsElapsed ? raw.eqfs_completed / monthsElapsed : null,
      cpt_per_week: activeWeeks > 0 ? raw.comppt_completed / activeWeeks : null,
      sessions_per_month: monthsElapsed ? raw.avg_weekly_sessions * WEEKS_PER_MONTH : null,
      avg_weekly_sessions: raw.avg_weekly_sessions,
      total_sessions: raw.total_sessions,
      eqfs_completed: raw.eqfs_completed,
      eqfs_scheduled: raw.eqfs_scheduled,
      comppt_completed: raw.comppt_completed,
      comppt_scheduled: raw.comppt_scheduled,
      recurring_clients: raw.recurring_clients,
      repurchased_clients: raw.repurchased_clients,
      ftb_clients: raw.ftb_clients,
      ftbs_generated: raw.ftbs_generated,
      lost_clients: raw.lost_clients,
      active_weeks: activeWeeks,
      coach_status: raw.coach_status,
      hire_dt: raw.hire_dt,
      termination_dt: raw.termination_dt,
      job_desc: raw.job_desc,
    };
  }

  /* Core category scorer — takes a plain resolver map { metricKey: {available, actual} }
     so it can score either a raw performance record (per coach) or a set of
     already-aggregated org/club values (see scoreAggregateMetrics) with the
     exact same weighting and renormalization logic. */
  function scoreCategoryCore(categoryCfg, resolvers) {
    const keys = Object.keys(categoryCfg.metrics);
    let availableWeight = 0, weightedScoreSum = 0;
    const detail = {};
    keys.forEach((key) => {
      const m = categoryCfg.metrics[key];
      const r = resolvers[key] || { available: false, actual: null };
      let score = null;
      if (r.available) {
        score = m.score(r.actual, m);
        availableWeight += m.weight;
        weightedScoreSum += m.weight * score;
      }
      detail[key] = {
        label: m.label, weight: m.weight, unit: m.unit,
        target: m.target !== undefined ? m.target : { min: m.targetMin, max: m.targetMax },
        actual: r.actual, score: score !== null ? Math.round(score * 10) / 10 : null, available: r.available,
      };
    });
    const coverage = availableWeight; // metric weights within a category sum to 1
    const score = coverage > 0 ? weightedScoreSum / coverage : null;
    return { score: score !== null ? Math.round(score * 10) / 10 : null, coverage, detail };
  }

  function scoreCategory(categoryCfg, raw, cm) {
    const resolvers = {};
    Object.keys(categoryCfg.metrics).forEach((key) => {
      const m = categoryCfg.metrics[key];
      const available = !!m.available(raw);
      resolvers[key] = { available, actual: available ? m.actual(raw, cm) : null };
    });
    return scoreCategoryCore(categoryCfg, resolvers);
  }

  /* Combines the three category results into an overall score, coverage,
     and performance band — shared by scoreCoach and scoreAggregateMetrics. */
  function combineCategoryScores(prod, proc, pers) {
    const categories = [
      { weight: SCORING_CONFIG.production.weight, result: prod },
      { weight: SCORING_CONFIG.process.weight, result: proc },
      { weight: SCORING_CONFIG.persistence.weight, result: pers },
    ];
    let overallCoverage = 0, availableCategoryWeight = 0, weightedSum = 0;
    categories.forEach((c) => {
      overallCoverage += c.weight * c.result.coverage;
      if (c.result.score !== null) {
        availableCategoryWeight += c.weight;
        weightedSum += c.weight * c.result.score;
      }
    });
    const overallScoreRaw = availableCategoryWeight > 0 ? weightedSum / availableCategoryWeight : null;
    const meetsThreshold = overallCoverage >= COVERAGE_THRESHOLD && overallScoreRaw !== null;
    const overallScore = overallScoreRaw !== null ? Math.round(overallScoreRaw) : null;
    return {
      production_score: prod.score,
      process_score: proc.score,
      persistence_score: pers.score,
      overall_score: overallScore,
      score_coverage: {
        production_coverage: Math.round(prod.coverage * 100) / 100,
        process_coverage: Math.round(proc.coverage * 100) / 100,
        persistence_coverage: Math.round(pers.coverage * 100) / 100,
        overall_coverage: Math.round(overallCoverage * 100) / 100,
        meets_threshold: meetsThreshold,
      },
      score_detail: { production: prod.detail, process: proc.detail, persistence: pers.detail },
      performance_band: meetsThreshold ? statusBandFor(overallScore).label : null,
    };
  }

  /* ── Per-coach scoring ───────────────────────────────────────── */
  function scoreCoach(coach) {
    const raw = coach.raw_performance;
    if (!raw) {
      return {
        calculated_metrics: null,
        production_score: null, process_score: null, persistence_score: null, overall_score: null,
        score_coverage: { production_coverage: 0, process_coverage: 0, persistence_coverage: 0, overall_coverage: 0, meets_threshold: false },
        score_detail: null,
        performance_band: null,
      };
    }

    const cm = buildCalculatedMetrics(raw);
    const prod = scoreCategory(SCORING_CONFIG.production, raw, cm);
    const proc = scoreCategory(SCORING_CONFIG.process, raw, cm);
    const pers = scoreCategory(SCORING_CONFIG.persistence, raw, cm);

    return { calculated_metrics: cm, ...combineCategoryScores(prod, proc, pers) };
  }

  function scoreAllCoaches() {
    const bandCounts = {};
    STATUS_BANDS.forEach(b => { bandCounts[b.label] = 0; });
    let insufficientCount = 0, noKpiCount = 0;

    D.coaches.forEach((coach) => {
      Object.assign(coach, scoreCoach(coach));
      if (coach.mapping_status === "no_kpi_data") { noKpiCount++; return; }
      if (coach.score_coverage.meets_threshold) {
        bandCounts[statusBandFor(coach.overall_score).label]++;
      } else {
        insufficientCount++;
      }
    });

    D.scoringConfig = SCORING_CONFIG;
    D.dataQuality.scoring_coverage_distribution = {
      by_band: bandCounts,
      insufficient_coverage_count: insufficientCount,
      no_kpi_data_count: noKpiCount,
    };
    /* eslint-disable no-console */
    console.groupCollapsed("%cPrecision Coaching — Scoring Coverage", "font-weight:bold");
    console.log("Performance bands (reliably scored coaches):", bandCounts);
    console.log("Insufficient coverage (<60%):", insufficientCount);
    console.log("No KPI data (not scored):", noKpiCount);
    console.groupEnd();
    /* eslint-enable no-console */
  }
  scoreAllCoaches();

  /* Scores an already-aggregated set of values (e.g. org-wide or club-wide
     averages) against the same Three Ps targets used for individual coaches.
     `values` is a plain object keyed by metric key — active_clients,
     conversion_rate, equifits_per_month, cpt_per_week, sessions_per_month —
     each either a number or null/undefined if unavailable. Used by the
     Growth and Behavior pages to show an "All Coaches" aggregate view on
     the exact same target-vs-actual bars as an individual coach. */
  function scoreAggregateMetrics(values) {
    function resolversFor(categoryCfg) {
      const r = {};
      Object.keys(categoryCfg.metrics).forEach((key) => {
        const v = values[key];
        r[key] = { available: v !== null && v !== undefined, actual: v };
      });
      return r;
    }
    const prod = scoreCategoryCore(SCORING_CONFIG.production, resolversFor(SCORING_CONFIG.production));
    const proc = scoreCategoryCore(SCORING_CONFIG.process, resolversFor(SCORING_CONFIG.process));
    const pers = scoreCategoryCore(SCORING_CONFIG.persistence, resolversFor(SCORING_CONFIG.persistence));
    return combineCategoryScores(prod, proc, pers);
  }

  /* ── Lookups & coach-set helpers ─────────────────────────────── */
  function getCoach(coachId) { return D.coaches.find(c => c.coach_id === coachId); }
  function matchedCoaches() { return D.coaches.filter(c => c.mapping_status === "matched"); }
  function needsDataCoaches() { return D.coaches.filter(c => c.mapping_status === "needs_data"); }
  function noKpiDataCoaches() { return D.coaches.filter(c => c.mapping_status === "no_kpi_data"); }
  // "Scoreable" = has raw_performance (matched + needs_data). needs_data coaches
  // remain in overall performance totals per spec, just excluded from per-club rollups.
  function scoreableCoaches() { return D.coaches.filter(c => c.mapping_status !== "no_kpi_data"); }
  function reliablyScored(coaches) { return coaches.filter(c => c.score_coverage && c.score_coverage.meets_threshold); }

  function sumField(rows, field) { return rows.reduce((s, r) => s + (r[field] || 0), 0); }
  function avgField(rows, field) { return rows.length ? sumField(rows, field) / rows.length : 0; }

  /* Weighted org/club/coach-set aggregation of raw KPIs. Rates are aggregated
     as (sum of numerators / sum of denominators), NOT as an average of each
     coach's individual rate — averaging percentages directly would distort
     the result whenever coaches have very different volumes. */
  function orgAggregateMetrics(coaches) {
    const withPerf = coaches.filter(c => c.raw_performance).map(c => c.raw_performance);
    const total = (fn) => withPerf.reduce((s, r) => s + (fn(r) || 0), 0);
    const totalEqfs = total(r => r.eqfs_completed);
    const totalCppt = total(r => r.comppt_completed);
    const totalActiveClients = total(r => r.active_clients);
    const totalRecurring = total(r => r.recurring_clients);
    const totalFtb = total(r => r.ftb_clients);
    const totalRepurchased = total(r => r.repurchased_clients);
    const totalFtbsGenerated = total(r => r.ftbs_generated);
    const totalSessions = total(r => r.total_sessions);
    const totalActiveWeeks = total(r => r.active_weeks);

    return {
      coach_count: withPerf.length,
      active_clients: totalActiveClients,
      activity_volume: totalEqfs + totalCppt,
      eqfs_completed: totalEqfs,
      comppt_completed: totalCppt,
      recurring_clients: totalRecurring,
      repurchased_clients: totalRepurchased,
      ftb_clients: totalFtb,
      total_sessions: totalSessions,
      total_active_weeks: totalActiveWeeks,
      conversion_rate: totalEqfs > 0 ? totalFtbsGenerated / totalEqfs : null,
      recurring_rate: totalActiveClients > 0 ? totalRecurring / totalActiveClients : null,
      repurchase_rate: totalFtb > 0 ? totalRepurchased / totalFtb : null,
      avg_weekly_sessions: totalActiveWeeks > 0 ? totalSessions / totalActiveWeeks : null,
      equifits_per_month: totalActiveWeeks > 0 ? totalEqfs / (totalActiveWeeks / WEEKS_PER_MONTH) : null,
      cpt_per_week: totalActiveWeeks > 0 ? totalCppt / totalActiveWeeks : null,
      sessions_per_month: totalActiveWeeks > 0 ? (totalSessions / totalActiveWeeks) * WEEKS_PER_MONTH : null,
    };
  }

  function orgAverageScores(coaches) {
    const scored = reliablyScored(coaches);
    const avg = (fn) => scored.length ? Math.round(scored.reduce((s, c) => s + fn(c), 0) / scored.length) : null;
    return {
      scored_count: scored.length,
      total_count: coaches.length,
      overall_score: avg(c => c.overall_score),
      production_score: avg(c => c.production_score),
      process_score: avg(c => c.process_score),
      persistence_score: avg(c => c.persistence_score),
    };
  }

  /* ── Club rollups ────────────────────────────────────────────── */
  function clubRankings() {
    return D.clubs.map((club) => {
      const clubMatched = matchedCoaches().filter(c => c.club_number === club.club_number);
      const scored = reliablyScored(clubMatched);
      const avgScore = scored.length ? Math.round(scored.reduce((s, c) => s + c.overall_score, 0) / scored.length) : null;
      const avgCoveragePct = clubMatched.length
        ? Math.round((clubMatched.reduce((s, c) => s + (c.score_coverage ? c.score_coverage.overall_coverage : 0), 0) / clubMatched.length) * 100)
        : 0;
      return {
        club_number: club.club_number,
        club_name: club.club_name,
        matched_coach_count: clubMatched.length,
        scored_coach_count: scored.length,
        avg_score: avgScore,
        avg_coverage_pct: avgCoveragePct,
      };
    }).sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1));
  }

  function performanceScoreDistribution() {
    // needs_data coaches remain in overall performance totals per spec,
    // so the org-wide distribution draws from all scoreable coaches, not
    // matched-only (that restriction applies specifically to club rankings).
    const pool = reliablyScored(scoreableCoaches());
    const buckets = STATUS_BANDS.map(b => ({ ...b, count: 0 }));
    pool.forEach((c) => {
      const band = statusBandFor(c.overall_score);
      const b = buckets.find(x => x.label === band.label);
      if (b) b.count++;
    });
    return buckets;
  }

  window.CALC = {
    SCORING_CONFIG, STATUS_BANDS, WEEKS_PER_MONTH, COVERAGE_THRESHOLD,
    statusBandFor, getCoach,
    matchedCoaches, needsDataCoaches, noKpiDataCoaches, scoreableCoaches, reliablyScored,
    sumField, avgField,
    orgAggregateMetrics, orgAverageScores,
    clubRankings, performanceScoreDistribution,
    scoreCoach, scoreAggregateMetrics,
  };
})();
