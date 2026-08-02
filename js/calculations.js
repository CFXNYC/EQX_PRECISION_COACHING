/* ═══════════════════════════════════════════════════════════
   CALCULATIONS ENGINE
   ---------------------------------------------------------
   Pure functions only. No DOM access, no presentation strings.
   Reads from window.PRECISION_DATA and derives every number the
   UI needs: Performance / Programming / Professionalism scores,
   coverage, club rollups, and org-wide aggregates.

   COMPETENCY-BASED SCORING MODEL
   -------------------------------
   overall_score = performance*0.40 + programming*0.30 + professionalism*0.30

   Every pillar score is computed ONLY from the 1-5 competency
   ratings in danny_competencies_3ps.json (coach.evidence_sources.
   competencies, attached in js/coach-performance-data.js), each
   normalized via (value/5)*100. Raw KPIs (active_clients,
   conversion_rate, eqfs_completed, repurchase_rate, etc.) are
   EVIDENCE ONLY — displayed alongside each pillar, never scored,
   never target-compared. This is a binding product decision, not
   an oversight: there is no documented KPI target for this model,
   and inventing one is explicitly disallowed.

   Pillar → competency → evidence mapping (binding, from the
   Skills Matrix — not a mechanical rename of any prior model):
     Performance     (40%) — Engaging, Closing, Reframing
                              evidence: Active Clients, Conversion, CPTs Completed
     Programming     (30%) — Structure, Coaching, Recommendation
                              evidence: SPU (no source field — always Data pending),
                                        Program Repurchase Rate
     Professionalism (30%) — Mindset, Elevator Pitch, Floor Presence
                              evidence: Equifits Completed, Equifits Booked,
                                        Leads Generated (club-level only — see
                                        D.clubs[i].lead_totals, never per-coach)

   COVERAGE
   --------
   A pillar needs at least one available competency to be scored.
   Competencies within a pillar are equal-weighted (no documented
   basis for unequal sub-weights). A pillar with zero available
   competencies is excluded from the overall weighted sum, and the
   remaining pillars reweight to preserve the 40:30:30 *relative*
   ratio — the same renormalization approach used throughout this
   file, applied to competency coverage instead of KPI coverage.
   overall_coverage is NOT renormalized — it is the true fraction
   of the full 100% weight backed by real ratings, and gates the
   60% display threshold (score_coverage.meets_threshold).
   coverage_label ("6 of 9 competency inputs available") is a
   separate, count-based figure — never derived from the weighted
   percentage, which can read misleadingly against a raw count.

   SCORE TIMING
   ------------
   Competency data is attached asynchronously by
   js/coach-performance-data.js (Promise.allSettled fetches).
   scoreAllCoaches() therefore does NOT run at this file's load
   time — it runs once window.PRECISION_EVIDENCE_READY resolves,
   exposed as window.PRECISION_SCORES_READY. app.js awaits that
   promise before first render. KPI evidence (calculated_metrics)
   has no such dependency and is computed synchronously below.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;

  const WEEKS_PER_MONTH = 4.345; // 52 weeks / 12 months
  const COVERAGE_THRESHOLD = 0.60; // minimum overall_coverage to show a confident score

  const STATUS_BANDS = [
    { min: 0,  max: 59,  label: "At Risk",                tone: "risk" },
    { min: 60, max: 69,  label: "Building Foundation",     tone: "foundation" },
    { min: 70, max: 79,  label: "Building Momentum",       tone: "momentum" },
    { min: 80, max: 89,  label: "Delivering Results",      tone: "results" },
    { min: 90, max: 100, label: "Setting The Standard",    tone: "standard" },
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
     COMPETENCY CONFIGURATION — single source of truth for every
     pillar weight and competency→source-field mapping.
  ═══════════════════════════════════════════════════════════ */
  const COMPETENCY_CONFIG = {
    performance: {
      weight: 0.40,
      label: "Performance",
      competencies: {
        engaging:  { label: "Engaging",  sourceField: "PERFORMANCE | Engaging" },
        closing:   { label: "Closing",   sourceField: "PERFORMANCE | Closing" },
        reframing: { label: "Reframing", sourceField: "PERFORMANCE | Reframing" },
      },
    },
    programming: {
      weight: 0.30,
      label: "Programming",
      competencies: {
        structure:      { label: "Structure",      sourceField: "PROGRAMMING | Structure" },
        coaching:       { label: "Coaching",       sourceField: "PROGRAMMING | Coaching" },
        recommendation: { label: "Recommendation", sourceField: "PROGRAMMING | Recommendation" },
      },
    },
    professionalism: {
      weight: 0.30,
      label: "Professionalism",
      competencies: {
        mindset:       { label: "Mindset",         sourceField: "PROFESSIONALISM | Mindset" },
        elevatorPitch: { label: "Elevator Pitch",  sourceField: "PROFESSIONALISM | Elevator Pitch" },
        floorPresence: { label: "Floor Presence",  sourceField: "PROFESSIONALISM | Floor Presence" },
      },
    },
  };
  const PILLAR_KEYS = ["performance", "programming", "professionalism"];
  const TOTAL_COMPETENCY_COUNT = PILLAR_KEYS.reduce((s, k) => s + Object.keys(COMPETENCY_CONFIG[k].competencies).length, 0); // 9

  /* Evidence shown alongside each pillar — never scored, never
     target-compared. SPU has no source field anywhere in the
     supplied data and is a permanent "Data pending" line (binding
     decision — do not invent a value or a proxy). Leads Generated
     is deliberately absent here: it is club-level only (see
     D.clubs[i].lead_totals) and must never be attached to an
     individual coach. */
  const EVIDENCE_CONFIG = {
    performance: [
      { key: "active_clients", label: "Active Clients", unit: "clients", get: (coach) => coach.calculated_metrics ? coach.calculated_metrics.active_clients : null },
      { key: "conversion_rate", label: "Conversion Rate", unit: "%", get: (coach) => coach.calculated_metrics ? coach.calculated_metrics.conversion_rate : null },
      { key: "cpts_completed", label: "CPTs Completed", unit: "", get: (coach) => coach.calculated_metrics ? coach.calculated_metrics.comppt_completed : null },
    ],
    programming: [
      { key: "spu", label: "SPU (Sessions per Unit)", unit: "", alwaysPending: true, get: () => null },
      { key: "program_repurchase_rate", label: "Program Repurchase Rate", unit: "%", get: (coach) => coach.calculated_metrics ? coach.calculated_metrics.repurchase_rate : null },
    ],
    professionalism: [
      { key: "equifits_completed", label: "Equifits Completed", unit: "", get: (coach) => coach.calculated_metrics ? coach.calculated_metrics.eqfs_completed : null },
      { key: "equifits_booked", label: "Equifits Booked", unit: "", get: (coach) => coach.calculated_metrics ? coach.calculated_metrics.eqfs_scheduled : null },
    ],
  };
  function pillarEvidence(coach, pillarKey) {
    return (EVIDENCE_CONFIG[pillarKey] || []).map((e) => {
      const value = e.alwaysPending ? null : e.get(coach);
      return { key: e.key, label: e.label, unit: e.unit, value, available: !e.alwaysPending && value !== null && value !== undefined };
    });
  }

  /* ═══════════════════════════════════════════════════════════
     Raw KPI figures — evidence only, independent of scoring.
     Computed synchronously (no dependency on the async evidence
     join) so KPI Breakdown / Behavior cards never wait on it.
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
  // KPI evidence has no async dependency — compute it immediately for every
  // coach so it's available regardless of when competency scoring resolves.
  D.coaches.forEach((c) => { c.calculated_metrics = c.raw_performance ? buildCalculatedMetrics(c.raw_performance) : null; });

  function round1(v) { return v !== null ? Math.round(v * 10) / 10 : null; }
  function round2(v) { return Math.round(v * 100) / 100; }

  /* Scores one pillar from a competency row (a real coach's evidence_sources.
     competencies, or a synthetic averaged row from orgAggregateCompetencies —
     same function either way). Competencies are equal-weighted within their
     pillar; unavailable ones are excluded and the pillar's coverage/score
     reweight over only the available competencies. */
  function scoreCompetencyCategory(categoryCfg, competencyRow) {
    const keys = Object.keys(categoryCfg.competencies);
    const perWeight = 1 / keys.length;
    let availableWeight = 0, weightedSum = 0, availableCount = 0;
    const detail = {};
    keys.forEach((key) => {
      const def = categoryCfg.competencies[key];
      const raw = competencyRow ? competencyRow[def.sourceField] : undefined;
      const available = raw !== null && raw !== undefined;
      const normalized = available ? Math.max(0, Math.min(100, (raw / 5) * 100)) : null;
      if (available) { availableWeight += perWeight; weightedSum += perWeight * normalized; availableCount++; }
      detail[key] = { label: def.label, raw: available ? raw : null, normalized: round1(normalized), available };
    });
    const coverage = availableWeight;
    const score = coverage > 0 ? weightedSum / coverage : null;
    return { score: round1(score), coverage, detail, availableCount, totalCount: keys.length };
  }

  /* Combines the three pillar results into an overall score, coverage, and
     status band — shared by scoreCoach and scoreAggregateCompetencies. */
  function combineCompetencyScores(perf, prog, prof) {
    const pillars = [
      { weight: COMPETENCY_CONFIG.performance.weight, result: perf },
      { weight: COMPETENCY_CONFIG.programming.weight, result: prog },
      { weight: COMPETENCY_CONFIG.professionalism.weight, result: prof },
    ];
    let overallCoverage = 0, availablePillarWeight = 0, weightedSum = 0;
    pillars.forEach((p) => {
      overallCoverage += p.weight * p.result.coverage;
      if (p.result.score !== null) { availablePillarWeight += p.weight; weightedSum += p.weight * p.result.score; }
    });
    const overallScoreRaw = availablePillarWeight > 0 ? weightedSum / availablePillarWeight : null;
    const meetsThreshold = overallCoverage >= COVERAGE_THRESHOLD && overallScoreRaw !== null;
    const overallScore = overallScoreRaw !== null ? Math.round(overallScoreRaw) : null;
    const totalAvailable = perf.availableCount + prog.availableCount + prof.availableCount;
    return {
      performance_score: perf.score,
      programming_score: prog.score,
      professionalism_score: prof.score,
      overall_score: overallScore,
      score_coverage: {
        performance_coverage: round2(perf.coverage),
        programming_coverage: round2(prog.coverage),
        professionalism_coverage: round2(prof.coverage),
        overall_coverage: round2(overallCoverage),
        meets_threshold: meetsThreshold,
      },
      score_detail: { performance: perf.detail, programming: prog.detail, professionalism: prof.detail },
      performance_band: meetsThreshold ? statusBandFor(overallScore).label : null,
      coverage_label: `${totalAvailable} of ${TOTAL_COMPETENCY_COUNT} competency inputs available`,
      pillar_coverage_labels: {
        performance: `${perf.availableCount} of ${perf.totalCount} competency inputs available`,
        programming: `${prog.availableCount} of ${prog.totalCount} competency inputs available`,
        professionalism: `${prof.availableCount} of ${prof.totalCount} competency inputs available`,
      },
    };
  }

  /* Scores a single competency row (real or averaged) end to end. Shared by
     scoreCoach (per-coach) and scoreAggregateCompetencies (org/club). */
  function scoreCompetencyRow(row) {
    if (!row) {
      return {
        performance_score: null, programming_score: null, professionalism_score: null, overall_score: null,
        score_coverage: { performance_coverage: 0, programming_coverage: 0, professionalism_coverage: 0, overall_coverage: 0, meets_threshold: false },
        score_detail: null,
        performance_band: null,
        coverage_label: `0 of ${TOTAL_COMPETENCY_COUNT} competency inputs available`,
        pillar_coverage_labels: { performance: "0 of 3 competency inputs available", programming: "0 of 3 competency inputs available", professionalism: "0 of 3 competency inputs available" },
      };
    }
    const perf = scoreCompetencyCategory(COMPETENCY_CONFIG.performance, row);
    const prog = scoreCompetencyCategory(COMPETENCY_CONFIG.programming, row);
    const prof = scoreCompetencyCategory(COMPETENCY_CONFIG.professionalism, row);
    return combineCompetencyScores(perf, prog, prof);
  }

  /* ── Per-coach scoring ───────────────────────────────────────── */
  function scoreCoach(coach) {
    const competencyRow = coach.evidence_sources ? coach.evidence_sources.competencies : null;
    return scoreCompetencyRow(competencyRow);
  }

  // "Has a competency score" means at least one of the 9 ratings is a real,
  // non-null value — NOT merely that a competencies row was matched by
  // email. A matched row whose 9 fields are all null (common today — see
  // file header) produces overall_score === null, same as no row at all;
  // checking overall_score here, rather than row presence, is what keeps
  // "Data Coverage" honest instead of reporting every email-matched row as
  // "covered."
  function hasCompetencyScore(coach) { return coach.overall_score !== null && coach.overall_score !== undefined; }

  function scoreAllCoaches() {
    const bandCounts = {};
    STATUS_BANDS.forEach(b => { bandCounts[b.label] = 0; });
    let insufficientCount = 0, noScoreCount = 0;

    D.coaches.forEach((coach) => {
      Object.assign(coach, scoreCoach(coach));
      if (!hasCompetencyScore(coach)) { noScoreCount++; return; }
      if (coach.score_coverage.meets_threshold) {
        bandCounts[statusBandFor(coach.overall_score).label]++;
      } else {
        insufficientCount++;
      }
    });

    D.scoringConfig = COMPETENCY_CONFIG;
    D.dataQuality.scoring_coverage_distribution = {
      by_band: bandCounts,
      insufficient_coverage_count: insufficientCount,
      no_competency_data_count: noScoreCount,
    };
    /* eslint-disable no-console */
    console.groupCollapsed("%cPrecision Coaching — Scoring Coverage", "font-weight:bold");
    console.log("Status bands (reliably scored coaches):", bandCounts);
    console.log("Insufficient coverage (<60%):", insufficientCount);
    console.log("No competency data (not scored):", noScoreCount);
    console.groupEnd();
    /* eslint-enable no-console */
  }

  // Competency data is attached asynchronously by coach-performance-data.js.
  // Scoring must wait for that to resolve — see file header. Falls back to
  // scoring immediately (all "Data pending") if the evidence promise is
  // missing or rejects, rather than hanging the app.
  const evidenceReady = (window.PRECISION_EVIDENCE_READY && typeof window.PRECISION_EVIDENCE_READY.then === "function")
    ? window.PRECISION_EVIDENCE_READY
    : Promise.resolve();
  window.PRECISION_SCORES_READY = evidenceReady.catch(() => {}).then(() => { scoreAllCoaches(); });

  /* Scores an already-averaged set of competency ratings (e.g. org-wide or
     club-wide) against the same model used for individual coaches. `row` is
     a plain object keyed by the same "PILLAR | Competency" source-field
     strings used in danny_competencies_3ps.json — see orgAggregateCompetencies. */
  function scoreAggregateCompetencies(row) { return scoreCompetencyRow(row); }

  /* Average of each of the 9 raw (1-5) competency ratings across a coach
     set, counting only coaches where that specific competency is available
     — never zero-filling a missing rating. Produces a row shaped exactly
     like a single competency source record so it can flow through the same
     scoreCompetencyRow path as a real coach. */
  function orgAggregateCompetencies(coaches) {
    const fields = [];
    PILLAR_KEYS.forEach((pk) => {
      Object.values(COMPETENCY_CONFIG[pk].competencies).forEach((def) => fields.push(def.sourceField));
    });
    const sums = {}, counts = {};
    fields.forEach((f) => { sums[f] = 0; counts[f] = 0; });
    coaches.forEach((c) => {
      const row = c.evidence_sources && c.evidence_sources.competencies;
      if (!row) return;
      fields.forEach((f) => {
        const v = row[f];
        if (v !== null && v !== undefined) { sums[f] += v; counts[f]++; }
      });
    });
    const avgRow = {};
    fields.forEach((f) => { avgRow[f] = counts[f] > 0 ? sums[f] / counts[f] : null; });
    return avgRow;
  }

  /* Parses a coach's dynamic weekly KPI-period columns
     ("<PERIOD LABEL> | <Metric>") into an ordered list of period objects.
     Never hardcodes a period label — new weeks simply append new columns
     upstream. Returns [] unless at least 2 periods have any non-null value
     (binding rule: period-over-period only shown with 2+ valid periods). */
  function kpiPeriods(coach) {
    const row = coach.evidence_sources && coach.evidence_sources.kpi_tracking;
    if (!row) return [];
    const periods = new Map();
    Object.keys(row).forEach((k) => {
      const idx = k.lastIndexOf(" | ");
      if (idx === -1) return; // email / role / club / hire_date, etc.
      const periodLabel = k.slice(0, idx);
      const metric = k.slice(idx + 3);
      if (!periods.has(periodLabel)) periods.set(periodLabel, { periodLabel, conv_pct: null, ac: null, avg_weekly_session: null, pct_recurring_clients: null });
      const bucket = periods.get(periodLabel);
      const value = row[k];
      if (metric === "Conv %") bucket.conv_pct = value;
      else if (metric === "AC") bucket.ac = value;
      else if (metric === "Avg Weekly Session") bucket.avg_weekly_session = value;
      else if (metric === "% Recurring Clients") bucket.pct_recurring_clients = value;
    });
    const list = Array.from(periods.values());
    const validPeriods = list.filter(p => [p.conv_pct, p.ac, p.avg_weekly_session, p.pct_recurring_clients].some(v => v !== null && v !== undefined));
    return validPeriods.length >= 2 ? list : [];
  }

  /* Curriculum completion evidence — a coach can have multiple path rows
     (coach.evidence_sources.curriculum is always an array). Completion is
     inferred from learner_completion_date being set (no "Completed" status
     string is confirmed present in the source's learner_status vocabulary). */
  function curriculumProgress(coach) {
    const rows = (coach.evidence_sources && coach.evidence_sources.curriculum) || [];
    const paths = rows.map(r => ({
      path_title: r.path_title, progress: r.progress, learner_status: r.learner_status,
      due_date: r.due_date, learner_completion_date: r.learner_completion_date,
    }));
    return { paths, completedCount: paths.filter(p => !!p.learner_completion_date).length, totalCount: paths.length };
  }

  /* Aggregate curriculum status across a coach set — real data only. The
     source (coach_curriculum_completion.json) has exactly one path per
     coach with no per-week/per-topic breakdown, so this is a straight
     roll-up of that single real record per coach, never a fabricated
     per-topic completion state. Used by Overview's compact summary and
     Programming's prominent aggregate curriculum block. */
  function curriculumProgressSummary(coaches) {
    let enrolledCount = 0, completedCount = 0, notStartedCount = 0, onTimeCount = 0, progressSum = 0, progressCount = 0;
    coaches.forEach((c) => {
      const cp = curriculumProgress(c);
      if (!cp.totalCount) return;
      enrolledCount++;
      if (cp.completedCount > 0) completedCount++;
      cp.paths.forEach((p) => {
        if (p.progress !== null && p.progress !== undefined) { progressSum += p.progress; progressCount++; }
        if (!p.learner_completion_date) {
          if (p.learner_status === "Not yet started") notStartedCount++;
          else if (p.learner_status === "On time") onTimeCount++;
        }
      });
    });
    return {
      totalCoaches: coaches.length, enrolledCount, completedCount, notStartedCount, onTimeCount,
      avgProgressPct: progressCount ? Math.round(progressSum / progressCount) : null,
    };
  }

  /* Aggregate KPI-period trend (Conversion %) across a coach set — averages
     each period's conv_pct across every coach that has a value for it, not
     a per-coach series. Period order follows Map insertion order, which
     follows the source's own column order (chronological — see
     kpiPeriods() above). Returns [] unless 2+ periods have data, same
     binding rule as the per-coach kpiPeriods(). Shared by Overview's
     week-over-week card and Performance's aggregate trend chart, so both
     pages compute this identically rather than duplicating the rollup. */
  function orgConversionTrend(coaches) {
    const byPeriod = new Map();
    coaches.forEach((c) => {
      (kpiPeriods(c) || []).forEach((p) => {
        if (p.conv_pct === null || p.conv_pct === undefined) return;
        if (!byPeriod.has(p.periodLabel)) byPeriod.set(p.periodLabel, { sum: 0, count: 0 });
        const b = byPeriod.get(p.periodLabel);
        b.sum += p.conv_pct; b.count++;
      });
    });
    const periods = Array.from(byPeriod.entries()).map(([periodLabel, b]) => ({ periodLabel, conv_pct: round1(b.sum / b.count) }));
    return periods.length >= 2 ? periods : [];
  }

  /* ── Lookups & coach-set helpers ─────────────────────────────── */
  // Every helper here draws from D.coaches — the single canonical, approved
  // (directory-controlled) coach collection built in data.js. There is no
  // separate population for any tab: Overview, Professionalism, Performance,
  // Programming, and Coach all read through these same functions.
  function getCoach(coachId) { return D.coaches.find(c => c.coach_id === coachId); }
  function allApprovedCoaches() { return D.coaches; }
  // "Matched" = has a KPI evidence record (pilot_coach_data.json). Independent
  // of competency-score availability — a coach can have one without the other.
  function matchedCoaches() { return D.coaches.filter(c => !!c.raw_performance); }
  function noKpiDataCoaches() { return D.coaches.filter(c => !c.raw_performance); }
  // "Scoreable" = approved coaches with at least one competency rating to score.
  function scoreableCoaches() { return D.coaches.filter(c => hasCompetencyScore(c)); }
  function reliablyScored(coaches) { return coaches.filter(c => c.score_coverage && c.score_coverage.meets_threshold); }

  function sumField(rows, field) { return rows.reduce((s, r) => s + (r[field] || 0), 0); }
  function avgField(rows, field) { return rows.length ? sumField(rows, field) / rows.length : 0; }

  /* Weighted org/club/coach-set aggregation of raw KPIs — EVIDENCE ONLY,
     never fed into scoring. Rates are aggregated as (sum of numerators /
     sum of denominators), NOT as an average of each coach's individual
     rate — averaging percentages directly would distort the result
     whenever coaches have very different volumes. */
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
      performance_score: avg(c => c.performance_score),
      programming_score: avg(c => c.programming_score),
      professionalism_score: avg(c => c.professionalism_score),
    };
  }

  /* ── Club rollups ────────────────────────────────────────────── */
  // Ranked by competency-based overall_score among each club's scoreable
  // (competency-rated) coaches — NOT by KPI-evidence availability.
  function clubRankings() {
    return D.clubs.map((club) => {
      const clubScoreable = scoreableCoaches().filter(c => c.club_number === club.club_number);
      const scored = reliablyScored(clubScoreable);
      const avgScore = scored.length ? Math.round(scored.reduce((s, c) => s + c.overall_score, 0) / scored.length) : null;
      const avgCoveragePct = clubScoreable.length
        ? Math.round((clubScoreable.reduce((s, c) => s + (c.score_coverage ? c.score_coverage.overall_coverage : 0), 0) / clubScoreable.length) * 100)
        : 0;
      return {
        club_number: club.club_number,
        club_name: club.club_name,
        roster_coach_count: club.coach_ids.length, // all approved coaches assigned to this club
        scoreable_coach_count: clubScoreable.length, // of which, have at least one competency rating
        scored_coach_count: scored.length,
        avg_score: avgScore,
        avg_coverage_pct: avgCoveragePct,
      };
    }).sort((a, b) => (b.avg_score ?? -1) - (a.avg_score ?? -1));
  }

  function performanceScoreDistribution() {
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
    COMPETENCY_CONFIG, EVIDENCE_CONFIG, STATUS_BANDS, WEEKS_PER_MONTH, COVERAGE_THRESHOLD,
    statusBandFor, getCoach, pillarEvidence,
    allApprovedCoaches, matchedCoaches, noKpiDataCoaches, scoreableCoaches, hasCompetencyScore, reliablyScored,
    sumField, avgField,
    orgAggregateMetrics, orgAverageScores, orgAggregateCompetencies,
    clubRankings, performanceScoreDistribution,
    scoreCoach, scoreAggregateCompetencies,
    curriculumProgress, kpiPeriods, curriculumProgressSummary, orgConversionTrend,
  };
})();
