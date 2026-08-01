/* ═══════════════════════════════════════════════════════════
   CLUB MAP DATA — loader/normalizer/validator for
   data/club_map_data.json, the authoritative Club Portfolio
   data source (Active_PT → CLUB_HEADCOUNT_SUMMARY →
   CLUB_MAP_EXPORT → this file → window.CLUB_MAP_DATA).
   ---------------------------------------------------------
   Single fetch, on script load. Normalizes every record into a
   camelCase runtime shape (raw source record kept at `.raw` for
   inspection/popup use — nothing here renames or mutates the
   source JSON fields themselves). Computes visibility, totals,
   region/market groupings, and a validation-issue log (log only —
   never silently corrected).

   POWER AUTOMATE ENDPOINT — Strategy C (approved): the JSON is
   authoritative for every field it carries. The existing Power
   Automate feed (js/portfolio-config.js DATA_URL) is retained ONLY
   as a temporary, best-effort source for hub-specific metadata the
   JSON does not yet contain (is_hub / hub_club) — see enrichWithHubData()
   below. It can never overwrite a JSON-controlled field, and its
   failure never blocks the portfolio from loading: `ready` resolves
   the moment the JSON itself is parsed and normalized; `hubReady`
   resolves separately (always, even on failure) once the enrichment
   attempt finishes.

   Exposed as window.CLUB_MAP_DATA:
     rawRecords        — every normalized record, including hidden/invalid
     visibleRecords     — dashboardIncluded===true && mapStage!=='Hidden'
     liveRecords         — visibleRecords where mapStage==='Live'
     previewRecords       — visibleRecords where mapStage==='Preview'
     recordsById         — { clubId: record }
     recordsByName       — { normalizedName: record } (display + source names)
     regions             — visible records grouped by raw `region`
     markets              — visible records grouped by raw `market`
     totals               — runtime counts (see computeTotals())
     validationIssues     — array of { type, clubId, message }
     loadedAt              — Date.now() of successful JSON load
     loadStatus            — 'loading' | 'ok' | 'error'
     ready                 — Promise, resolves once JSON is loaded+normalized
     hubReady              — Promise, resolves once hub enrichment settles (always)
     onUpdate(cb)           — cb() called after hub enrichment merges in
   ═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  const JSON_URL = "data/club_map_data.json";

  const VALID_CLUB_TYPES = ["Pilot Club", "Hub Club", "Standard Club"];
  const VALID_MAP_STAGES = ["Live", "Preview", "Hidden"];
  const VALID_LOCATION_STATUSES = ["Active", "Pre-Sale", "Closed"];

  let _resolveReady, _resolveHubReady;
  const readyPromise = new Promise((resolve) => { _resolveReady = resolve; });
  const hubReadyPromise = new Promise((resolve) => { _resolveHubReady = resolve; });
  const _updateListeners = [];

  function num(v) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  }
  function str(v) {
    return (v === null || v === undefined) ? "" : String(v).trim();
  }
  function normalizeKey(name) {
    return str(name).toLowerCase();
  }

  // ── NORMALIZE ONE RAW RECORD ────────────────────────────────
  function normalizeRecord(raw) {
    const lat = typeof raw.latitude === "number" ? raw.latitude : parseFloat(raw.latitude);
    const lng = typeof raw.longitude === "number" ? raw.longitude : parseFloat(raw.longitude);
    const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    const coachCount = num(raw.coach_count);
    const coachPlusCount = num(raw.coach_plus_count);
    const coachXCount = num(raw.coach_x_count);
    const advantageCoachCount = num(raw.advantage_coach_count);
    const totalCoachCount = num(raw.total_coach_count);
    const ptmCount = num(raw.ptm_count);
    const aptmCount = num(raw.aptm_count);
    const totalManagementCount = num(raw.total_management_count);
    const eftiEducatorCount = num(raw.efti_educator_count);

    const clubType = str(raw.club_type);
    const mapStage = str(raw.map_stage);
    const dashboardIncluded = raw.dashboard_included === true;
    const locationStatus = str(raw.location_status);

    return {
      clubId: str(raw.club_id),
      sourceClubName: str(raw.source_club_name),
      displayClubName: str(raw.display_club_name),
      streetAddress: str(raw.street_address),
      city: str(raw.city),
      state: str(raw.state),
      zip: str(raw.zip),
      latitude: lat,
      longitude: lng,
      hasValidCoords,
      region: str(raw.region),
      market: str(raw.market),
      country: str(raw.country),
      locationStatus,
      isActiveLocation: locationStatus !== "Closed",
      dashboardIncluded,
      clubType,
      mapStage,
      isPilotClub: clubType === "Pilot Club",
      // isHub: authoritative from club_type when the pipeline provides it
      // (no "Hub Club" values exist in the JSON as of this integration —
      // confirmed in the pre-implementation checkpoint — so this is
      // forward-compatible, not currently load-bearing). Until then, only
      // the best-effort Power Automate enrichment below (Strategy C) can
      // additionally set this true; enrichment only ever OR-merges, never
      // clears a JSON-driven true.
      isHub: clubType === "Hub Club",
      isPreview: dashboardIncluded && mapStage === "Preview",
      coachCount,
      coachPlusCount,
      coachXCount,
      advantageCoachCount,
      totalCoachCount,
      eftiEducatorCount,
      eftiEducatorNames: str(raw.efti_educator_names),
      eftiEducatorEmails: str(raw.efti_educator_emails),
      totalPtHeadcount: num(raw.total_pt_headcount),
      ptmCount,
      ptmNames: str(raw.ptm_names),
      ptmEmails: str(raw.ptm_emails),
      aptmCount,
      aptmNames: str(raw.aptm_names),
      aptmEmails: str(raw.aptm_emails),
      totalManagementCount,
      validationStatus: str(raw.validation_status),
      sourceMatchStatus: str(raw.source_match_status),
      coordinateSource: str(raw.coordinate_source),
      lastUpdated: str(raw.last_updated),
      headcountMatchMethod: str(raw.headcount_match_method),
      raw,
    };
  }

  // ── VALIDATION (log only — never corrects a record) ─────────
  function validate(records) {
    const issues = [];
    const idSeen = {}, nameSeen = {};

    records.forEach((r) => {
      const ref = r.clubId || r.displayClubName || "(no id/name)";

      if (!r.clubId) issues.push({ type: "missing_club_id", clubId: ref, message: `Record "${r.displayClubName}" has no club_id.` });
      if (!r.displayClubName) issues.push({ type: "missing_display_name", clubId: ref, message: `Record ${ref} has no display_club_name.` });

      if (r.clubId) {
        idSeen[r.clubId] = (idSeen[r.clubId] || 0) + 1;
      }
      const nameKey = normalizeKey(r.displayClubName);
      if (nameKey) {
        nameSeen[nameKey] = (nameSeen[nameKey] || 0) + 1;
      }

      if (!r.hasValidCoords) issues.push({ type: "invalid_coordinates", clubId: ref, message: `${r.displayClubName || ref}: latitude=${r.raw.latitude}, longitude=${r.raw.longitude} out of range or non-numeric.` });
      if (!r.region) issues.push({ type: "missing_region", clubId: ref, message: `${r.displayClubName || ref}: region is blank.` });
      if (!r.market) issues.push({ type: "missing_market", clubId: ref, message: `${r.displayClubName || ref}: market is blank.` });
      if (r.raw.dashboard_included !== true && r.raw.dashboard_included !== false) issues.push({ type: "invalid_dashboard_included", clubId: ref, message: `${r.displayClubName || ref}: dashboard_included=${JSON.stringify(r.raw.dashboard_included)} is not a boolean.` });
      if (r.clubType && VALID_CLUB_TYPES.indexOf(r.clubType) === -1) issues.push({ type: "invalid_club_type", clubId: ref, message: `${r.displayClubName || ref}: unrecognized club_type "${r.clubType}".` });
      if (r.mapStage && VALID_MAP_STAGES.indexOf(r.mapStage) === -1) issues.push({ type: "invalid_map_stage", clubId: ref, message: `${r.displayClubName || ref}: unrecognized map_stage "${r.mapStage}".` });
      if (r.locationStatus && VALID_LOCATION_STATUSES.indexOf(r.locationStatus) === -1) issues.push({ type: "invalid_location_status", clubId: ref, message: `${r.displayClubName || ref}: unrecognized location_status "${r.locationStatus}".` });

      ["coachCount", "coachPlusCount", "coachXCount", "advantageCoachCount", "totalCoachCount", "ptmCount", "aptmCount", "totalManagementCount", "eftiEducatorCount"].forEach((field) => {
        if (r[field] < 0) issues.push({ type: "negative_headcount", clubId: ref, message: `${r.displayClubName || ref}: ${field}=${r[field]} is negative.` });
      });

      const expectedTotalCoach = r.coachCount + r.coachPlusCount + r.coachXCount + r.advantageCoachCount;
      if (expectedTotalCoach !== r.totalCoachCount) {
        issues.push({ type: "total_coach_count_mismatch", clubId: ref, message: `${r.displayClubName || ref}: coach+coach_plus+coach_x+advantage=${expectedTotalCoach} but total_coach_count=${r.totalCoachCount}.` });
      }
      const expectedTotalMgmt = r.ptmCount + r.aptmCount;
      if (expectedTotalMgmt !== r.totalManagementCount) {
        issues.push({ type: "total_management_count_mismatch", clubId: ref, message: `${r.displayClubName || ref}: ptm+aptm=${expectedTotalMgmt} but total_management_count=${r.totalManagementCount}.` });
      }

      if (r.validationStatus && r.validationStatus !== "Valid") {
        issues.push({ type: "validation_status_not_valid", clubId: ref, message: `${r.displayClubName || ref}: validation_status="${r.validationStatus}".` });
      }
      if (r.headcountMatchMethod === "Unmatched") {
        issues.push({ type: "no_headcount_match", clubId: ref, message: `${r.displayClubName || ref}: headcount_match_method="Unmatched" (no frontend-invented match applied).` });
      }
    });

    Object.keys(idSeen).forEach((id) => {
      if (idSeen[id] > 1) issues.push({ type: "duplicate_club_id", clubId: id, message: `club_id "${id}" appears ${idSeen[id]} times.` });
    });
    Object.keys(nameSeen).forEach((name) => {
      if (nameSeen[name] > 1) issues.push({ type: "duplicate_display_name", clubId: name, message: `Normalized display name "${name}" appears ${nameSeen[name]} times.` });
    });

    return issues;
  }

  // ── GROUPING / TOTALS ────────────────────────────────────────
  function groupBy(records, field) {
    const map = {};
    records.forEach((r) => {
      const key = r[field] || "";
      if (!map[key]) map[key] = { name: key, records: [] };
      map[key].records.push(r);
    });
    return map;
  }

  function computeTotals(visibleRecords) {
    const sum = (field) => visibleRecords.reduce((s, r) => s + (r[field] || 0), 0);
    const count = (pred) => visibleRecords.filter(pred).length;
    return {
      visibleClubs: visibleRecords.length,
      liveClubs: count((r) => r.mapStage === "Live"),
      previewClubs: count((r) => r.mapStage === "Preview"),
      pilotClubs: count((r) => r.clubType === "Pilot Club"),
      hubClubs: count((r) => r.isHub),
      standardClubs: count((r) => r.clubType === "Standard Club"),
      regions: Object.keys(groupBy(visibleRecords, "region")).filter(Boolean).length,
      markets: Object.keys(groupBy(visibleRecords, "market")).filter(Boolean).length,
      coachCount: sum("coachCount"),
      coachPlusCount: sum("coachPlusCount"),
      coachXCount: sum("coachXCount"),
      advantageCoachCount: sum("advantageCoachCount"),
      totalCoachCount: sum("totalCoachCount"),
      eftiEducatorCount: sum("eftiEducatorCount"),
      ptmCount: sum("ptmCount"),
      aptmCount: sum("aptmCount"),
      totalManagementCount: sum("totalManagementCount"),
    };
  }

  function rebuildDerived(model) {
    model.visibleRecords = model.rawRecords.filter((r) => r.dashboardIncluded && r.mapStage !== "Hidden");
    model.liveRecords = model.visibleRecords.filter((r) => r.mapStage === "Live");
    model.previewRecords = model.visibleRecords.filter((r) => r.mapStage === "Preview");
    model.recordsById = {};
    model.recordsByName = {};
    model.rawRecords.forEach((r) => {
      if (r.clubId) model.recordsById[r.clubId] = r;
      if (r.displayClubName) model.recordsByName[normalizeKey(r.displayClubName)] = r;
      if (r.sourceClubName) model.recordsByName[normalizeKey(r.sourceClubName)] = model.recordsByName[normalizeKey(r.sourceClubName)] || r;
    });
    model.regions = groupBy(model.visibleRecords, "region");
    model.markets = groupBy(model.visibleRecords, "market");
    model.totals = computeTotals(model.visibleRecords);
    model.validationIssues = validate(model.rawRecords);
  }

  // ── HUB ENRICHMENT (Strategy C — best-effort, never blocks, never
  //    overwrites a JSON-controlled field) ─────────────────────
  function fetchLegacyFeed() {
    const DATA_URL = root.PORTFOLIO_CONFIG && root.PORTFOLIO_CONFIG.DATA_URL;
    if (!DATA_URL) return Promise.reject(new Error("PORTFOLIO_CONFIG.DATA_URL not available"));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    return fetch(DATA_URL, { method: "POST", signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .finally(() => clearTimeout(timeoutId));
  }

  function enrichWithHubData(model) {
    return fetchLegacyFeed()
      .then((rows) => {
        if (!Array.isArray(rows)) throw new Error("Legacy feed did not return an array");
        let matchedByCid = 0, matchedByName = 0;
        rows.forEach((row) => {
          const isHub = ["yes", "true", "1", "x"].indexOf(str(row.is_hub).toLowerCase()) !== -1;
          const hubClub = str(row.hub_club);
          if (!isHub && !hubClub) return;

          // Prefer club_id if the feed ever carries one; today's feed does
          // not (confirmed in the pre-implementation checkpoint audit), so
          // in practice every match currently falls through to the
          // documented normalized-name fallback below.
          let record = null;
          const rowClubId = str(row.club_id);
          if (rowClubId && model.recordsById[rowClubId]) {
            record = model.recordsById[rowClubId];
            matchedByCid++;
          } else {
            const key = normalizeKey(row.club_name);
            record = key ? model.recordsByName[key] : null;
            if (record) matchedByName++;
          }
          if (!record) return;

          // Only hub-specific fields — never touches any JSON-sourced field.
          record.isHub = record.isHub || isHub;
          record.legacyHubClub = hubClub || record.legacyHubClub || "";
        });
        rebuildDerived(model);
        model.loadStatus = model.loadStatus === "error" ? "error" : "ok";
        model._hubEnrichment = { status: "ok", matchedByCid, matchedByName, at: Date.now() };
      })
      .catch((err) => {
        model._hubEnrichment = { status: "unavailable", error: String(err && err.message || err), at: Date.now() };
        console.warn("[club-map-data] Hub enrichment (legacy Power Automate feed) unavailable — portfolio continues on JSON data only:", err);
      })
      .finally(() => {
        _resolveHubReady();
        _updateListeners.forEach((cb) => {
          try { cb(model); } catch (e) { console.error("[club-map-data] onUpdate listener failed:", e); }
        });
      });
  }

  // ── LOAD ──────────────────────────────────────────────────────
  const model = {
    rawRecords: [],
    visibleRecords: [],
    liveRecords: [],
    previewRecords: [],
    recordsById: {},
    recordsByName: {},
    regions: {},
    markets: {},
    totals: computeTotals([]),
    validationIssues: [],
    loadedAt: null,
    loadStatus: "loading",
    _hubEnrichment: { status: "pending" },
    ready: readyPromise,
    hubReady: hubReadyPromise,
    onUpdate(cb) { if (typeof cb === "function") _updateListeners.push(cb); },
    // Re-runs the best-effort hub-metadata enrichment only (Strategy C) —
    // used by render-portfolio.js's periodic tick in place of the old
    // full live-feed re-poll, since the JSON itself is fetched once, not
    // polled. Never touches a JSON-controlled field.
    refreshHubEnrichment() { return enrichWithHubData(model); },
  };

  fetch(JSON_URL, { cache: "no-store" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${JSON_URL}`);
      return res.json();
    })
    .then((rawList) => {
      if (!Array.isArray(rawList)) throw new Error(`${JSON_URL} did not parse to an array`);
      model.rawRecords = rawList.map(normalizeRecord);
      rebuildDerived(model);
      model.loadedAt = Date.now();
      model.loadStatus = "ok";
      if (model.validationIssues.length) {
        console.warn(`[club-map-data] ${model.validationIssues.length} validation issue(s) — see window.CLUB_MAP_DATA.validationIssues`, model.validationIssues);
      }
      _resolveReady(model);
      // Hub enrichment is best-effort and must never delay first paint —
      // kicked off only after the JSON itself is ready, never awaited by it.
      enrichWithHubData(model);
    })
    .catch((err) => {
      model.loadStatus = "error";
      model._loadError = String(err && err.message || err);
      console.error("[club-map-data] Failed to load", JSON_URL, "— Club Portfolio cannot render club data:", err);
      _resolveReady(model); // resolves even on failure so consumers can show an explicit unavailable state
      _resolveHubReady();
    });

  root.CLUB_MAP_DATA = model;
})(window);
