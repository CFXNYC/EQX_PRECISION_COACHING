/* ═══════════════════════════════════════════════════════════
   SELF-ASSESSMENT DATA — standalone, informational-only layer
   ---------------------------------------------------------
   Loads ./data/coach_self_assessed_competency_scores.json and
   attaches it onto window.PRECISION_DATA.coaches as coach.
   self_assessment. This is a SEPARATE dataset from the 9-item
   observer-scored competency framework (danny_competencies_3ps.json,
   COACH_ASSESSMENT_LOG) driving Overall Score in calculations.js —
   it is the coach's own 37-item, week-by-week curriculum self-
   reflection (12 Professionalism / 13 Performance / 12 Programming
   items), pre-scored 0-100 per pillar by the source export.

   BINDING DECISION (confirmed with Carlos, 2026-08-04): self-
   assessment is informational only and must NEVER be blended into
   Overall Score, performance_score, professionalism_score, or
   programming_score. calculations.js is not touched by this file.

   Join rule: exact `email` match only, mirroring coach-performance-
   data.js's established convention. Does not modify
   js/coach-performance-data.js or its evidence_sources join at all.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const SELF_ASSESSMENT_URL = "./data/coach_self_assessed_competency_scores.json";

  function normEmail(e) {
    return (e === null || e === undefined) ? "" : String(e).trim().toLowerCase();
  }

  async function fetchSelfAssessment() {
    const bustedUrl = `${SELF_ASSESSMENT_URL}?v=${Date.now()}`;
    const res = await fetch(bustedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`coach_self_assessed_competency_scores.json returned HTTP ${res.status} ${res.statusText}.`);
    const json = await res.json();
    if (!json || !Array.isArray(json.records)) {
      throw new Error("coach_self_assessed_competency_scores.json did not contain a records array.");
    }
    return json;
  }

  async function run() {
    const D = window.PRECISION_DATA;
    const byEmail = new Map();
    if (!D || !Array.isArray(D.coaches)) {
      console.warn("self-assessment-data.js: window.PRECISION_DATA not ready; skipping self-assessment enrichment.");
      window.SELF_ASSESSMENT_DATA = { byEmail, meta: null };
      return { skipped: true };
    }

    let payload;
    try {
      payload = await fetchSelfAssessment();
    } catch (err) {
      console.warn("self-assessment-data.js: failed to load self-assessment data —", err.message);
      window.SELF_ASSESSMENT_DATA = { byEmail, meta: null };
      D.coaches.forEach((c) => { c.self_assessment = null; });
      return { failed: true, error: err.message };
    }

    payload.records.forEach((rec) => {
      const key = normEmail(rec.email);
      if (key) byEmail.set(key, rec);
    });

    let matched = 0;
    D.coaches.forEach((c) => {
      const rec = byEmail.get(normEmail(c.email)) || null;
      c.self_assessment = rec;
      if (rec) matched += 1;
    });

    window.SELF_ASSESSMENT_DATA = { byEmail, meta: payload.scoring || null, generatedAt: payload.generated_at || null };

    /* eslint-disable no-console */
    console.groupCollapsed("%cPrecision Coaching — Self-Assessment Data Quality (internal diagnostics, not shown in UI)", "font-weight:bold");
    console.log(`Loaded ${payload.records.length} self-assessment record(s); matched ${matched} of ${D.coaches.length} pilot coaches by email.`);
    console.groupEnd();

    return { loaded: payload.records.length, matched };
  }

  window.SELF_ASSESSMENT_READY = run();
})();
