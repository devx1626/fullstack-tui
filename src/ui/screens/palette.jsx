/**
 * Command palette (overhaul task 1.5, spec §10).
 *
 * `buildPaletteItems` is pure: every registered command available on the
 * screen you came from, plus "Go to" targets (screens, modules, lessons).
 * Item ids are stable (`cmd:challenge.check`, `go:lesson:m1.l1`) and are what
 * `.data/settings.json` `palette.recent` stores.
 *
 * The palette renders INSIDE CommandHost rather than as a router screen, on
 * purpose: pushing it on the stack would unmount the screen underneath, losing
 * that screen's cursor state and its registered command handler — so a
 * cancelled palette would reset the list you were on, and Enter could not run
 * a screen-scoped command. As an overlay the screen stays mounted and
 * `dispatchToScreen` can run the id exactly as the key would.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { Palette } from '../components/palette.jsx';
import { commandsForScreen, mergeKeymap, displayBinding } from '../commands.js';

/**
 * Registered commands hidden from the palette. `browser.screenshot` (P0-3)
 * is gated on the terminal's graphics protocol and an env opt-in — the M1
 * action degrades to guidance when invoked unprepared, but the palette list
 * should not advertise an action the session cannot render.
 */
const PALETTE_EXCLUDED = new Set(['browser.screenshot']);
import { clampSelected } from '../fuzzy.js';
import { useTheme, useIcons } from '../theme/context.jsx';

/**
 * Palette modal key handling, as a pure function: given the current query /
 * selection / match count and one key event, return the next state plus an
 * action ('run' | 'cancel' | null). Extracted so the behavior is unit-tested
 * instead of hiding inside a ref in the CommandHost.
 */
export function paletteKey({ query = '', selected = 0, count = 0 } = {}, ev = {}) {
  switch (ev.name) {
    case 'escape':
      return { query, selected, action: 'cancel' };
    case 'enter':
      return { query, selected, action: 'run' };
    case 'up':
      return { query, selected: clampSelected(selected - 1, count), action: null };
    case 'down':
      return { query, selected: clampSelected(selected + 1, count), action: null };
    case 'backspace':
      return { query: query.slice(0, -1), selected: 0, action: null };
    case 'char':
      return { query: query + (ev.char || ''), selected: 0, action: null };
    default:
      // A modal swallows what it does not use (the dispatcher drops declines).
      return { query, selected, action: null };
  }
}

/** `cmd:<id>` → the registry command's palette item id. */
export function itemIdForCommand(commandId) {
  return `cmd:${commandId}`;
}

/** Accept a plain Map, a `{ keymap }` bundle (effectiveKeymap) or nothing. */
function keyMapOf(keymap) {
  if (keymap instanceof Map) return keymap;
  if (keymap && keymap.keymap instanceof Map) return keymap.keymap;
  return mergeKeymap().keymap;
}

/**
 * Build the palette's item list.
 *
 * @param {object} p
 * @param {string|null} [p.screen]    screen the user came from (scopes commands)
 * @param {Array} [p.curriculum]      modules for the "Go to" section
 * @param {Array<{route,title}>} [p.screens] ported screens offered as targets
 * @param {Map|object} [p.keymap]     merged keymap (defaults + user overrides)
 */
export function buildPaletteItems({ screen = null, curriculum = [], screens = [], keymap } = {}) {
  const map = keyMapOf(keymap);
  const items = [];

  for (const cmd of commandsForScreen(screen)) {
    if (PALETTE_EXCLUDED.has(cmd.id)) continue;
    const binding = map.get(cmd.id);
    items.push({
      id: itemIdForCommand(cmd.id),
      kind: 'command',
      commandId: cmd.id,
      title: cmd.title,
      keys: binding ? displayBinding(binding) : '',
    });
  }

  // "Go to" — non-command navigation, per the spec's empty-prompt wireframe.
  for (const s of screens) {
    items.push({ id: `go:screen:${s.route}`, kind: 'screen', route: s.route, title: `Go to: ${s.title}`, keys: '' });
  }
  for (const mod of curriculum) {
    items.push({
      id: `go:module:${mod.id}`,
      kind: 'module',
      moduleId: mod.id,
      title: `Go to: ${mod.badge} ${mod.title}`,
      keys: '',
    });
    for (const lesson of mod.lessons || []) {
      items.push({
        id: `go:lesson:${lesson.id}`,
        kind: 'lesson',
        moduleId: mod.id,
        lessonId: lesson.id,
        title: `Go to:   ${lesson.title} · ${mod.id}`,
        keys: '',
      });
    }
  }
  return items;
}

/** Resolve stored recent ids to items, dropping ids that no longer exist. */
export function recentItems(items, recentIds = []) {
  const byId = new Map(items.map((it) => [it.id, it]));
  return recentIds.map((id) => byId.get(id)).filter(Boolean);
}

export function PaletteScreen({
  items = [],
  recents = [],
  query = '',
  selected = 0,
  height = 14,
  onChangeQuery,
  onMove,
  onRun,
  onCancel,
}) {
  const theme = useTheme();
  const ic = useIcons();
  // Filtering is shared with the owner of `selected` (paletteMatches), so the
  // highlighted row and the executed row can never disagree.
  return (
    <Box flexDirection="column" paddingLeft={1}>
      <Text>
        <Text color={theme.accent} bold> Command palette </Text>
        <Text color={theme.muted}> {items.length} commands {ic.bullet} Enter run {ic.bullet} Esc close</Text>
      </Text>
      <Palette
        title={`${ic.command} Commands`}
        query={query}
        commands={items}
        recents={recents}
        selected={selected}
        height={Math.max(3, height - 4)}
        onChangeQuery={onChangeQuery}
        onMove={onMove}
        onRun={onRun}
        onCancel={onCancel}
      />
    </Box>
  );
}
