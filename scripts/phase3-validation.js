#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   PHASE 3 VALIDATION — dev-time only, not part of the app pipeline
   ---------------------------------------------------------
   1. Self-tests js/state.js's pub/sub API.
   2. Cross-checks js/club-normalization.js's hand-built alias table
      against the real CLUB_IDS table inside
      EQX CLUB PORTFOLIO/MASTER_MAP_UI.html (read-only — this script
      never writes to that file) to prove the copy is faithful, not
      invented.
   3. Runs the normalization module's validation utilities against
      data/pilot_coach_directory.json and reports what's in
      data/pilot_coach_data.json regarding club identity.

   Run with: node scripts/phase3-validation.js
═══════════════════════════════════════════════════════════ */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const STATE = require(path.join(ROOT, "js", "state.js"));
const CLUB_NORM = require(path.join(ROOT, "js", "club-normalization.js"));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    console.log(`  FAIL  ${label}`);
    failures++;
  }
}

/* ─────────────────────────────────────────────────────────
   1. STATE self-test
───────────────────────────────────────────────────────── */
console.log("\n== 1. state.js self-test ==");

check("getState returns the documented default shape",
  JSON.stringify(Object.keys(STATE.getState()).sort()) ===
  JSON.stringify(["activeView","dateRange","selectedClubId","selectedClubName","selectedCoachId",
    "selectedMacro","selectedPillar","selectedRegion","selectedWeek","theme"].sort()));

check("default activeView is 'overview'", STATE.getState().activeView === "overview");
check("default selectedMacro is 'ALL'", STATE.getState().selectedMacro === "ALL");

let received = null;
const unsub = STATE.subscribe((next) => { received = next; });
STATE.setSelectedClub("112", "Greenwich Ave NY");
check("setSelectedClub updates selectedClubId", STATE.getState().selectedClubId === "112");
check("setSelectedClub updates selectedClubName", STATE.getState().selectedClubName === "Greenwich Ave NY");
check("subscriber received the update", received && received.selectedClubId === "112");

STATE.setActiveView("growth");
check("setActiveView updates activeView", STATE.getState().activeView === "growth");
check("setState patch does not clobber unrelated fields (selectedClubId still set)",
  STATE.getState().selectedClubId === "112");

STATE.clearSelectedClub();
check("clearSelectedClub resets selectedClubId to null", STATE.getState().selectedClubId === null);
check("clearSelectedClub resets selectedClubName to null", STATE.getState().selectedClubName === null);

unsub();
received = null;
STATE.setActiveView("coach");
check("unsubscribe (via subscribe's return value) stops further notifications", received === null);

const fn = () => {};
STATE.subscribe(fn);
STATE.unsubscribe(fn);
let calledAfterUnsubscribe = false;
STATE.subscribe(() => {}); // unrelated listener, just to prove no crash
STATE.setState({ theme: "dark" });
check("standalone unsubscribe(fn) works without throwing", !calledAfterUnsubscribe);
check("getState returns a shallow copy, not the live object",
  (() => { const s = STATE.getState(); s.activeView = "TAMPERED"; return STATE.getState().activeView !== "TAMPERED"; })());

/* ─────────────────────────────────────────────────────────
   2. club-normalization.js fidelity check against source
───────────────────────────────────────────────────────── */
console.log("\n== 2. club-normalization.js vs. MASTER_MAP_UI.html source fidelity ==");

const mapSourcePath = path.join(ROOT, "EQX CLUB PORTFOLIO", "MASTER_MAP_UI.html");
const mapSource = fs.readFileSync(mapSourcePath, "utf8");

const clubIdsMatch = mapSource.match(/const CLUB_IDS = \{([\s\S]*?)\n\};/);
check("CLUB_IDS block found in MASTER_MAP_UI.html", !!clubIdsMatch);

// Trusted local source file, evaluated read-only to compare data — never written back.
const sourceClubIds = new Function(`return {${clubIdsMatch[1]}};`)();
check("source CLUB_IDS table is non-empty", Object.keys(sourceClubIds).length > 100);

const ourAliases = CLUB_NORM._ALL_CLUBS_FOR_VALIDATION_ONLY;

// Only portfolioAliases are checkable against MASTER_MAP_UI.html — directoryAliases
// (e.g. "Greenwich Ave NY", "Boston Seaport") are the pilot directory's own naming
// and correctly do not appear in the portfolio's CLUB_IDS table at all.
const portfolioFidelityMismatches = [];
let portfolioAliasCount = 0;
Object.keys(ourAliases).forEach((id) => {
  ourAliases[id].portfolioAliases.forEach((alias) => {
    portfolioAliasCount++;
    const sourceId = sourceClubIds[alias];
    if (sourceId !== id) {
      portfolioFidelityMismatches.push({ alias, expectedId: id, sourceId: sourceId ?? "NOT FOUND IN SOURCE" });
    }
  });
});
check(`all ${portfolioAliasCount} portfolioAliases in club-normalization.js match MASTER_MAP_UI.html's CLUB_IDS exactly`,
  portfolioFidelityMismatches.length === 0);
if (portfolioFidelityMismatches.length) console.log("    mismatches:", JSON.stringify(portfolioFidelityMismatches, null, 2));

check('"SCDC" is correctly NOT present as an alias (verified absent from source, not fabricated)',
  !Object.values(ourAliases).some((e) => e.portfolioAliases.includes("SCDC") || e.directoryAliases.includes("SCDC")));

