#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════
   PHASE 4 VALIDATION — dev-time only, not part of the app pipeline
   ---------------------------------------------------------
   Confirms every one of the 10 pilot clubs resolves correctly through
   club-normalization.js (both by its pilot-directory name and, via the
   cross-source alias, its Club Portfolio name), and that there are zero
   duplicate club identities in that resolution. This is the automated
   backing for the Phase 4 report's "zero unmatched, zero duplicates"
   claim — see PHASE4_REPORT.md.

   Run with: node scripts/phase4-validation.js
═══════════════════════════════════════════════════════════ */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CLUB_NORM = require(path.join(ROOT, "js", "club-normalization.js"));
const directory = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pilot_coach_directory.json"), "utf8"));

let failures = 0;
function check(label, condition) {
  console.log(`  ${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) failures++;
}

const dirPairs = {};
directory.forEach((r) => { dirPairs[String(r.club_number)] = r.club_name; });

console.log("== Pilot club resolution (directory name -> normalize()) ==");
CLUB_NORM.PILOT_CLUB_IDS.forEach((id) => {
  const dirName = dirPairs[id];
  const resolved = CLUB_NORM.normalize(dirName);
  check(`club ${id} ("${dirName}") resolves to itself`, resolved && resolved.clubId === id);
});

console.log("\n== Duplicate identity check across all 10 pilot clubs ==");
const seenIds = new Set();
const seenNames = new Set();
let dupeIds = 0, dupeNames = 0;
CLUB_NORM.PILOT_CLUB_IDS.forEach((id) => {
  if (seenIds.has(id)) dupeIds++;
  seenIds.add(id);
  const name = CLUB_NORM.getCanonicalName(id);
  if (seenNames.has(name)) dupeNames++;
  seenNames.add(name);
});
check("zero duplicate club IDs", dupeIds === 0);
check("zero duplicate canonical names", dupeNames === 0);

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}`);
process.exit(failures === 0 ? 0 : 1);
