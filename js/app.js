/* ═══════════════════════════════════════════════════════════
   APP SHELL — nav, routing, init
   ---------------------------------------------------------
   This is the LAST script in the pipeline (see js/data.js for the
   full load-order rationale). By the time this file executes, the
   document has been parsed for a while and DOMContentLoaded has
   already fired — so init() runs immediately at the bottom of this
   file rather than waiting on that event.
═══════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  function hydrateTopbar() {
    const D = window.PRECISION_DATA;
    document.getElementById("topbar-coach-count").textContent = `${D.coaches.length} coaches`;
    document.getElementById("topbar-club-count").textContent = `${D.clubs.length} pilot clubs`;
    document.getElementById("topbar-asof").textContent = D.meta.as_of_date || "Not available";
    const loadedEl = document.getElementById("topbar-loaded");
    if (loadedEl) loadedEl.textContent = new Date(D.meta.loaded_at).toLocaleString();
  }

  // On narrow viewports .primary-nav scrolls horizontally (css/styles.css)
  // and 5 tabs don't all fit — without this the active tab (e.g. "Club
  // Portfolio") can land partly off-screen with no visual cue a scroll
  // exists. Centers the active tab within the nav's own scroll area only
  // (nav.scrollTo, never window.scrollTo/scrollIntoView) so it never
  // drags the page itself.
  function scrollActiveTabIntoView() {
    const nav = document.querySelector(".primary-nav");
    const tab = document.querySelector(".nav-tab.active");
    if (!nav || !tab) return;
    const delta = tab.getBoundingClientRect().left - nav.getBoundingClientRect().left;
    const centeredDelta = delta - (nav.clientWidth - tab.clientWidth) / 2;
    nav.scrollTo({ left: nav.scrollLeft + centeredDelta, behavior: "smooth" });
  }

  function showView(name) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    const target = document.getElementById("view-" + name);
    if (target) target.classList.add("active");
    document.querySelectorAll(".nav-tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
    scrollActiveTabIntoView();
    window.scrollTo(0, 0);
    // The Club Portfolio's Leaflet map is initialized once at boot while this
    // tab is display:none (see styles.css ".view"), so it needs an explicit
    // invalidateSize() the moment it actually becomes visible, or tiles
    // render blank/mispositioned.
    if (name === "portfolio" && window.PAGE_PORTFOLIO) window.PAGE_PORTFOLIO.onShow();
  }

  function showCoach(coachId) {
    window.PAGE_COACH.select(coachId);
    showView("coach");
  }

  /* Club Portfolio drill-through (Phase 4) — receives the raw club_id
     string from the popup CTA (js/globe-popups.js) and routes into the
     Coach tab, pre-filtered to that club. Binding, ID-based end to end:
     never resolves, normalizes, canonicalizes, or matches by club display
     name at any step — STATE.selectedClubId is always String(clubId)
     exactly as passed in, and every consumer (render-coach.js,
     render-professionalism.js, render-performance.js, render-programming.js)
     matches it against coach.club_number via strict string equality only.
     This is why club 713 (Sports Club LA), whose portfolio display name
     doesn't match CLUB_NORM's alias table, works identically to every
     other pilot club here — this path never touches CLUB_NORM. */
  function viewCoachAnalyticsForClub(clubId) {
    if (!clubId) return;
    window.STATE.setSelectedClub(String(clubId));
    window.STATE.setActiveView("coach");
    showView("coach");
  }

  async function init() {
    hydrateTopbar();
    // Competency scores are attached asynchronously (see calculations.js
    // header) — wait for them so first paint never renders a false "Data
    // pending" for scores that are simply still loading.
    if (window.PRECISION_SCORES_READY && typeof window.PRECISION_SCORES_READY.then === "function") {
      await window.PRECISION_SCORES_READY;
    }
    // Self-assessment data (js/self-assessment-data.js) loads independently
    // of the scoring pipeline — wait for it too so first paint doesn't show
    // a false "not yet submitted" state.
    if (window.SELF_ASSESSMENT_READY && typeof window.SELF_ASSESSMENT_READY.then === "function") {
      await window.SELF_ASSESSMENT_READY;
    }
    if (window.TREND_HISTORY_READY && typeof window.TREND_HISTORY_READY.then === "function") {
      await window.TREND_HISTORY_READY;
    }
    window.PAGE_OVERVIEW.render();
    window.PAGE_PROFESSIONALISM.render();
    window.PAGE_PERFORMANCE.render();
    window.PAGE_PROGRAMMING.render();
    window.PAGE_COACH.render();
    window.PAGE_PORTFOLIO.render();
    showView("overview");
    if (window.PRECISION_HIDE_LOADING) window.PRECISION_HIDE_LOADING();
  }

  window.App = { init, showView, showCoach, viewCoachAnalyticsForClub };
  init();
})();
