/**
 * Screens the next UI has actually ported, offered as palette "Go to" targets
 * (and as the destinations the host knows how to navigate to).
 *
 * Add a screen here when its route lands: it then appears in the palette's
 * "Go to" section, becomes reachable by the Appendix B.2 tab bindings
 * (Alt+1..5 / Alt+h/l — the input pipeline emits `alt-<char>` for ESC-prefixed
 * bytes) and becomes a stop on the tab cycle (`nav.tabNext`/`nav.tabPrev`).
 */
export const SCREEN_TARGETS = [
  { route: 'home', title: 'Dashboard' },
  { route: 'projects', title: 'Projects' },
  { route: 'stats', title: 'Progress' },
  { route: 'resources', title: 'Resources' },
  { route: 'workspace', title: 'Workspace' },
  { route: 'help', title: 'Help' },
];
