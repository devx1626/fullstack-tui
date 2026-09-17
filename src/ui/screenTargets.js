/**
 * Screens the next UI has actually ported, offered as palette "Go to" targets
 * (and as the destinations the host knows how to navigate to).
 *
 * Console access to the remaining top-level screens is the palette's job for
 * now: Appendix B.2 binds them to Alt+1..5 / Alt+h/l, but the input pipeline
 * does not emit Alt-modified keys yet (parseKeys handles ctrl, not ESC-prefixed
 * alt), so those bindings would resolve to nothing. Add a screen here when its
 * route lands and it appears in the palette immediately.
 */
export const SCREEN_TARGETS = [
  { route: 'home', title: 'Dashboard' },
  { route: 'stats', title: 'Progress' },
  { route: 'resources', title: 'Resources' },
  { route: 'workspace', title: 'Workspace' },
  { route: 'help', title: 'Help' },
];
