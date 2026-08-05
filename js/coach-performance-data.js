/* ═══════════════════════════════════════════════════════════
   COACH PERFORMANCE DATA — evidence-layer enrichment
   ---------------------------------------------------------
   Loads four OPTIONAL evidence sources and joins them onto the
   already-built window.PRECISION_DATA model from data.js:
     ./data/danny_competencies_3ps.json       (9 competency ratings, 1-5)
     ./data/danny_kpi_tracking.json           (weekly KPI snapshots)
     ./data/coach_curriculum_completion.json  (learning completion)
     ./data/lead_tracker_summary.json         (club-level lead totals)

   These are OPTIONAL, unlike pilot_coach_data.json /
   pilot_coach_directory.json in data.js. Every fetch here goes
   through Promise.allSettled — a missing or malformed file degrades
   its own evidence section to "Data pending" and never breaks the
   globe, navigation, or any other view.

   Join rules (binding, do not deviate):
     - Competencies / KPI tracking: exact `email` match only (both
       files carry `email` on every row, matching the directory's
       email exactly).
     - Curriculum completion: `email` primary; falls back to a
       normalized first+last name match ONLY when email doesn't
       resolve. An ambiguous fallback match (the normalized name
       resolves to more than one directory coach) is EXCLUDED from
       the join entirely — never merged — and logged via
       console.warn only, never surfaced in the UI.
     - Lead totals: club-level only, via STRICT raw-ID matching
       (String(lead.club_number) === String(club.club_number)).
       CLUB_NORM.normalize() / canonical names / aliases are never
       used for this join. Never attached to an individual coach.
     - Club market (from club_map_data.json, loaded later in the
       pipeline by club-map-data.js): STRICT raw-ID matching only
       (String(record.club_id) === String(club.club_number)) via
       window.CLUB_MAP_DATA.recordsById. Never via CLUB_NORM.

   Source records are never mutated. Results are attached under a
   new, namespaced key: coach.evidence_sources = { competencies,
   kpi_tracking, curriculum }. Existing coach.raw_performance is
   untouched.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const COMPETENCIES_URL = "./data/danny_competencies_3ps.json";
  const OBSERVER_ASSESSMENT_URL = "./data/coach_competency_scores.json";
  const KPI_TRACKING_URL = "./data/danny_kpi_tracking.json";
  const CURRICULUM_URL = "./data/coach_curriculum_completion.json";
  const LEAD_TOTALS_URL = "./data/lead_tracker_summary.json";

  /* ── Fetch (fail-soft) ───────────────────────────────────────
     Mirrors data.js's fetch/coerce conventions (cache-busted,
     cache:"no-store", tolerant of a { records: [...] } wrapper),
     but every call here is wrapped so a single bad/missing source
     can never throw past this module. */
  function coerceArray(json, label) {
    if (Array.isArray(json)) return json;
    if (json && typeof json === "object") {
      for (const key of ["records", "data", "rows", "results"]) {
        if (Array.isArray(json[key])) return json[key];
      }
    }
    throw new Error(`${label} did not contain a JSON array (or a recognized wrapper).`);
  }

  async function fetchJson(url, label) {
    const bustedUrl = `${url}?v=${Date.now()}`;
    const res = await fetch(bustedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`${label} (${url}) returned HTTP ${res.status} ${res.statusText}.`);
    const json = await res.json();
    return coerceArray(json, label);
  }

  function normEmail(e) {
    return (e === null || e === undefined) ? "" : String(e).trim().toLowerCase();
  }

  function emptyEvidence() {
    return { competencies: null, kpi_tracking: null, curriculum: [] };
  }

  /* Extracts the leading club-number digits from the Danny files'
     "105-EQ - East 63rd Street" style club field. Diagnostic use
     only (cross-checking against the coach's directory club_number)
     — never used as a join key itself (the coach join is by email). */
  function extractClubNumberFromDannyClubField(clubField) {
    if (!clubField) return null;
    const m = String(clubField).match(/^(\d+)-EQ/);
    return m ? m[1] : null;
  }

  /* ── Diagnostics ─────────────────────────────────────────────
     A separate console group from data.js's own Data Quality
     Report, scoped to the four evidence sources only. Internal
     only — never rendered in the UI. */
  function logEvidenceDataQuality(report) {
    /* eslint-disable no-console */
    console.groupCollapsed("%cPrecision Coaching — Evidence Sources Data Quality (internal diagnostics, not shown in UI)", "font-weight:bold");
    ["competencies", "observer_assessment", "kpi_tracking", "curriculum", "lead_totals", "club_market"].forEach((key) => {
      const s = report[key];
      if (!s) return;
      console.log(`${key}:`, s);
    });
    console.groupEnd();
    /* eslint-enable no-console */
  }

  async function run() {
    const D = window.PRECISION_DATA;
    if (!D || !Array.isArray(D.coaches)) {
      console.warn("coach-performance-data.js: window.PRECISION_DATA not ready; skipping evidence enrichment.");
      window.PRECISION_EVIDENCE_READY = Promise.resolve({ skipped: true });
      return;
    }

    // Ensure every coach has the namespaced evidence container, even
    // if every optional source fails to load.
    D.coaches.forEach((c) => { c.evidence_sources = emptyEvidence(); });

    const coachByEmail = new Map();
    D.coaches.forEach((c) => {
      const key = normEmail(c.email);
      if (key) coachByEmail.set(key, c);
    });

    // Array-based name index for the curriculum fallback join's
    // ambiguity guard. data.js's own directory index already dedups
    // D.coaches to one entry per normalized name today, so this is
    // structurally 1:1 in current data — this index exists so the
    // ambiguity check below is correct if that upstream invariant
    // ever changes, rather than silently merging a future collision.
    const coachesByNormalizedName = new Map();
    D.coaches.forEach((c) => {
      const arr = coachesByNormalizedName.get(c.normalized_name) || [];
      arr.push(c);
      coachesByNormalizedName.set(c.normalized_name, arr);
    });

    const [competenciesResult, observerAssessmentResult, kpiResult, curriculumResult, leadResult] = await Promise.allSettled([
      fetchJson(COMPETENCIES_URL, "danny_competencies_3ps.json"),
      fetchJson(OBSERVER_ASSESSMENT_URL, "coach_competency_scores.json"),
      fetchJson(KPI_TRACKING_URL, "danny_kpi_tracking.json"),
      fetchJson(CURRICULUM_URL, "coach_curriculum_completion.json"),
      fetchJson(LEAD_TOTALS_URL, "lead_tracker_summary.json"),
    ]);

    const report = {};

    /* ── Competencies (email-exact only) ───────────────────── */
    if (competenciesResult.status === "fulfilled") {
      let matched = 0;
      const unmatchedEmails = [];
      const clubMismatches = [];
      competenciesResult.value.forEach((row) => {
        const coach = coachByEmail.get(normEmail(row.email));
        if (!coach) { unmatchedEmails.push(row.email); return; }
        coach.evidence_sources.competencies = row;
        matched++;
        const rowClubNumber = extractClubNumberFromDannyClubField(row.club);
        if (rowClubNumber && coach.club_number && rowClubNumber !== String(coach.club_number)) {
          clubMismatches.push({ email: row.email, source_club: row.club, directory_club_number: coach.club_number });
        }
      });
      report.competencies = { loaded: competenciesResult.value.length, matched, unmatched: unmatchedEmails.length, unmatchedEmails, clubMismatches };
    } else {
      report.competencies = { failed: true, error: competenciesResult.reason && competenciesResult.reason.message };
    }

    /* ── Observer-scored in-person workshop assessment ─────────
       (coach_competency_scores.json, from the SOURCE OF TRUTH
       workbook's COACH_ASSESSMENT_LOG tab). Real per-coach 1-5
       ratings — overwrites the (currently all-null) danny_competencies_3ps.json
       placeholder above for any coach with a real assessment on record.
       No email field in this source; joined by normalized coach_name
       (same ambiguity-safe pattern as the curriculum join below — an
       ambiguous name match is excluded, never merged), with club_number
       cross-checked for a diagnostic-only mismatch flag. Transformed
       into the flat "PERFORMANCE | Engaging" style keys COMPETENCY_CONFIG
       (calculations.js) already expects — the app's binding 50/30/20
       Overall Score formula is computed from these raw ratings by the
       existing engine, never from this source's own precomputed
       overall_competency_score (that field uses the workbook's internal
       equal-weighted average, a different — and not binding — formula). */
    if (observerAssessmentResult.status === "fulfilled") {
      let matched = 0, excludedAmbiguous = 0;
      const unmatched = [];
      const clubMismatches = [];
      const normalizeFn = window.PRECISION_NORMALIZE_COACH_NAME || ((s) => String(s || "").toLowerCase().trim());
      observerAssessmentResult.value.forEach((row) => {
        const key = normalizeFn(row.coach_name || "");
        const candidates = coachesByNormalizedName.get(key) || [];
        let coach = null;
        if (candidates.length === 1) {
          coach = candidates[0];
        } else if (candidates.length > 1) {
          excludedAmbiguous++;
          console.warn(
            "coach-performance-data.js: ambiguous observer-assessment name match excluded (not merged).",
            { assessment_id: row.assessment_id, name: row.coach_name, candidateCoachIds: candidates.map((c) => c.coach_id) }
          );
          return;
        } else {
          unmatched.push({ assessment_id: row.assessment_id, name: row.coach_name, club: row.club });
          return;
        }
        if (row.club && coach.club_number && String(row.club) !== String(coach.club_number)) {
          clubMismatches.push({ name: row.coach_name, source_club: row.club, directory_club_number: coach.club_number });
        }
        const perf = (row.competencies && row.competencies.performance) || {};
        const prof = (row.competencies && row.competencies.professionalism) || {};
        const prog = (row.competencies && row.competencies.programming) || {};
        coach.evidence_sources.competencies = {
          "PERFORMANCE | Engaging": perf.engaging,
          "PERFORMANCE | Closing": perf.closing,
          "PERFORMANCE | Reframing": perf.reframing,
          "PROFESSIONALISM | Mindset": prof.mindset,
          "PROFESSIONALISM | Elevator Pitch": prof.elevator_pitch,
          "PROFESSIONALISM | Floor Presence": prof.floor_presence,
          "PROGRAMMING | Structure": prog.structure,
          "PROGRAMMING | Coaching": prog.coaching,
          "PROGRAMMING | Recommendation": prog.recommendation,
          assessment_id: row.assessment_id,
          assessment_date: row.assessment_date,
          assessment_status: row.assessment_status,
          source: "coach_competency_scores.json",
        };
        matched++;
      });
      report.observer_assessment = { loaded: observerAssessmentResult.value.length, matched, excludedAmbiguous, unmatched: unmatched.length, unmatchedDetail: unmatched, clubMismatches };
    } else {
      report.observer_assessment = { failed: true, error: observerAssessmentResult.reason && observerAssessmentResult.reason.message };
    }

    /* ── KPI tracking (email-exact only) ───────────────────── */
    if (kpiResult.status === "fulfilled") {
      let matched = 0;
      const unmatchedEmails = [];
      kpiResult.value.forEach((row) => {
        const coach = coachByEmail.get(normEmail(row.email));
        if (!coach) { unmatchedEmails.push(row.email); return; }
        coach.evidence_sources.kpi_tracking = row;
        matched++;
      });
      report.kpi_tracking = { loaded: kpiResult.value.length, matched, unmatched: unmatchedEmails.length, unmatchedEmails };
    } else {
      report.kpi_tracking = { failed: true, error: kpiResult.reason && kpiResult.reason.message };
    }

    /* ── Curriculum completion (email primary, name fallback, ─
       ambiguous fallback matches excluded, never merged) ──── */
    if (curriculumResult.status === "fulfilled") {
      let matchedByEmail = 0, matchedByName = 0, excludedAmbiguous = 0;
      const unmatched = [];
      const normalizeFn = window.PRECISION_NORMALIZE_COACH_NAME || ((s) => String(s || "").toLowerCase().trim());
      curriculumResult.value.forEach((row) => {
        let coach = coachByEmail.get(normEmail(row.email));
        if (coach) {
          matchedByEmail++;
        } else {
          const fullName = `${row.first_name || ""} ${row.last_name || ""}`.trim();
          const key = normalizeFn(fullName);
          const candidates = coachesByNormalizedName.get(key) || [];
          if (candidates.length === 1) {
            coach = candidates[0];
            matchedByName++;
          } else if (candidates.length > 1) {
            excludedAmbiguous++;
            console.warn(
              "coach-performance-data.js: ambiguous curriculum name-fallback match excluded (not merged).",
              { employee_id: row.employee_id, email: row.email, name: fullName, candidateCoachIds: candidates.map((c) => c.coach_id) }
            );
            coach = null;
          } else {
            unmatched.push({ employee_id: row.employee_id, email: row.email, name: fullName });
            coach = null;
          }
        }
        if (coach) coach.evidence_sources.curriculum.push(row);
      });
      report.curriculum = { loaded: curriculumResult.value.length, matchedByEmail, matchedByName, excludedAmbiguous, unmatched: unmatched.length, unmatchedDetail: unmatched };
    } else {
      report.curriculum = { failed: true, error: curriculumResult.reason && curriculumResult.reason.message };
    }

    /* ── Lead totals (club-level only, strict raw-ID match) ─── */
    D.clubs.forEach((club) => { club.lead_totals = null; });
    if (leadResult.status === "fulfilled") {
      let matched = 0;
      const unmatchedClubs = [];
      leadResult.value.forEach((row) => {
        const club = D.clubs.find((c) => String(c.club_number) === String(row.club_number));
        if (!club) { unmatchedClubs.push({ club: row.club, club_number: row.club_number }); return; }
        club.lead_totals = {
          fitness_specialist_leads: row.fitness_specialist_leads,
          special_event_leads: row.special_event_leads,
          total_leads: row.total_leads,
        };
        matched++;
      });
      report.lead_totals = { loaded: leadResult.value.length, matched, unmatchedClubs };
    } else {
      report.lead_totals = { failed: true, error: leadResult.reason && leadResult.reason.message };
    }

    logEvidenceDataQuality(report);
    return report;
  }

  /* ── Club market (strict raw-ID match against club_map_data.json,
     loaded later in the pipeline by club-map-data.js). Runs
     independently of the coach-evidence joins above so it never
     blocks or is blocked by them; bounded-wait so a missing/renamed
     club-map-data.js can never hang this module indefinitely. ── */
  function waitForClubMapData(timeoutMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      (function check() {
        if (window.CLUB_MAP_DATA && window.CLUB_MAP_DATA.ready) {
          window.CLUB_MAP_DATA.ready.then(() => resolve(window.CLUB_MAP_DATA)).catch(() => resolve(null));
          return;
        }
        if (Date.now() - start > timeoutMs) { resolve(null); return; }
        setTimeout(check, 50);
      })();
    });
  }

  async function attachClubMarkets() {
    const D = window.PRECISION_DATA;
    if (!D || !Array.isArray(D.clubs)) return;
    const cmd = await waitForClubMapData(10000);
    let matched = 0, unassigned = 0;
    D.clubs.forEach((club) => {
      const rec = cmd && cmd.recordsById ? cmd.recordsById[String(club.club_number)] : null;
      if (rec && rec.market) {
        club.market = rec.market;
        matched++;
      } else {
        club.market = "Unassigned";
        unassigned++;
      }
    });
    /* eslint-disable no-console */
    console.groupCollapsed("%cPrecision Coaching — Club Market Assignment (internal diagnostics, not shown in UI)", "font-weight:bold");
    console.log(cmd ? "club_map_data.json available." : "club_map_data.json unavailable within timeout — all clubs marked Unassigned.");
    console.log("Matched:", matched, "| Unassigned:", unassigned);
    console.groupEnd();
    /* eslint-enable no-console */
  }

  window.PRECISION_EVIDENCE_READY = Promise.all([run(), attachClubMarkets()]).then(([report]) => report);
})();
