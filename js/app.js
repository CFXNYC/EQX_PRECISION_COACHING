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

  function init() {
    hydrateTopbar();
    window.PAGE_OVERVIEW.render();
    window.PAGE_GROWTH.render();
    window.PAGE_BEHAVIOR.render();
    window.PAGE_COACH.render();
    window.PAGE_PORTFOLIO.render();
    showView("overview");
    if (window.PRECISION_HIDE_LOADING) window.PRECISION_HIDE_LOADING();
  }

  window.App = { init, showView, showCoach };
  init();
})();
