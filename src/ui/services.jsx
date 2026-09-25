/**
 * App context (Phase 1 wiring) — the bridge between the next UI's React tree
 * and the classic app's singletons (store, curriculum, settings).
 *
 * main.jsx constructs an `AppServices` object once and passes it to AppRoot;
 * screens pull it with useServices() and derive view-models from it. This
 * keeps screens render-pure (all state lives in the services + local cursor
 * state) and lets tests inject fakes directly.
 */
import React, { createContext, useContext } from 'react';
import { firstUnpassed } from '../core/targets.js';

const ServicesContext = createContext(null);

/** The non-React services screens need. Plain object, no methods that render. */
export function createServices({ store, curriculum, settings, overall, lessonIndex, graphicsProbe }) {
  return {
    store,
    curriculum,
    settings,
    overall,
    lessonIndex: lessonIndex || [],
    /**
     * P0-3 (M1): the boot-time graphics probe result ({ kitty, sixel,
     * iterm2, protocol, probed }) or the { probed: false } env fallback.
     * Read by the browser route's screenshot gating; null in tests that
     * construct services without it.
     */
    graphicsProbe: graphicsProbe || null,
    /**
     * Q13 session accounting, shared with main.jsx's quit path (the Ink
     * counterpart of the classic app's sessionPassed/sessionFailures).
     * `seconds` is filled in at quit; passes/failures accrue per check run.
     */
    sessionState: { seconds: 0, passed: new Set(), failures: 0 },
    /** Resume / next-up target (Q1, Q2): first unpassed challenge, ids included. */
    resumeTarget() {
      const target = firstUnpassed(this.curriculum, (id) => this.store.isPassed(id));
      if (!target) return null;
      return {
        moduleId: target.moduleId,
        lessonId: target.lessonId,
        challengeId: target.challengeId,
      };
    },
  };
}

export function ServicesProvider({ services, children }) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices() {
  // Nullable by design: components that can run standalone (tests pass a
  // precomputed view-model) call this defensively; screens that REQUIRE
  // services check for null themselves and fail loudly with context.
  return useContext(ServicesContext);
}