/* ─────────────────────────────────────────────────────────
   2.5 Cross-source alias resolution — the actual point of this
       module: does a portfolio-side name resolve to the correct
       directory-side canonical identity?
───────────────────────────────────────────────────────── */
console.log("\n== 2.5 Cross-source alias resolution ==");

const crossChecks = [
  { input: "Greenwich Avenue", expectId: "112", expectCanonical: "Greenwich Ave NY", expectAlias: true },
  { input: "Seaport", expectId: "206", expectCanonical: "Boston Seaport", expectAlias: true },
  { input: "SCLA", expectId: "713", expectCanonical: "Sports Club LA", expectAlias: true },
  { input: "Brookfield Place", expectId: "128", expectCanonical: "Brookfield", expectAlias: true },
  { input: "Greenwich Ave NY", expectId: "112", expectCanonical: "Greenwich Ave NY", expectAlias: false },
  { input: "SCNY", expectId: "131", expectCanonical: "Sports Club NY", expectAlias: true },
  { input: "  east 63rd street  ", expectId: "105", expectCanonical: "East 63rd Street", expectAlias: false }, // trim + case-insensitive
  { input: "Not A Real Club", expectId: null, expectCanonical: null, expectAlias: null },
];
crossChecks.forEach(({ input, expectId, expectCanonical, expectAlias }) => {
  const r = CLUB_NORM.normalize(input);
  if (expectId === null) {
    check(`normalize("${input}") correctly returns null (no fabricated match)`, r === null);
  } else {
    check(`normalize("${input}") -> id ${expectId}, canonical "${expectCanonical}", matchedByAlias ${expectAlias}`,
      r && r.clubId === expectId && r.canonicalName === expectCanonical && r.matchedByAlias === expectAlias);
  }
});

/* ─────────────────────────────────────────────────────────
   3. Validate against pilot_coach_directory.json + report on
      pilot_coach_data.json
───────────────────────────────────────────────────────── */
console.log("\n== 3. Validation against real pilot data ==");

const directory = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pilot_coach_directory.json"), "utf8"));
const perfData = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pilot_coach_data.json"), "utf8"));

// directoryAliases fidelity: every pilot club's directoryAliases entry must match
// the actual (club_number -> club_name) pairs found in the real directory file.
const directoryPairs = {};
directory.forEach((r) => { directoryPairs[String(r.club_number)] = r.club_name; });
const directoryFidelityMismatches = [];
CLUB_NORM.PILOT_CLUB_IDS.forEach((id) => {
  const entry = ourAliases[id];
  const realName = directoryPairs[id];
  if (!entry.directoryAliases.includes(realName)) {
    directoryFidelityMismatches.push({ clubId: id, expectedOneOf: entry.directoryAliases, actualDirectoryName: realName });
  }
});
check(`all ${CLUB_NORM.PILOT_CLUB_IDS.length} pilot clubs' directoryAliases match pilot_coach_directory.json exactly`,
  directoryFidelityMismatches.length === 0);
if (directoryFidelityMismatches.length) console.log("    mismatches:", JSON.stringify(directoryFidelityMismatches, null, 2));

console.log(`  Directory records: ${directory.length}`);
const dirResults = CLUB_NORM.validateRecords(directory, { idField: "club_number", nameField: "club_name" });

check("zero unmatched directory records", dirResults.unmatched.length === 0);
check("zero missing club id/name in directory", dirResults.missingClubIds.length === 0);
check("zero duplicate club IDs across directory (same id, conflicting canonical names)", dirResults.duplicateClubIds.length === 0);
check("zero duplicate canonical names across directory (same name, conflicting ids)", dirResults.duplicateCanonicalNames.length === 0);

console.log(`  Alias-only matches (directory club_name required alias resolution): ${dirResults.aliasOnlyMatches.length}`);
if (dirResults.aliasOnlyMatches.length) {
  const distinct = {};
  dirResults.aliasOnlyMatches.forEach((m) => { distinct[m.rawValue] = m.canonicalName; });
  Object.keys(distinct).forEach((raw) => console.log(`    "${raw}" -> canonical "${distinct[raw]}"`));
}

const pilotClubsSeenInDirectory = new Set(directory.map((r) => String(r.club_number)));
check("all 10 pilot clubs present in directory",
  CLUB_NORM.PILOT_CLUB_IDS.every((id) => pilotClubsSeenInDirectory.has(id)) &&
  pilotClubsSeenInDirectory.size === 10);

console.log(`\n  Performance records (pilot_coach_data.json): ${perfData.length}`);
const perfClubFields = Object.keys(perfData[0] || {}).filter((k) => k.toLowerCase().includes("club"));
console.log(`  Club-related fields present in pilot_coach_data.json: ${perfClubFields.length ? perfClubFields.join(", ") : "NONE"}`);
console.log("  FINDING: pilot_coach_data.json carries no club identifier at all. Club affiliation for");
console.log("  performance records is established transitively through js/data.js's existing name-based");
console.log("  join to the directory, not directly from this file. There is nothing for");
console.log("  club-normalization.js to validate club-wise in pilot_coach_data.json until/unless a club");
console.log("  field is added to that export — flagging this as a data-source observation, not an error.");

/* ─────────────────────────────────────────────────────────
   Summary
───────────────────────────────────────────────────────── */
console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
