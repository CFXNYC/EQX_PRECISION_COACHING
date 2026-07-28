/* ═══════════════════════════════════════════════════════════
   RECOMMENDATION ENGINE — KPI-based diagnosis
   ---------------------------------------------------------
   Turns computed Three Ps scores + raw KPIs (from calculations.js)
   into Wins / Opportunities / Recommended Next Steps. Every
   statement here interpolates real, traced numbers — nothing is
   hardcoded per-coach or per-club.

   DIAGNOSIS THRESHOLDS
   --------------------
   "High" / "low" activity or score signals reuse the Three Ps
   performance bands already defined in calculations.js (On Track
   = 75+, Needs Support/Developing boundary = 60) — no new
   thresholds invented here.

   Recurring Rate and Repurchase Rate have no documented absolute
   target (see calculations.js SCORING_CONFIG.unscored_metrics), so
   "low" for those two is defined RELATIVE to the pilot-wide average
   among scoreable coaches — a data-driven comparison, not an
   invented absolute cutoff.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const D = window.PRECISION_DATA;
  const C = window.CALC;

  const ON_TRACK_MIN = C.STATUS_BANDS.find(b => b.label === "On Track").min;       // 75
  const NEEDS_SUPPORT_MAX = C.STATUS_BANDS.find(b => b.label === "Needs Support").max; // 59 (i.e. "low" = < 60)

  function pct(v) { return v === null || v === undefined ? "—" : `${Math.round(v * 1000) / 10}%`; }
  function num(v, decimals) {
    if (v === null || v === undefined) return "—";
    const d = decimals === undefined ? 1 : decimals;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString();
  }
  function firstName(name) { return (name || "").replace(/\s*\*\*$/, "").split(" ")[0]; }

  /* Pilot-wide average recurring rate among all scoreable coaches with the
     metric available — the relative baseline used for "low recurring rate"
     since no absolute target exists for this metric. */
  function orgRecurringBaseline() {
    const agg = C.orgAggregateMetrics(C.scoreableCoaches());
    return agg.recurring_rate;
  }

  /* ═══════════════════════════════════════════════════════════
     PER-COACH DIAGNOSIS RULES
  ═══════════════════════════════════════════════════════════ */
  function diagnoseCoach(coach) {
    if (!coach.raw_performance || !coach.calculated_metrics) return [];
    const cm = coach.calculated_metrics;
    const diagnoses = [];
    const recurringBaseline = orgRecurringBaseline();

    // Rule 1 — High activity (Process) + low conversion → Closing Issue
    if (coach.process_score !== null && coach.process_score >= ON_TRACK_MIN &&
        cm.conversion_rate !== null && cm.conversion_rate < 0.45) {
      diagnoses.push({
        type: "closing_issue",
        category: "opportunity",
        statement: `Process score is ${num(coach.process_score, 0)} (high activity) while Conversion Rate is ${pct(cm.conversion_rate)}, below the 45% target — a closing issue.`,
        skills: ["Objection handling", "Value communication"],
      });
    }

    // Rule 2 — Low activity (Process) → Pipeline Issue
    if (coach.process_score !== null && coach.process_score < NEEDS_SUPPORT_MAX + 1) {
      diagnoses.push({
        type: "pipeline_issue",
        category: "opportunity",
        statement: `Process score is ${num(coach.process_score, 0)}, below the Developing threshold (60) — a pipeline issue driven by low Equifit/CPT activity relative to target.`,
        skills: ["Lead generation", "Floor engagement"],
      });
    }

    // Rule 3 — High conversion + low retention → Follow-Up Issue
    if (cm.conversion_rate !== null && cm.conversion_rate >= 0.45 &&
        cm.recurring_rate !== null && recurringBaseline !== null && cm.recurring_rate < recurringBaseline) {
      diagnoses.push({
        type: "follow_up_issue",
        category: "opportunity",
        statement: `Conversion Rate is ${pct(cm.conversion_rate)} (at/above the 45% target) but Recurring Rate is ${pct(cm.recurring_rate)}, below the pilot average of ${pct(recurringBaseline)} — a follow-up issue.`,
        skills: ["Relationship building", "Follow-up systems"],
      });
    }

    // Rule 4 — Low recurring rate (standalone)
    if (cm.recurring_rate !== null && recurringBaseline !== null && cm.recurring_rate < recurringBaseline) {
      diagnoses.push({
        type: "low_recurring_rate",
        category: "opportunity",
        statement: `Recurring Rate is ${pct(cm.recurring_rate)}, below the pilot average of ${pct(recurringBaseline)}.`,
        skills: ["Relationship building", "Recurring scheduling", "Follow-up systems"],
      });
    }

    // Rule 5 — High Process + low Production → activity not translating to outcomes
    if (coach.process_score !== null && coach.process_score >= ON_TRACK_MIN &&
        coach.production_score !== null && coach.production_score < NEEDS_SUPPORT_MAX + 1) {
      diagnoses.push({
        type: "process_vs_production",
        category: "interpretation",
        statement: `Process score (${num(coach.process_score, 0)}) is strong while Production score (${num(coach.production_score, 0)}) lags — strong activity is not yet translating into outcomes.`,
        skills: ["Conversion coaching", "Client acquisition"],
      });
    }

    // Rule 6 — High Production + low Persistence → results not yet sustainable
    if (coach.production_score !== null && coach.production_score >= ON_TRACK_MIN &&
        coach.persistence_score !== null && coach.persistence_score < NEEDS_SUPPORT_MAX + 1) {
      diagnoses.push({
        type: "production_vs_persistence",
        category: "interpretation",
        statement: `Production score (${num(coach.production_score, 0)}) is strong while Persistence score (${num(coach.persistence_score, 0)}) lags — results are not yet sustainable.`,
        skills: ["Session cadence", "Client scheduling consistency"],
      });
    }

    return diagnoses;
  }

  /* ── Metric-level strongest/weakest lookup (for wins/opportunities) ── */
  function flattenMetricDetail(coach) {
    if (!coach.score_detail) return [];
    const out = [];
    ["production", "process", "persistence"].forEach((cat) => {
      Object.entries(coach.score_detail[cat]).forEach(([key, m]) => {
        if (m.available) out.push({ category: cat, key, ...m });
      });
    });
    return out;
  }
  function strongestMetric(coach) {
    const list = flattenMetricDetail(coach);
    return list.length ? list.slice().sort((a, b) => b.score - a.score)[0] : null;
  }
  function weakestMetric(coach) {
    const list = flattenMetricDetail(coach);
    return list.length ? list.slice().sort((a, b) => a.score - b.score)[0] : null;
  }
  function formatMetricActual(m) {
    if (m.unit === "%") return pct(m.actual);
    if (m.unit) return `${num(m.actual, 1)}${m.unit}`;
    return num(m.actual, 1);
  }
  function formatMetricTarget(m) {
    if (m.target && typeof m.target === "object") return `${m.target.min}-${m.target.max}`;
    if (m.unit === "%") return pct(m.target);
    return `${m.target}${m.unit || ""}`;
  }

  /* ═══════════════════════════════════════════════════════════
     COACH-LEVEL (Coach profile page)
  ═══════════════════════════════════════════════════════════ */
  function coachIntelligence(coachId) {
    const coach = C.getCoach(coachId);
    if (!coach || !coach.raw_performance || !coach.calculated_metrics) {
      return { strengths: [], opportunities: [], nextSteps: [] };
    }
    const name = firstName(coach.display_name);
    const diagnoses = diagnoseCoach(coach);
    const strong = strongestMetric(coach);
    const weak = weakestMetric(coach);

    const strengths = [];
    if (strong && strong.score >= 100) {
      strengths.push(`${strong.label} is ${name}'s strongest metric at ${formatMetricActual(strong)} — at or above the target of ${formatMetricTarget(strong)}.`);
    } else if (strong) {
      strengths.push(`${strong.label} is ${name}'s strongest metric at ${formatMetricActual(strong)} against a target of ${formatMetricTarget(strong)}.`);
    }
    if (coach.calculated_metrics.repurchase_rate !== null && coach.calculated_metrics.repurchase_rate >= 0.5) {
      strengths.push(`Repurchase Rate is ${pct(coach.calculated_metrics.repurchase_rate)} — over half of first-time-booked clients repurchase.`);
    }
    if (!strengths.length) strengths.push(`No metric currently exceeds its target — see Opportunities for the highest-leverage gap.`);

    const opportunities = [];
    if (weak) {
      opportunities.push(`${weak.label} is ${name}'s lowest-scoring metric at ${formatMetricActual(weak)} against a target of ${formatMetricTarget(weak)}.`);
    }
    diagnoses.filter(d => d.category === "opportunity").forEach(d => opportunities.push(d.statement));
    diagnoses.filter(d => d.category === "interpretation").forEach(d => opportunities.push(d.statement));
    if (!opportunities.length) opportunities.push(`No KPI gaps detected against current targets.`);

    const nextSteps = [];
    diagnoses.forEach((d) => {
      nextSteps.push(`Coach on ${d.skills.join(" and ").toLowerCase()} — ${d.statement}`);
    });
    if (!nextSteps.length && weak) {
      nextSteps.push(`Focus the next coaching conversation on ${weak.label} — currently ${formatMetricActual(weak)} against a target of ${formatMetricTarget(weak)}.`);
    }
    if (!coach.score_coverage.meets_threshold) {
      nextSteps.push(`Data coverage is ${pct(coach.score_coverage.overall_coverage)}, below the 60% reliability threshold — confirm activity is being logged before acting on this score.`);
    }

    return { strengths, opportunities, nextSteps };
  }

  /* ═══════════════════════════════════════════════════════════
     ORG-LEVEL (Overview page)
  ═══════════════════════════════════════════════════════════ */
  function orgIntelligence() {
    const scoreable = C.scoreableCoaches();
    const scored = C.reliablyScored(scoreable);
    const orgAvg = C.orgAverageScores(scoreable);
    const orgAgg = C.orgAggregateMetrics(scoreable);
    const rankings = C.clubRankings().filter(r => r.avg_score !== null);
    const topClub = rankings[0];
    const bottomClub = rankings[rankings.length - 1];

    const diagCounts = { closing_issue: 0, pipeline_issue: 0, follow_up_issue: 0, low_recurring_rate: 0, process_vs_production: 0, production_vs_persistence: 0 };
    scored.forEach((c) => { diagnoseCoach(c).forEach((d) => { diagCounts[d.type] = (diagCounts[d.type] || 0) + 1; }); });

    const avgActiveClients = orgAgg.coach_count ? orgAgg.active_clients / orgAgg.coach_count : null;
    const orgMetrics = [
      { key: "active_clients", label: "Active Clients", actual: avgActiveClients, target: 12, targetLabel: "12-15", unit: "" },
      { key: "conversion_rate", label: "Conversion Rate", actual: orgAgg.conversion_rate, target: 0.45, targetLabel: "45%", unit: "%" },
      { key: "equifits_per_month", label: "Equifits / Month", actual: orgAgg.equifits_per_month, target: 12, targetLabel: "12/mo", unit: "/mo" },
      { key: "cpt_per_week", label: "CPTs / Week", actual: orgAgg.cpt_per_week, target: 3, targetLabel: "3/wk", unit: "/wk" },
      { key: "sessions_per_month", label: "Sessions / Month", actual: orgAgg.sessions_per_month, target: 90, targetLabel: "90/mo", unit: "/mo" },
    ].filter(m => m.actual !== null && m.actual !== undefined)
      .map(m => ({ ...m, attainment: m.actual / m.target }));
    const strongestOrgMetric = orgMetrics.length ? orgMetrics.slice().sort((a, b) => b.attainment - a.attainment)[0] : null;
    const weakestOrgMetric = orgMetrics.length ? orgMetrics.slice().sort((a, b) => a.attainment - b.attainment)[0] : null;
    const fmtOrgActual = (m) => (m.unit === "%" ? pct(m.actual) : `${num(m.actual, 1)}${m.unit}`);

    const onTrackCount = scored.filter(c => c.overall_score >= ON_TRACK_MIN).length;

    const wins = [];
    if (topClub) wins.push(`${topClub.club_name} leads all pilot clubs with an average Three Ps score of ${topClub.avg_score} across ${topClub.scored_coach_count} scored coaches.`);
    if (strongestOrgMetric) wins.push(`${strongestOrgMetric.label} is the strongest metric pilot-wide at ${fmtOrgActual(strongestOrgMetric)} against a target of ${strongestOrgMetric.targetLabel}.`);
    if (scored.length) wins.push(`${onTrackCount} of ${scored.length} scored coaches (${Math.round((onTrackCount / scored.length) * 100)}%) are On Track or Excelling on the Three Ps model.`);
    if (orgAvg.overall_score !== null) wins.push(`The pilot's average Three Ps score is ${orgAvg.overall_score} across ${orgAvg.scored_count} reliably scored coaches.`);

    const opportunities = [];
    if (bottomClub) opportunities.push(`${bottomClub.club_name} trails the pilot at an average Three Ps score of ${bottomClub.avg_score}.`);
    if (weakestOrgMetric) opportunities.push(`${weakestOrgMetric.label} is the softest metric pilot-wide at ${fmtOrgActual(weakestOrgMetric)} against a target of ${weakestOrgMetric.targetLabel}.`);
    if (diagCounts.pipeline_issue) opportunities.push(`${diagCounts.pipeline_issue} of ${scored.length} scored coaches show a pipeline issue — activity well below target.`);
    if (diagCounts.closing_issue) opportunities.push(`${diagCounts.closing_issue} of ${scored.length} scored coaches show a closing issue — high activity not converting.`);
    if (!opportunities.length) opportunities.push(`No pilot-wide KPI gaps detected against current targets.`);

    const actions = [];
    if (diagCounts.closing_issue) actions.push(`Run objection-handling and value-communication training for the ${diagCounts.closing_issue} coach${diagCounts.closing_issue === 1 ? "" : "es"} showing a closing issue.`);
    if (diagCounts.pipeline_issue) actions.push(`Reinforce lead generation and floor engagement standards with the ${diagCounts.pipeline_issue} coach${diagCounts.pipeline_issue === 1 ? "" : "es"} showing a pipeline issue.`);
    if (diagCounts.follow_up_issue || diagCounts.low_recurring_rate) actions.push(`Review follow-up and recurring-scheduling systems — ${diagCounts.low_recurring_rate} coach${diagCounts.low_recurring_rate === 1 ? "" : "es"} sit below the pilot's recurring-rate average.`);
    if (topClub && bottomClub && topClub.club_name !== bottomClub.club_name) actions.push(`Share ${topClub.club_name}'s coaching cadence as a model for ${bottomClub.club_name}.`);
    if (!actions.length) actions.push(`Continue current coaching cadence — no urgent KPI gaps detected pilot-wide.`);

    return { wins, opportunities, actions };
  }

  window.RECS = { orgIntelligence, coachIntelligence, diagnoseCoach, strongestMetric, weakestMetric, formatMetricActual, formatMetricTarget };
})();
