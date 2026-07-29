/* ═══════════════════════════════════════════════════════════
   CLUB NORMALIZATION — one club lookup source
   ---------------------------------------------------------
   Resolves any known display-name variant of a club to one
   canonical club ID + canonical name. club_id (the pilot
   directory's club_number, e.g. "112") is the primary join key,
   per the approved integration decisions — canonical name defaults
   to the pilot directory's club_name (the roster of truth), with
   the Club Portfolio map's own display name captured as an alias.

   SCOPE NOTE: this table covers the 10 pilot clubs in full, plus
   the specific non-pilot aliases named in the Phase 3 instructions
   (Sports Club NY/SCNY, SOHO/SoHo, Dumbo/DUMBO, Sports Club
   Boston/SCBO, Sports Club DC/SCDC — Brookfield and Sports Club LA
   were also named but are already pilot clubs, so they're covered
   under PILOT_CLUBS instead of duplicated here). It does NOT copy
   the Club Portfolio's full ~200-club national CLUB_IDS table —
   that table already exists in EQX CLUB PORTFOLIO/MASTER_MAP_UI.html
   and Phase 4 (portfolio extraction) will reuse it directly rather
   than hosting a second copy here, per the "no duplicate logic"
   rule. Every alias below was verified against that source file
   before being added — see scripts/phase3-validation.js.

   Exposed as window.CLUB_NORM in the browser, module.exports in
   Node (for the Phase 3 validation script).
═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  // id -> { canonicalName, directoryAliases, portfolioAliases }
  // directoryAliases = name(s) as pilot_coach_directory.json spells them.
  // portfolioAliases  = name(s) as MASTER_MAP_UI.html's CLUB_IDS spells them.
  // Kept separate (not just one flat list) so fidelity can be checked against
  // each source independently — see scripts/phase3-validation.js.
  const PILOT_CLUBS = {
    "105": { canonicalName: "East 63rd Street", directoryAliases: ["East 63rd Street"], portfolioAliases: ["East 63rd Street"] },
    "109": { canonicalName: "East 44th Street", directoryAliases: ["East 44th Street"], portfolioAliases: ["East 44th Street"] },
    "112": { canonicalName: "Greenwich Ave NY", directoryAliases: ["Greenwich Ave NY"], portfolioAliases: ["Greenwich Avenue"] },
    "128": { canonicalName: "Brookfield", directoryAliases: ["Brookfield"], portfolioAliases: ["Brookfield", "Brookfield Place"] },
    "203": { canonicalName: "Chestnut Hill", directoryAliases: ["Chestnut Hill"], portfolioAliases: ["Chestnut Hill"] },
    "206": { canonicalName: "Boston Seaport", directoryAliases: ["Boston Seaport"], portfolioAliases: ["Seaport"] },
    "252": { canonicalName: "Bethesda", directoryAliases: ["Bethesda"], portfolioAliases: ["Bethesda"] },
    "254": { canonicalName: "Anthem Row", directoryAliases: ["Anthem Row"], portfolioAliases: ["Anthem Row"] },
    "713": { canonicalName: "Sports Club LA", directoryAliases: ["Sports Club LA"], portfolioAliases: ["Sports Club LA", "SCLA"] },
    "720": { canonicalName: "Pine Street", directoryAliases: ["Pine Street"], portfolioAliases: ["Pine Street"] },
  };

  // Non-pilot clubs explicitly named in the Phase 3 "preserve existing
  // aliases" instruction. No directory entry exists for these (not pilot
  // clubs), so canonical name defaults to the portfolio's own name.
  // NOTE: the instructions also named "SCDC" as an alias for Sports Club DC.
  // Verified against MASTER_MAP_UI.html's CLUB_IDS table — "SCDC" does not
  // appear there (only "Sports Club DC" does). Not fabricated/added; see
  // the Phase 3 report.
  const ADDITIONAL_KNOWN_ALIASES = {
    "131": { canonicalName: "Sports Club NY", directoryAliases: [], portfolioAliases: ["Sports Club NY", "SCNY"] },
    "114": { canonicalName: "SoHo", directoryAliases: [], portfolioAliases: ["SoHo", "SOHO"] },
    "134": { canonicalName: "Dumbo", directoryAliases: [], portfolioAliases: ["Dumbo", "DUMBO"] },
    "204": { canonicalName: "Sports Club Boston", directoryAliases: [], portfolioAliases: ["Sports Club Boston", "SCBO"] },
    "253": { canonicalName: "Sports Club DC", directoryAliases: [], portfolioAliases: ["Sports Club DC"] },
  };

  const ALL_CLUBS = Object.assign({}, PILOT_CLUBS, ADDITIONAL_KNOWN_ALIASES);

  // alias (lowercased, trimmed) -> club id, built once from every known alias
  const ALIAS_TO_ID = {};
  Object.keys(ALL_CLUBS).forEach((id) => {
    const entry = ALL_CLUBS[id];
    const all = entry.directoryAliases.concat(entry.portfolioAliases, [entry.canonicalName]);
    all.forEach((alias) => {
      ALIAS_TO_ID[alias.trim().toLowerCase()] = id;
    });
  });

  const PILOT_CLUB_IDS = Object.keys(PILOT_CLUBS);

  function isPilotClub(clubId) {
    return !!clubId && Object.prototype.hasOwnProperty.call(PILOT_CLUBS, String(clubId));
  }

  function getCanonicalName(clubId) {
    const entry = ALL_CLUBS[String(clubId)];
    return entry ? entry.canonicalName : null;
  }

  /* Resolves a raw display name (or a raw club id) to its canonical
     record. Returns null — never a guess — when nothing matches. */
  function normalize(rawNameOrId) {
    if (rawNameOrId === null || rawNameOrId === undefined) return null;
    const raw = String(rawNameOrId).trim();
    if (!raw) return null;

    // Exact club-id match first (e.g. "112" from a directory club_number field).
    if (Object.prototype.hasOwnProperty.call(ALL_CLUBS, raw)) {
      return {
        clubId: raw,
        canonicalName: ALL_CLUBS[raw].canonicalName,
        matchedByAlias: false,
        isPilotClub: isPilotClub(raw),
      };
    }

    const key = raw.toLowerCase();
    const id = ALIAS_TO_ID[key];
    if (!id) return null;

    const entry = ALL_CLUBS[id];
    const isExactCanonical = entry.canonicalName.trim().toLowerCase() === key;
    return {
      clubId: id,
      canonicalName: entry.canonicalName,
      matchedByAlias: !isExactCanonical,
      isPilotClub: isPilotClub(id),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     VALIDATION UTILITIES
     Every function takes an array of records plus field-name
     accessors and returns findings only — nothing here mutates or
     "fixes" a record. Unmatched records are reported, never
     silently corrected or dropped.
  ═══════════════════════════════════════════════════════════ */

  /* opts: { idField, nameField } — at least one must resolve a record. */
  function validateRecords(records, opts) {
    opts = opts || {};
    const idField = opts.idField;
    const nameField = opts.nameField;
    const label = (r, i) => (r && (r.coach_name || r.preferred_name || r.employee_id)) || `record[${i}]`;

    const unmatched = [];
    const missingClubIds = [];
    const aliasOnlyMatches = [];
    const seenIdToNames = {}; // clubId -> Set of raw names seen resolving to it
    const seenNameToIds = {}; // canonicalName -> Set of clubIds seen resolving to it

    (records || []).forEach((r, i) => {
      const rawId = idField ? r[idField] : undefined;
      const rawName = nameField ? r[nameField] : undefined;

      if ((rawId === undefined || rawId === null || rawId === "") &&
          (rawName === undefined || rawName === null || rawName === "")) {
        missingClubIds.push({ record: label(r, i), reason: "no club id or club name field present" });
        return;
      }

      const resolved = normalize(rawId) || normalize(rawName);
      if (!resolved) {
        unmatched.push({ record: label(r, i), rawId: rawId ?? null, rawName: rawName ?? null });
        return;
      }

      if (resolved.matchedByAlias) {
        aliasOnlyMatches.push({
          record: label(r, i),
          rawValue: rawName ?? rawId,
          resolvedClubId: resolved.clubId,
          canonicalName: resolved.canonicalName,
        });
      }

      if (!seenIdToNames[resolved.clubId]) seenIdToNames[resolved.clubId] = new Set();
      seenIdToNames[resolved.clubId].add(resolved.canonicalName);

      if (!seenNameToIds[resolved.canonicalName]) seenNameToIds[resolved.canonicalName] = new Set();
      seenNameToIds[resolved.canonicalName].add(resolved.clubId);
    });

    const duplicateClubIds = Object.keys(seenIdToNames)
      .filter((id) => seenIdToNames[id].size > 1)
      .map((id) => ({ clubId: id, canonicalNamesSeen: Array.from(seenIdToNames[id]) }));

    const duplicateCanonicalNames = Object.keys(seenNameToIds)
      .filter((name) => seenNameToIds[name].size > 1)
      .map((name) => ({ canonicalName: name, clubIdsSeen: Array.from(seenNameToIds[name]) }));

    return { unmatched, missingClubIds, aliasOnlyMatches, duplicateClubIds, duplicateCanonicalNames };
  }

  const CLUB_NORM = {
    PILOT_CLUB_IDS,
    isPilotClub,
    getCanonicalName,
    normalize,
    validateRecords,
    // exposed for the validation script to cross-check table fidelity against source
    _ALL_CLUBS_FOR_VALIDATION_ONLY: ALL_CLUBS,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = CLUB_NORM;
  }
  if (root) {
    root.CLUB_NORM = CLUB_NORM;
  }
})(typeof window !== "undefined" ? window : undefined);
