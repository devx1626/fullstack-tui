/**
 * Test harness entry (built with `npm run build -- --spike`).
 * Re-exports ink's render, input hooks, and the UI components so node:test
 * files can render JSX components from plain .js test files.
 *
 * Everything React/ink-flavored must come from THIS bundle — importing react
 * from node_modules in a test file while rendering bundled components mixes
 * two React copies and crashes with the useContext null-dispatcher error.
 */
import React, { useState, useEffect, useRef } from 'react';
import { render, useInput, useApp } from 'ink';
import { useKeymap, getCurrentRoute, setCurrentRoute, clearRoute } from './useKeymap.js';

export { render, useInput, useApp, useState, useEffect, useRef, useKeymap, getCurrentRoute, setCurrentRoute, clearRoute };
export { dispatchToScreen } from './useKeymap.js';
export { SCREEN_TARGETS, TAB_TARGETS } from './screenTargets.js';
export { preferenceRows, vimPreferenceRow, togglePreference, clampTabSize, nextTabSize, TAB_SIZES,
         THEME_NAMES, THEME_CYCLE, normalizeTheme, themeLabel, nextTheme, stepTheme,
         ICON_CYCLE, stepIcons } from './preferences.js';
export { openOverlay, closeOverlay, clearOverlays, hasOverlays, routeToOverlays, _resetOverlays } from './input/overlayStack.js';
export { Header, Panel, List, ScrollPane, Footer, Badge, Meter } from './components/chrome.jsx';
export { Palette, paletteMatches } from './components/palette.jsx';
export { SplitPane } from './components/splitPane.jsx';
export { ResizableSplit, useResizableSplit } from './components/ResizableSplit.jsx';
export { CodeEditor, useEditorMouse } from './components/CodeEditor.jsx';
export { CompletionPopup } from './components/CompletionPopup.jsx';
export { clampSplit, clampRatio, nudgeRatio, ratioToColumns, columnsToRatio, MIN_RATIO, MAX_RATIO, RATIO_STEP } from './components/splitClamp.js';
export { Modal, Toast, BusyLine, CelebrateLine } from './components/overlays.jsx';
export { animationAllowed, framesFor, frameAt, createAnimator } from './animation.js';
export { RouterProvider, RouterView, useRouter } from './router.jsx';
export { AppRoot } from './AppRoot.jsx';
export { ThemeProvider, useTheme, ThemeContext, ThemeControlProvider, useThemeControl, ThemeControlContext,
         IconsProvider, useIcons, IconsContext, IconsControlProvider, useIconControl, IconsControlContext } from './theme/context.jsx';
export { ICON_SETS, ICON_CHOICES, iconsFor, normalizeIconSet, nextIconSet, iconSetLabel, autoIconSet, resolveIconSet } from './theme/icons.js';
export { CommandHost, useHost, dispatchGlobal, setGlobalCommandSink, getGlobalCommandSink, setGlobalBellSink, getGlobalBellSink } from './host.jsx';
export {
  HomeRoute, ModuleRoute, ChallengeRoute,
  LessonRoute, ProjectsRoute,
  HelpRoute, ResourcesRoute, WorkspaceRoute, StatsRoute,
  SettingsRoute, TourRoute,
} from './routes.jsx';
export { BrowserRoute, browserJumpHandoff, LIVE_POLL_MS } from './routesBrowser.jsx';
export { ServicesProvider, createServices, useServices } from './services.jsx';
export { nextIndex, isListMove } from './nav.js';
export { ChallengeScreen } from './screens/challenge.jsx';
export { HomeScreen } from './screens/home.jsx';
export { ModuleScreen } from './screens/module.jsx';
export { homeViewModel, moduleViewModel, meterCells, clampScroll, wrapText } from './screens/screenModel.js';
export { LessonScreen, lessonLines, proseLines } from './screens/lesson.jsx';
export { ProjectsScreen, projectsLines } from './screens/projects.jsx';
export { HelpScreen, helpLines } from './screens/help.jsx';
export { ResourcesScreen, resourcesLines } from './screens/resources.jsx';
export { WorkspaceScreen, workspaceLines } from './screens/workspace.jsx';
export { StatsScreen, statsLines, sparkline } from './screens/stats.jsx';
export { PaletteScreen, buildPaletteItems, recentItems, paletteKey } from './screens/palette.jsx';
export { BrowserScreen } from './screens/browser.jsx';
export {
  BROWSER_TABS, TAB_LABEL, TAB_HINTS, tabHint, buildPage, buildRenderRows, buildElementRows,
  buildStyleRows, buildConsoleRows, buildNetworkRows, clampElement, elementRowToSource, paneClick,
} from './screens/browserModel.js';
export { SettingsScreen, settingsLines, settingsLayout, rowMarker } from './screens/settings.jsx';
export { TourScreen, tourSteps, tourReducer, SANDBOX_SAMPLE } from './screens/tour.jsx';
export { eventParts } from './commands.js';
export { cursorShape } from './multimedia.js';
export { screenshotEnvEnabled, screenshotProtocol, screenshotAvailability, runScreenshotAction } from './screenshotAction.js';
export { setPlaywrightLoader, isPlaywrightAvailable } from './screenshot.js';
export { Text, Box } from 'ink';

/** createElement shorthand for tests (children variadic). */
export const el = (Component, props, ...children) => React.createElement(Component, props, ...children);
