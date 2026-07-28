/* ═══════════════════════════════════════════════════════════
   PRECISION COACHING — DATA LAYER + BOOTSTRAP
   ---------------------------------------------------------
   Loads the two real source files:
     ./data/pilot_coach_data.json       (performance — source of truth)
     ./data/pilot_coach_directory.json  (roster — org fields only)

   Responsibilities of this file:
     1. Fetch both JSON files asynchronously (cache:"no-store" +
        a Date.now() cache-buster), validate their shape, and fail
        loudly (never fall back to mock data) if either is missing
        or malformed.
     2. Join performance records to directory records on a strictly
        normalized coach name (see normalizeCoachName below) — no
        fuzzy/similarity matching, only exact-key + an explicit
        alias table for confirmed exceptions.
     3. Assemble the final window.PRECISION_DATA model.
     4. ARCHITECTURE NOTE — script load order:
        Every other module in this app (calculations.js, recommendations.js,
        charts.js, components.js, the render-*.js pages, app.js) is a plain
        IIFE that reads `window.PRECISION_DATA` once, at the moment its
        <script> tag executes. That pattern only works if PRECISION_DATA is
        already fully built by the time each of those files loads — which
        is impossible with a synchronous <script> list once loading becomes
        asynchronous (fetch). Rather than rewrite every downstream module to
        lazily re-read window.PRECISION_DATA on every access (higher-risk,
        touches 9 files' internals), this file is the ONLY <script> tag left
        in index.html. Once the fetch + join completes, it injects the rest
        of the pipeline as <script> tags IN ORDER, waiting for each to finish
        loading before injecting the next. Downstream files need no
        structural change to their existing "capture D once" pattern.
        window.PRECISION_DATA_READY is also exposed as a Promise for anyone
        who wants to await readiness instead.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  const PERFORMANCE_URL = "./data/pilot_coach_data.json";
  const DIRECTORY_URL = "./data/pilot_coach_directory.json";

  /* Scripts loaded, in order, only after PRECISION_DATA is ready. */
  const PIPELINE_SCRIPTS = [
    "js/calculations.js",
    "js/recommendations.js",
    "js/charts.js",
    "js/components.js",
    "js/render-overview.js",
    "js/render-growth.js",
    "js/render-behavior.js",
    "js/render-coach.js",
    "js/app.js",
  ];

  /* ── Confirmed name-matching exceptions ─────────────────────
     Keyed and valued by the FULLY NORMALIZED form (see
     normalizeCoachName). Only exact, human-confirmed exceptions
     belong here — never a fuzzy/similarity guess. */
  const ALIAS_MAP = {
    "ryanmartinez01": "ryanmartinez", // directory disambiguation suffix; confirmed same person as performance's "Ryan Martinez"
  };

  /* ── normalizeCoachName ──────────────────────────────────────
     lowercase → trim → strip diacritics → remove apostrophes/
     hyphens/periods → remove whitespace → strip any remaining
     punctuation → apply confirmed alias map. Deterministic,
     no similarity/fuzzy logic. */
  function normalizeCoachName(rawName) {
    if (rawName === null || rawName === undefined) return "";
    let n = String(rawName);
    n = n.normalize("NFKD").replace(/[̀-ͯ]/g, ""); // strip diacritics
    n = n.toLowerCase().trim();
    n = n.replace(/['‘’\-.]/g, "");                // apostrophes, hyphens, periods
    n = n.replace(/\s+/g, "");                                // spaces
    n = n.replace(/[^a-z0-9]/g, "");                           // any remaining punctuation
    return ALIAS_MAP[n] || n;
  }

  /* ── Fetch + validate ────────────────────────────────────────
     Accepts a plain JSON array, or a small set of common wrapper
     shapes ({ data: [...] }, { records: [...] }, etc.) — but never
     invents data. Throws with a message naming the exact file on
     any failure so the error UI can say precisely what broke. */
  function coerceArray(json, label) {
    if (Array.isArray(json)) return json;
    if (json && typeof json === "object") {
      for (const key of ["data", "records", "rows", "coaches", "results"]) {
        if (Array.isArray(json[key])) return json[key];
      }
    }
    throw new Error(`${label} did not contain a JSON array (or a recognized wrapper).`);
  }

  /* Deployment hosts like GitHub Pages are case-sensitive and have no
     local filesystem to fall back on — a wrong path or a casing mismatch
     between the reference and the physical file/folder name is the most
     likely real-world failure here, so every fetch failure spells that
     out explicitly rather than just reporting the raw HTTP status. */
  const DEPLOY_HINT = "Verify that the file exists at this exact path and that its capitalization matches the physical file/folder name — hosting environments such as GitHub Pages are case-sensitive.";

  async function fetchJson(url, label) {
    const bustedUrl = `${url}?v=${Date.now()}`;
    let res;
    try {
      res = await fetch(bustedUrl, { cache: "no-store" });
    } catch (err) {
      throw new Error(`Network error loading ${label} (${url}): ${err.message}. ${DEPLOY_HINT}`);
    }
    if (!res.ok) {
      throw new Error(`${label} (${url}) returned HTTP ${res.status} ${res.statusText}. ${DEPLOY_HINT}`);
    }
    let json;
    try {
      json = await res.json();
    } catch (err) {
      throw new Error(`${label} (${url}) is not valid JSON: ${err.message}`);
    }
    return coerceArray(json, label);
  }

  /* ── Loading / error UI ──────────────────────────────────────
     Plain textContent only — no HTML injection for anything
     derived from a caught error message. */
  function showLoading() {
    const el = document.getElementById("app-loading");
    if (el) el.classList.remove("hidden");
  }
  function hideLoading() {
    const el = document.getElementById("app-loading");
    if (el) el.classList.add("hidden");
  }
  function showError(title, detail) {
    hideLoading();
    const el = document.getElementById("app-error");
    if (!el) return;
    el.classList.remove("hidden");
    const titleEl = el.querySelector(".app-error-title");
    const detailEl = el.querySelector(".app-error-detail");
    if (titleEl) titleEl.textContent = title;
    if (detailEl) detailEl.textContent = detail;
  }

  /* ── Sequential script injection ────────────────────────────── */
  function loadScriptsSequentially(paths, onDone, onError) {
    let i = 0;
    function next() {
      if (i >= paths.length) { onDone(); return; }
      const src = paths[i++];
      const s = document.createElement("script");
      s.src = src;
      s.onload = next;
      s.onerror = () => onError(new Error(`Failed to load ${src}`));
      document.body.appendChild(s);
    }
    next();
  }

  /* ── Duplicate-safe grouping ─────────────────────────────────
     Groups performance records by normalized name. The source has
     no reporting-period/date field distinguishing repeat rows for
     the same coach, so if duplicates ever appear there is no way
     to tell which is "latest" — they are never summed. The first
     occurrence is retained for scoring and every duplicate is
     logged to dataQuality for manual review. */
  function groupPerformanceByNormalizedName(records) {
    const byName = new Map();
    const duplicates = [];
    records.forEach((r) => {
      const key = normalizeCoachName(r.preferred_name);
      if (byName.has(key)) {
        duplicates.push({ normalized_name: key, preferred_name: r.preferred_name });
      } else {
        byName.set(key, r);
      }
    });
    return { byName, duplicates };
  }

  function buildDirectoryIndex(records) {
    const byName = new Map();
    const duplicates = [];
    records.forEach((r) => {
      const key = normalizeCoachName(r.coach_name);
      if (byName.has(key)) {
        duplicates.push({ normalized_name: key, coach_name: r.coach_name });
      } else {
        byName.set(key, r);
      }
    });
    return { byName, duplicates };
  }

  /* ── Build the unified coach model ──────────────────────────── */
  function buildModel(performanceRecords, directoryRecords) {
    const perfIndex = groupPerformanceByNormalizedName(performanceRecords);
    const dirIndex = buildDirectoryIndex(directoryRecords);

    const coaches = [];
    const aliasMatches = [];
    let matchedCount = 0, needsDataCount = 0, noKpiDataCount = 0;

    // Performance-side records: become "matched" or "needs_data".
    perfIndex.byName.forEach((perfRecord, normKey) => {
      const dirRecord = dirIndex.byName.get(normKey);
      if (dirRecord) {
        matchedCount++;
        coaches.push({
          coach_id: dirRecord.coach_id,
          source_coach_name: perfRecord.preferred_name,
          display_name: dirRecord.coach_name,
          normalized_name: normKey,
          email: dirRecord.email,
          job_title: dirRecord.job_title,
          club_number: dirRecord.club_number,
          club_name: dirRecord.club_name,
          cohort: dirRecord.cohort,
          roster_status: dirRecord.status,
          directory_hire_date: dirRecord.hire_date !== undefined ? dirRecord.hire_date : null,
          mapping_status: "matched",
          raw_performance: perfRecord,
        });
      } else {
        needsDataCount++;
        coaches.push({
          coach_id: `NEEDS-${normKey}`,
          source_coach_name: perfRecord.preferred_name,
          display_name: `${perfRecord.preferred_name} **`,
          normalized_name: normKey,
          email: null,
          job_title: null,
          club_number: null,
          club_name: "Needs Assignment",
          cohort: null,
          roster_status: null,
          directory_hire_date: null,
          mapping_status: "needs_data",
          raw_performance: perfRecord,
        });
      }
    });

    // Directory-side records with no performance match: "no_kpi_data".
    dirIndex.byName.forEach((dirRecord, normKey) => {
      if (perfIndex.byName.has(normKey)) return; // already matched above
      noKpiDataCount++;
      coaches.push({
        coach_id: dirRecord.coach_id,
        source_coach_name: dirRecord.coach_name,
        display_name: dirRecord.coach_name,
        normalized_name: normKey,
        email: dirRecord.email,
        job_title: dirRecord.job_title,
        club_number: dirRecord.club_number,
        club_name: dirRecord.club_name,
        cohort: dirRecord.cohort,
        roster_status: dirRecord.status,
        directory_hire_date: dirRecord.hire_date !== undefined ? dirRecord.hire_date : null,
        mapping_status: "no_kpi_data",
        raw_performance: null,
      });
    });

    // Detect which performance names were resolved via the alias map
    // (for dataQuality reporting only — matching itself already happened above).
    Object.keys(ALIAS_MAP).forEach((aliasKey) => {
      const canonical = ALIAS_MAP[aliasKey];
      const perfMatch = coaches.find(c => c.normalized_name === canonical && c.raw_performance);
      const dirHit = directoryRecords.find(r => normalizeStripAliasStage(r.coach_name) === aliasKey);
      if (perfMatch && dirHit) {
        aliasMatches.push({ alias: aliasKey, canonical, performance_name: perfMatch.source_coach_name, directory_name: dirHit.coach_name });
      }
    });

    // Clubs — sourced entirely from the directory (never invented for needs_data coaches).
    const clubMap = new Map();
    directoryRecords.forEach((r) => {
      if (!clubMap.has(r.club_number)) {
        clubMap.set(r.club_number, { club_number: r.club_number, club_name: r.club_name, cohort: r.cohort, coach_ids: [] });
      }
    });
    coaches.forEach((c) => {
      if (c.club_number && clubMap.has(c.club_number)) {
        clubMap.get(c.club_number).coach_ids.push(c.coach_id);
      }
    });
    const clubs = Array.from(clubMap.values()).sort((a, b) => a.club_name.localeCompare(b.club_name));

    const unresolvedPerformanceOnly = coaches.filter(c => c.mapping_status === "needs_data").map(c => c.source_coach_name);
    const unresolvedDirectoryOnly = coaches.filter(c => c.mapping_status === "no_kpi_data").map(c => c.source_coach_name);

    const REQUIRED_KPI_FIELDS = [
      "eqfs_completed", "comppt_completed", "active_clients", "conversion_rate",
      "total_sessions", "active_weeks", "avg_weekly_sessions",
      "recurring_clients", "pct_recurring_clients", "ftb_clients", "repurchased_clients", "repurchase_rate",
    ];
    const missingKpiFields = {};
    performanceRecords.forEach((r) => {
      REQUIRED_KPI_FIELDS.forEach((f) => {
        if (r[f] === null || r[f] === undefined) {
          missingKpiFields[f] = (missingKpiFields[f] || 0) + 1;
        }
      });
    });

    const dataQuality = {
      performance_record_count: performanceRecords.length,
      directory_record_count: directoryRecords.length,
      matched_count: matchedCount,
      needs_data_count: needsDataCount,
      no_kpi_data_count: noKpiDataCount,
      duplicate_normalized_names_in_performance: perfIndex.duplicates,
      duplicate_normalized_names_in_directory: dirIndex.duplicates,
      alias_matches: aliasMatches,
      unresolved_names: {
        performance_only: unresolvedPerformanceOnly,
        directory_only: unresolvedDirectoryOnly,
      },
      missing_required_kpi_fields: missingKpiFields,
      // scoring_coverage_distribution is appended later by calculations.js,
      // once scores exist to distribute.
    };

    return {
      meta: {
        source: "pilot_coach_data.json",
        directory_source: "pilot_coach_directory.json",
        loaded_at: new Date().toISOString(),
        as_of_date: null, // not present anywhere in either source file — honestly unavailable, never invented
        performance_record_count: performanceRecords.length,
        directory_record_count: directoryRecords.length,
        matched_count: matchedCount,
        needs_data_count: needsDataCount,
        no_kpi_data_count: noKpiDataCount,
      },
      clubs,
      coaches,
      performanceRecords,
      mappingSummary: {
        matched_count: matchedCount,
        needs_data_count: needsDataCount,
        no_kpi_data_count: noKpiDataCount,
        total_unified_coaches: coaches.length,
      },
      scoringConfig: {}, // populated by calculations.js
      dataQuality,
    };
  }

  // Small helper duplicated intentionally to detect alias hits without
  // re-running the confirmed-alias substitution (so we can tell *which*
  // raw names actually triggered the alias, for the dataQuality report).
  function normalizeStripAliasStage(rawName) {
    if (rawName === null || rawName === undefined) return "";
    let n = String(rawName);
    n = n.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    n = n.toLowerCase().trim();
    n = n.replace(/['‘’\-.]/g, "");
    n = n.replace(/\s+/g, "");
    n = n.replace(/[^a-z0-9]/g, "");
    return n;
  }

  function logDataQualityReport(dq) {
    /* eslint-disable no-console */
    console.groupCollapsed("%cPrecision Coaching — Data Quality Report", "font-weight:bold");
    console.log("Performance records:", dq.performance_record_count);
    console.log("Directory records:", dq.directory_record_count);
    console.log("Matched:", dq.matched_count, "| Needs data:", dq.needs_data_count, "| No KPI data:", dq.no_kpi_data_count);
    console.log("Duplicate normalized names (performance):", dq.duplicate_normalized_names_in_performance);
    console.log("Duplicate normalized names (directory):", dq.duplicate_normalized_names_in_directory);
    console.log("Alias matches applied:", dq.alias_matches);
    console.log("Unresolved — performance-only (needs_data):", dq.unresolved_names.performance_only);
    console.log("Unresolved — directory-only (no_kpi_data):", dq.unresolved_names.directory_only);
    console.log("Missing required KPI fields (count of nulls by field):", dq.missing_required_kpi_fields);
    console.groupEnd();
    /* eslint-enable no-console */
  }

  /* ── Boot sequence ───────────────────────────────────────────── */
  let resolveReady, rejectReady;
  window.PRECISION_DATA_READY = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  window.PRECISION_NORMALIZE_COACH_NAME = normalizeCoachName;
  window.PRECISION_HIDE_LOADING = hideLoading;

  async function boot() {
    showLoading();
    let performanceRecords, directoryRecords;
    try {
      [performanceRecords, directoryRecords] = await Promise.all([
        fetchJson(PERFORMANCE_URL, "pilot_coach_data.json"),
        fetchJson(DIRECTORY_URL, "pilot_coach_directory.json"),
      ]);
    } catch (err) {
      showError("Unable to load Precision Coaching data", err.message);
      rejectReady(err);
      return;
    }

    let model;
    try {
      model = buildModel(performanceRecords, directoryRecords);
    } catch (err) {
      showError("Unable to process Precision Coaching data", err.message);
      rejectReady(err);
      return;
    }

    window.PRECISION_DATA = model;
    logDataQualityReport(model.dataQuality);
    resolveReady();
    // NOTE: the loading overlay stays visible through script injection and
    // initial render — app.js calls window.PRECISION_HIDE_LOADING() itself
    // once every page has actually rendered, so there is no flash of blank
    // content between "data ready" and "first paint".

    loadScriptsSequentially(
      PIPELINE_SCRIPTS,
      () => { /* app.js runs its own init() synchronously once loaded */ },
      (err) => { showError("Unable to start the dashboard", err.message); }
    );
  }

  boot();
})();
