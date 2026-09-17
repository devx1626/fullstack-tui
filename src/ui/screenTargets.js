/**
 * Screens the next UI has actually ported, offered as palette "Go to" targets
 * (and as the destinations the host knows how to navigate to).
 *
 * Add a screen here when its route lands: it then appears in the palette's
 * "Go to" section, becomes reachable by the Appendix B.2 tab bindings
 * (Alt+1..5 / Alt+h/l — the input pipeline emits `alt-<char>` for ESC-prefixed
 * bytes) and becomes a stop on the tab cycle (`nav.tabNext`/`nav.tabPrev`).
 *
 * `tab: true` marks the FIVE top-level tabs of Appendix B.2, in order:
 * Dashboard · Projects · Progress · Resources · Workspace. They are the ones
 * `Alt+1..5` jumps to and the ones the tab cycle walks. Help and Settings are
 * ported screens but not tabs, so they are palette destinations only — before
 * this flag existed, Help was a tab-cycle stop and the cycle disagreed with the
 * documented tab list.
 */
export const SCREEN_TARGETS = [
  { route: 'home', title: 'Dashboard', tab: true },
  { route: 'projects', title: 'Projects', tab: true },
  { route: 'stats', title: 'Progress', tab: true },
  { route: 'resources', title: 'Resources', tab: true },
  { route: 'workspace', title: 'Workspace', tab: true },
  { route: 'help', title: 'Help' },
  { route: 'settings', title: 'Settings' },
];

/** The Appendix B.2 tab order (what Alt+1..5 and the tab cycle use). */
export const TAB_TARGETS = SCREEN_TARGETS.filter((s) => s.tab);
