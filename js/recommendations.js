/* ═══════════════════════════════════════════════════════════
   RECOMMENDATION ENGINE — evidence-based diagnosis
   ---------------------------------------------------------
   Turns computed Performance/Programming/Professionalism scores
   (calculations.js) plus raw KPI evidence into Wins / Opportunities
   / Recommended Next Steps. Every statement interpolates real,
   traced numbers — nothing is hardcoded per-coach or per-club.

   FIVE DIAGNOSIS RULES (binding — matches the approved diagnosis
   table exactly, replacing the prior Production/Process/Persistence
   rule set):
     1. Low Performance (Closing/Reframing)      → conversion & value-communication gap
     2. Low Professionalism / low Equifit activity → pipeline-generation gap
     3. Low Programming (Structure/Recommendation) → program design & continuity gap
     4. Strong conversion + low recurring rate     → follow-up / retention opportunity
     5. High activity + low conversion             → closing opportunity

   Each rule is gated by data availability: it never fires unless
   its own cited evidence is present (a null score or null KPI
   means the rule is simply omitted, not shown with a placeholder).
   "Low" reuses the Building Momentum band boundary already defined
   in calculations.js (< 70) — no new threshold invented here.

   Recurring Rate and activity-volume baselines have no documented
   absolute target, so "low"/"high" for those two are defined
   RELATIVE to the pilot-wide average among coaches with KPI
   evidence (matchedCoaches()) — a data-driven comparison, not an
   invented absolute cutoff. This baseline set is intentionally the
   KPI-evidence population, not the competency-scored population —
   the two are independently nullable (see calculations.js header).
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const C = window.CALC;

  const LOW_THRESHOLD = C.STATUS_BANDS.find(b => b.label === "Building Momentum").min; // 70 — "low" = < 70

  function pct(v) { return v === null || v === undefined ? "—" : `${Math.round(v * 1000) / 10}%`; }
  function num(v, decimals) {
    if (v === null || v === undefined) return "—";
    const d = decimals === undefined ? 1 : decimals;
    return (Math.round(v * Math.pow(10, d)) / Math.pow(10, d)).toString();
  }
  function firstName(name) { return (name || "").replace(/\s*\*\*$/, "").split(" ")[0]; }

  /* Pilot-wide KPI-evidence baselines — the relative comparison point for
     rules with no documented absolute target. Sourced from matchedCoaches()
     (has raw_performance), independent of competency-score availability. */
  function orgRecurringBaseline() {
    return C.orgAggregateMetrics(C.matchedCoaches()).recurring_rate;
  }
  function orgActivityBaseline() {
    const agg = C.orgAggregateMetrics(C.matchedCoaches());
    return agg.coach_count ? agg.activity_volume / agg.coach_count : null;
  }

  /* ═══════════════════════════════════════════════════════════
     PER-COACH DIAGNOSIS RULES
  ═══════════════════════════════════════════════════════════ */
  function diagnoseCoach(coach) {
    const cm = coach.calculated_metrics; // KPI evidence — independently nullable from competency scores
    const diagnoses = [];
    const recurringBaseline = orgRecurringBaseline();
    const activityBaseline = orgActivityBaseline();

    // Rule 1 — Low Performance (Closing/Reframing) → conversion & value-communication gap
    if (coach.performance_score !== null && coach.performance_score < LOW_THRESHOLD &&
        cm && cm.conversion_rate !== null) {
      diagnoses.push({
        type: "conversion_value_gap",
        statement: `Performance score is ${num(coach.performance_score, 0)} while Conversion Rate is ${pct(cm.conversion_rate)} — a conversion and value-communication gap.`,
        skills: ["Needs analysis", "Value presentation", "Objection handling", "Closing"],
      });
    }

    // Rule 2 — Low Professionalism / low Equifit activity → pipeline-generation gap
    if (coach.professionalism_score !== null && coach.professionalism_score < LOW_THRESHOLD &&
        cm && cm.eqfs_completed !== null && cm.eqfs_completed !== undefined) {
      diagnoses.push({
        type: "pipeline_generation_gap",
        statement: `Professionalism score is ${num(coach.professionalism_score, 0)} with ${num(cm.eqfs_completed, 0)} Equifits completed to date — a pipeline-generation gap.`,
        skills: ["Floor engagement", "Lead generation", "Relationship management", "Visibility"],
      });
    }

    // Rule 3 — Low Programming (Structure/Recommendation) → program design & continuity gap
    if (coach.programming_score !== null && coach.programming_score < LOW_THRESHOLD) {
      diagnoses.push({
        type: "program_design_gap",
        statement: `Programming score is ${num(coach.programming_score, 0)} — a program design and continuity gap.`,
        skills: ["Periodization", "Individualized programming", "Assessment use", "Program recommendation"],
      });
    }

    // Rule 4 — Strong conversion + low recurring rate → follow-up / retention opportunity
    if (cm && cm.conversion_rate !== null && cm.conversion_rate >= 0.45 &&
        cm.recurring_rate !== null && recurringBaseline !== null && cm.recurring_rate < recurringBaseline) {
      diagnoses.push({
        type: "retention_opportunity",
        statement: `Conversion Rate is ${pct(cm.conversion_rate)} (at/above 45%) but Recurring Rate is ${pct(cm.recurring_rate)}, below the pilot average of ${pct(recurringBaseline)} — a follow-up and retention opportunity.`,
        skills: ["Relationship building", "Follow-up systems", "Accountability", "Progress tracking"],
      });
    }

    // Rule 5 — High activity + low conversion → closing opportunity
    if (cm && cm.activity_volume !== null && cm.activity_volume !== undefined && activityBaseline !== null && cm.activity_volume >= activityBaseline &&
        cm.conversion_rate !== null && cm.conversion_rate < 0.45) {
      diagnoses.push({
        type: "closing_opportunity",
        statement: `Activity Volume is ${num(cm.activity_volume, 0)} (at/above the pilot average of ${num(activityBaseline, 0)}) while Conversion Rate is ${pct(cm.conversion_rate)} — a closing opportunity.`,
        skills: ["Needs analysis", "Value communication", "Objection handling", "Closing"],
      });
    }

    return diagnoses;
  }

  /* ── SKILLS_MATRIX mapping — competency → evidence KPI, development
     focus, and recommended skills. Sourced directly from the SOURCE OF
     TRUTH workbook's SKILLS_MATRIX tab (pillar, assessment_competency,
     kpi, skill_category, specific_skills columns). Keys match
     calculations.js's COMPETENCY_CONFIG competency keys exactly.

     KNOWN GAP: `coaching` and `recommendation` (Programming pillar)
     could not be confirmed against SKILLS_MATRIX rows 9+ — the source
     workbook was unavailable when this was built. Left as `null` rather
     than invented; primaryDevelopmentFocus() falls back to the
     competency label alone when a mapping is missing. Fill in from
     SKILLS_MATRIX rows for "Coaching" and "Recommendation" when
     available. */
  const SKILLS_MATRIX_CONFIG = {
    engaging: { evidenceKpi: "CPTs Completed", developmentFocus: "Client Experience", recommendedSkills: ["Personalization", "communication", "motivation", "consistency in delivery"] },
    closing: { evidenceKpi: "Conversion", developmentFocus: "Sales & Conversion", recommendedSkills: ["Needs analysis", "presenting value", "objection handling", "closing", "linking assessment to solution"] },
    reframing: { evidenceKpi: "Conversion", developmentFocus: "Sales & Conversion", recommendedSkills: ["Needs analysis", "presenting value", "objection handling", "closing", "linking assessment to solution"] },
    mindset: { evidenceKpi: "Equifits Booked", developmentFocus: "Relationship Management", recommendedSkills: ["Building relationships with MAs", "team collaboration", "referrals"] },
    elevatorPitch: { evidenceKpi: "Leads Generated via Special Event, Fitness Specialist, PTM, MAs", developmentFocus: "Communication", recommendedSkills: ["Clear articulation of services", "confidence", "body language", "professionalism in client interactions"] },
    floorPresence: { evidenceKpi: "Equifits Completed", developmentFocus: "Lead Generation", recommendedSkills: ["Networking", "recruiting leads", "floor engagement", "building visibility in club"] },
    structure: { evidenceKpi: "SPU (Sessions Per Unit)", developmentFocus: "Program Compliance", recommendedSkills: ["Following program structure", "session execution consistency", "adherence to periodization", "tracking client progress"] },
    coaching: null,
    recommendation: null,
  };

  /* ── Competency-level strongest/weakest lookup (for wins/opportunities) ── */
  const PILLAR_LABELS = { performance: "Performance", programming: "Programming", professionalism: "Professionalism" };
  function flattenCompetencyDetail(coach) {
    if (!coach.score_detail) return [];
    const out = [];
    Object.keys(PILLAR_LABELS).forEach((pillar) => {
      const detail = coach.score_detail[pillar];
      if (!detail) return;
      Object.entries(detail).forEach(([key, m]) => {
        if (m.available) out.push({ pillar, pillarLabel: PILLAR_LABELS[pillar], key, label: m.label, normalized: m.normalized, raw: m.raw });
      });
    });
    return out;
  }
  function strongestCompetency(coach) {
    const list = flattenCompetencyDetail(coach);
    return list.length ? list.slice().sort((a, b) => b.normalized - a.normalized)[0] : null;
  }
  function weakestCompetency(coach) {
    const list = flattenCompetencyDetail(coach);
    return list.length ? list.slice().sort((a, b) => a.normalized - b.normalized)[0] : null;
  }

  /* Single ranked development focus per coach — the coach's weakest
     rated competency, paired with its SKILLS_MATRIX evidence KPI and
     recommended skills. Matches coach_competency_scores.json's schema
     (primary_development_pillar / development_competency / evidence_kpi
     / recommended_skills / next_coaching_action) so this activates
     automatically once real competency ratings replace the currently
     all-null danny_competencies_3ps.json — no wiring change needed. */
  function primaryDevelopmentFocus(coachId) {
    const coach = C.getCoach(coachId);
    if (!coach) return null;
    const weak = weakestCompetency(coach);
    if (!weak) return null;
    const mapping = SKILLS_MATRIX_CONFIG[weak.key];
    const skills = mapping ? mapping.recommendedSkills : null;
    return {
      primary_development_pillar: weak.pillarLabel,
      development_competency: weak.label,
      competency_score: weak.normalized,
      evidence_kpi: mapping ? mapping.evidenceKpi : null,
      development_focus: mapping ? mapping.developmentFocus : null,
      recommended_skills: skills,
      next_coaching_action: skills
        ? `Manager observation focus: ${skills.slice(0, 3).join(", ")}.`
        : `Manager observation focus: ${weak.label} (${weak.pillarLabel}).`,
    };
  }

  /* ═══════════════════════════════════════════════════════════
     COACH-LEVEL (Coach profile page)
  ═══════════════════════════════════════════════════════════ */
  function coachIntelligence(coachId) {
    const coach = C.getCoach(coachId);
    if (!coach) return { strengths: [], opportunities: [], nextSteps: [] };
    const name = firstName(coach.display_name);
    const diagnoses = diagnoseCoach(coach);
    const strong = strongestCompetency(coach);
    const weak = weakestCompetency(coach);
    const cm = coach.calculated_metrics;
    const hasCompetencyRow = C.hasCompetencyScore(coach);

    const strengths = [];
    if (strong) strengths.push(`${strong.label} (${strong.pillarLabel}) is ${name}'s strongest rated competency at ${num(strong.normalized, 0)}/100.`);
    if (cm && cm.repurchase_rate !== null && cm.repurchase_rate >= 0.5) {
      strengths.push(`Program Repurchase Rate is ${pct(cm.repurchase_rate)} — over half of first-time-booked clients repurchase.`);
    }
    if (!strengths.length) {
      strengths.push(hasCompetencyRow ? `No competency currently stands out as a strength.` : `Competency ratings are Data pending for ${name}.`);
    }

    const opportunities = [];
    if (weak) opportunities.push(`${weak.label} (${weak.pillarLabel}) is ${name}'s lowest-rated competency at ${num(weak.normalized, 0)}/100.`);
    diagnoses.forEach((d) => opportunities.push(d.statement));
    if (!opportunities.length) opportunities.push(`No evidence-based opportunities detected against current data.`);

    const nextSteps = [];
    diagnoses.forEach((d) => nextSteps.push(`Coach on ${d.skills.join(", ").toLowerCase()} — ${d.statement}`));
    if (!nextSteps.length && weak) nextSteps.push(`Focus the next coaching conversation on ${weak.label} — currently rated ${num(weak.normalized, 0)}/100.`);
    if (hasCompetencyRow && coach.score_coverage && !coach.score_coverage.meets_threshold) {
      nextSteps.push(`Competency coverage is ${coach.coverage_label} — confirm ratings are being logged before acting on this score.`);
    }
    if (!nextSteps.length) nextSteps.push(`Data pending — no competency ratings available yet for ${name}.`);

    return { strengths, opportunities, nextSteps };
  }

  /* ═══════════════════════════════════════════════════════════
     ORG-LEVEL (Overview page)
  ═══════════════════════════════════════════════════════════ */
  function orgIntelligence() {
    const scoreable = C.scoreableCoaches();
    const scored = C.reliablyScored(scoreable);
    const orgAvg = C.orgAverageScores(scoreable);
    const rankings = C.clubRankings().filter(r => r.avg_score !== null);
    const topClub = rankings[0];
    const bottomClub = rankings[rankings.length - 1];

    const diagCounts = { conversion_value_gap: 0, pipeline_generation_gap: 0, program_design_gap: 0, retention_opportunity: 0, closing_opportunity: 0 };
    scored.forEach((c) => { diagnoseCoach(c).forEach((d) => { diagCounts[d.type] = (diagCounts[d.type] || 0) + 1; }); });

    const onTrackCount = scored.filter(c => c.overall_score >= LOW_THRESHOLD).length;

    const wins = [];
    if (topClub) wins.push(`${topClub.club_name} leads all pilot clubs with an average score of ${topClub.avg_score} across ${topClub.scored_coach_count} scored coaches.`);
    if (scored.length) wins.push(`${onTrackCount} of ${scored.length} scored coaches (${Math.round((onTrackCount / scored.length) * 100)}%) are at Building Momentum or above.`);
    if (orgAvg.overall_score !== null) wins.push(`The pilot's average score is ${orgAvg.overall_score} across ${orgAvg.scored_count} reliably scored coaches (${scoreable.length} of ${C.allApprovedCoaches().length} pilot coaches have at least one competency rating).`);
    if (!wins.length) wins.push(`Competency ratings are Data pending pilot-wide — wins will populate once ratings are logged.`);

    const opportunities = [];
    if (bottomClub) opportunities.push(`${bottomClub.club_name} trails the pilot at an average score of ${bottomClub.avg_score}.`);
    if (diagCounts.pipeline_generation_gap) opportunities.push(`${diagCounts.pipeline_generation_gap} of ${scored.length} scored coaches show a pipeline-generation gap.`);
    if (diagCounts.conversion_value_gap) opportunities.push(`${diagCounts.conversion_value_gap} of ${scored.length} scored coaches show a conversion and value-communication gap.`);
    if (diagCounts.program_design_gap) opportunities.push(`${diagCounts.program_design_gap} of ${scored.length} scored coaches show a program design and continuity gap.`);
    if (!opportunities.length) opportunities.push(`No pilot-wide evidence-based gaps detected against current data.`);

    const actions = [];
    if (diagCounts.conversion_value_gap) actions.push(`Run needs-analysis and closing training for the ${diagCounts.conversion_value_gap} coach${diagCounts.conversion_value_gap === 1 ? "" : "es"} showing a conversion gap.`);
    if (diagCounts.pipeline_generation_gap) actions.push(`Reinforce floor engagement and lead-generation standards with the ${diagCounts.pipeline_generation_gap} coach${diagCounts.pipeline_generation_gap === 1 ? "" : "es"} showing a pipeline-generation gap.`);
    if (diagCounts.program_design_gap) actions.push(`Review programming and periodization practices with the ${diagCounts.program_design_gap} coach${diagCounts.program_design_gap === 1 ? "" : "es"} showing a program design gap.`);
    if (diagCounts.retention_opportunity) actions.push(`Review follow-up and retention systems with the ${diagCounts.retention_opportunity} coach${diagCounts.retention_opportunity === 1 ? "" : "es"} showing a retention opportunity.`);
    if (topClub && bottomClub && topClub.club_name !== bottomClub.club_name) actions.push(`Share ${topClub.club_name}'s coaching cadence as a model for ${bottomClub.club_name}.`);
    if (!actions.length) actions.push(`Continue current coaching cadence — no urgent evidence-based gaps detected pilot-wide.`);

    return { wins, opportunities, actions };
  }

  window.RECS = { orgIntelligence, coachIntelligence, diagnoseCoach, strongestCompetency, weakestCompetency, primaryDevelopmentFocus };
})();
