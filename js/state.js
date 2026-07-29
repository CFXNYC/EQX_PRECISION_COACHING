/* ═══════════════════════════════════════════════════════════
   DASHBOARD STATE — centralized, subscribable selection state
   ---------------------------------------------------------
   Single source of truth for cross-view selection (active tab,
   selected macro/region/club/coach/week/pillar, theme). No module
   should keep its own copy of "the selected club" — read/write it
   here so every view stays in sync.

   PHASE 3 SCOPE: this module is not yet wired into index.html or
   any render-*.js file, and nothing currently calls STATE.* at
   runtime. Connecting views to it is Phase 4+ work.

   Exposed as window.STATE in the browser, module.exports in Node
   (the latter only so the Phase 3 validation script can exercise
   the pub/sub API without a browser).
═══════════════════════════════════════════════════════════ */
(function (root) {
  "use strict";

  const DEFAULT_STATE = Object.freeze({
    activeView: "overview",
    selectedMacro: "ALL",
    selectedRegion: null,
    selectedClubId: null,
    selectedClubName: null,
    selectedCoachId: null,
    selectedWeek: null,
    selectedPillar: null,
    dateRange: null,
    theme: "light",
  });

  let state = Object.assign({}, DEFAULT_STATE);
  const listeners = new Set();

  function getState() {
    return Object.assign({}, state); // shallow copy — callers can't mutate internal state directly
  }

  function setState(patch) {
    if (!patch || typeof patch !== "object") return getState();
    const prevState = getState();
    state = Object.assign({}, state, patch);
    const nextState = getState();
    listeners.forEach((fn) => {
      try { fn(nextState, prevState); } catch (e) { console.error("[STATE] subscriber threw:", e); }
    });
    return nextState;
  }

  function subscribe(fn) {
    if (typeof fn !== "function") throw new TypeError("STATE.subscribe expects a function");
    listeners.add(fn);
    return function () { unsubscribe(fn); }; // convenience: subscribe() return value also unsubscribes
  }

  function unsubscribe(fn) {
    listeners.delete(fn);
  }

  function setSelectedClub(clubId, clubName) {
    return setState({
      selectedClubId: clubId === undefined ? null : clubId,
      selectedClubName: clubName === undefined ? null : clubName,
    });
  }

  function clearSelectedClub() {
    return setState({ selectedClubId: null, selectedClubName: null });
  }

  function setActiveView(viewName) {
    return setState({ activeView: viewName });
  }

  const STATE = {
    getState,
    setState,
    subscribe,
    unsubscribe,
    setSelectedClub,
    clearSelectedClub,
    setActiveView,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = STATE;
  }
  if (root) {
    root.STATE = STATE;
  }
})(typeof window !== "undefined" ? window : undefined);
