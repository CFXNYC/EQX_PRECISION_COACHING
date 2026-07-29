/* ═══════════════════════════════════════════════════════════
   PRECISION COACHING — DATA LAYER + BOOTSTRAP
   ---------------------------------------------------------
   Loads the two backing records for the pilot:
     ./data/pilot_coach_data.json       (performance — enrichment only)
     ./data/pilot_coach_directory.json  (approved pilot roster)

   Responsibilities of this file:
     1. Fetch both files asynchronously (cache:"no-store" +
        a Date.now() cache-buster), validate their shape, and fail
        loudly (never fall back to mock data) if either is missing
        or malformed.
     2. THE APPROVED ROSTER CONTROLS ELIGIBILITY. Every record in
        the directory is an approved pilot coach — full stop. The
        dashboard population is built by starting from that roster
        and enriching each entry with a matching performance record
        when one exists (see normalizeCoachName below for the join
        key — no fuzzy/similarity matching, only exact-key + an
        explicit alias table for confirmed exceptions). Performance
        records that don't match any approved roster entry are never
        added to the dashboard — they're set aside in an internal
        diagnostic collection (unmatchedPerformanceRecords) for
        follow-up, never surfaced in the UI.
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

  /* Scripts loaded, in order, only after PRECISION_DATA is ready.
     Leaflet + its marker-cluster plugin, and the Club Portfolio's own
     config/state/normalization modules, are loaded ahead of
     render-portfolio.js so `L`, `window.PORTFOLIO_CONFIG`, `window.STATE`,
     and `window.CLUB_NORM` all exist by the time that module runs (Phase 4).

     High-fidelity globe upgrade (feature/high-fidelity-globe, see
     PRE_GLOBE_PROJECT_CONTEXT.md): Mapbox GL JS + the globe-*.js modules
     load the same way, unconditionally — loading the library costs
     nothing if it's never used. Leaflet stays loaded too and remains the
     always-on renderer; render-portfolio.js's activateGlobeMode() only
     switches the *visible* map to Mapbox once js/globe-config.js has a
     real ACCESS_TOKEN. Order here doesn't matter for correctness (every
     globe module only reads window.GLOBE_*, CLUB_NORM, or PORTFOLIO_DATA
     lazily, inside function bodies, never at load time) — kept in
     dependency-reading order for humans: config → data adapter →
     renderer → markers → camera → popups. */
  const PIPELINE_SCRIPTS = [
    "js/calculations.js",
    "js/recommendations.js",
    "js/charts.js",
    "js/components.js",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js",
    "https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js",
    "js/portfolio-config.js",
    "js/state.js",
    "js/club-normalization.js",
    "js/globe-config.js",
    "js/globe-data-adapter.js",
    "js/globe-renderer.js",
    "js/globe-markers.js",
    "js/globe-camera.js",
    "js/globe-popups.js",
    "js/render-portfolio.js",
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
    "cesarsanchez01": "cesarsanchez", // directory disambiguation suffix; confirmed same person as performance's "Cesar Sanchez"
  };

  /* ── Display-name corrections ─────────────────────────────────
     The directory is the display-name authority, but two confirmed
     records carry a data-entry artifact in the coach_name field
     itself (a disambiguation suffix left over from onboarding, with
     no second same-named coach to disambiguate from). Keyed by
     coach_id so the correction is scoped to exactly the confirmed
     record — never a blanket suffix-stripping rule. Matching still
     runs on the raw name (via ALIAS_MAP above); this only affects
     what is displayed. */
  const DISPLAY_NAME_OVERRIDES = {
    "PC-090": "Cesar Sanchez",  // directory had "Cesar Sanchez01"; performance + audit confirm "Cesar Sanchez"
    "PC-024": "Ryan Martinez",  // directory had "Ryan Martinez01"; same artifact, same pattern as PC-090 (see ALIAS_MAP note above)
  };

  /* ── Approved pilot population ─────────────────────────────────
     Every row in pilot_coach_directory.json is an approved pilot
     coach. That file is the eligibility gate for the entire
     dashboard — no tier/job-title filtering is applied to it, and
     performance records are matched against it by name only,
     regardless of the performance record's own job_desc label
     (a coach's tier label can differ slightly between systems;
     what matters for enrichment is that the two records are the
     same confirmed person). */

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
  const BOOT_VERSION = Date.now(); // same cache-busting approach as the JSON fetches above
  function loadScriptsSequentially(paths, onDone, onError) {
    let i = 0;
    function next() {
      if (i >= paths.length) { onDone(); return; }
      const src = paths[i++];
      const s = document.createElement("script");
      // Cache-bust our own files only — an external CDN URL (Leaflet, etc.)
      // already has its own versioned path and shouldn't have a foreign
      // query string appended.
      s.src = /^https?:\/\//.test(src) ? src : `${src}?v=${BOOT_VERSION}`;
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

  /* ── Build the canonical coach model ────────────────────────────
     Sequence (see file header): the approved directory is the
     eligibility gate. Every directory row becomes exactly one
     dashboard coach record, enriched with a matching performance
     record when one exists. Performance records with no match are
     NEVER added as dashboard coaches — they go to an internal
     diagnostic collection only. */
  function buildModel(performanceRecordsRaw, directoryRecordsRaw) {
    const directoryRecords = directoryRecordsRaw; // every row is an approved pilot coach
    const performanceRecords = performanceRecordsRaw; // matched by name regardless of tier label

    const perfIndex = groupPerformanceByNormalizedName(performanceRecords);
    const dirIndex = buildDirectoryIndex(directoryRecords);

    const coaches = [];
    const aliasMatches = [];
    let matchedCount = 0, noKpiDataCount = 0;

    // One record per approved directory coach — never more, never fewer.
    dirIndex.byName.forEach((dirRecord, normKey) => {
      const perfRecord = perfIndex.byName.get(normKey) || null;
      if (perfRecord) matchedCount++; else noKpiDataCount++;
      coaches.push({
        coach_id: dirRecord.coach_id,
        source_coach_name: dirRecord.coach_name,
        display_name: DISPLAY_NAME_OVERRIDES[dirRecord.coach_id] || dirRecord.coach_name,
        normalized_name: normKey,
        email: dirRecord.email,
        job_title: dirRecord.job_title,
        club_number: dirRecord.club_number,
        club_name: dirRecord.club_name,
        cohort: dirRecord.cohort,
        roster_status: dirRecord.status,
        directory_hire_date: dirRecord.hire_date !== undefined ? dirRecord.hire_date : null,
        mapping_status: perfRecord ? "matched" : "no_kpi_data",
        raw_performance: perfRecord,
      });
    });

    // Detect which directory names were resolved via the alias map
    // (for dataQuality reporting only — matching itself already happened above).
    Object.keys(ALIAS_MAP).forEach((aliasKey) => {
      const canonical = ALIAS_MAP[aliasKey];
      const dirHit = directoryRecords.find(r => normalizeStripAliasStage(r.coach_name) === aliasKey);
      const coachMatch = coaches.find(c => c.normalized_name === canonical && c.raw_performance);
      if (dirHit && coachMatch) {
        aliasMatches.push({ alias: aliasKey, canonical, directory_name: dirHit.coach_name, performance_name: coachMatch.raw_performance.preferred_name });
      }
    });

    // Clubs — sourced entirely from the approved directory.
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

    // Performance records that matched no approved directory coach — retained
    // here ONLY for internal diagnostics (console / dataQuality object).
    // Never appended to `coaches`, never rendered in the UI.
    const unmatchedPerformanceRecords = [];
    perfIndex.byName.forEach((perfRecord, normKey) => {
      if (dirIndex.byName.has(normKey)) return; // matched above
      unmatchedPerformanceRecords.push({
        name: perfRecord.preferred_name,
        email: null, // not present in pilot_coach_data.json
        source_club: null, // not present in pilot_coach_data.json
        reporting_period: null, // source has no dated/period field
        attempted_matching_key: normKey,
        exclusion_reason: "No matching approved directory record",
      });
    });

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
      approved_coach_count: coaches.length,
      directory_record_count: directoryRecords.length,
      performance_record_count: performanceRecords.length,
      matched_count: matchedCount,
      no_kpi_data_count: noKpiDataCount,
      duplicate_normalized_names_in_performance: perfIndex.duplicates,
      duplicate_normalized_names_in_directory: dirIndex.duplicates,
      alias_matches: aliasMatches,
      display_name_overrides: DISPLAY_NAME_OVERRIDES,
      missing_required_kpi_fields: missingKpiFields,
      unmatchedPerformanceRecords, // internal diagnostic only — never rendered
      // scoring_coverage_distribution is appended later by calculations.js,
      // once scores exist to distribute.
    };

    return {
      meta: {
        loaded_at: new Date().toISOString(),
        as_of_date: null, // not present anywhere in either backing record — honestly unavailable, never invented
        approved_coach_count: coaches.length,
        directory_record_count: directoryRecords.length,
        performance_record_count: performanceRecords.length,
        matched_count: matchedCount,
        no_kpi_data_count: noKpiDataCount,
      },
      clubs,
      coaches,
      performanceRecords,
      unmatchedPerformanceRecords, // internal diagnostic only — never rendered
      mappingSummary: {
        matched_count: matchedCount,
        no_kpi_data_count: noKpiDataCount,
        total_approved_coaches: coaches.length,
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
    console.groupCollapsed("%cPrecision Coaching — Data Quality Report (internal diagnostics, not shown in UI)", "font-weight:bold");
    console.log("Approved pilot coaches:", dq.approved_coach_count, "(directory records:", dq.directory_record_count + ")");
    console.log("With performance data:", dq.matched_count, "| Without performance data:", dq.no_kpi_data_count);
    console.log("Performance records loaded:", dq.performance_record_count);
    console.log("Duplicate normalized names (performance):", dq.duplicate_normalized_names_in_performance);
    console.log("Duplicate normalized names (directory):", dq.duplicate_normalized_names_in_directory);
    console.log("Alias matches applied:", dq.alias_matches);
    console.log("Display-name overrides applied:", dq.display_name_overrides);
    console.log("Excluded performance-only records (no approved match):", dq.unmatchedPerformanceRecords.length, dq.unmatchedPerformanceRecords);
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
