/**
 * Welcome tour (overhaul §9, task 1.6).
 *
 * First launch (`settings.data.onboardedAt === null`) shows this before the
 * dashboard; finishing OR skipping stamps `onboardedAt` (spec: "Skippable at
 * every step; skipping marks onboarded") and drops back to the dashboard. The
 * palette's `app.tour` re-runs it any time.
 *
 * The step list and the state machine are pure and exported, so the replay
 * golden the task asks for tests the real transitions instead of a rendered
 * frame: `tourSteps({ tier })` + `tourReducer`.
 *
 * Degrade tiers: at Tier C/D there is no mouse and no OSC 52 clipboard, so the
 * mouse step is dropped from the list rather than shown as a lie.
 *
 * Scope note: step 4 is the specced sandbox — a non-graded scratch buffer that
 * asks the learner to type, complete and save. The Phase 2 editor is what makes
 * it interactive, so today it presents the sample buffer and its checklist and
 * advances on <CR>; the interactive version lands with that editor (its own
 * step in Appendix E).
 */
import React from 'react';
import { Box, Text } from 'ink';
import { useKeymap } from '../useKeymap.js';
import { useTheme, useIcons } from '../theme/context.jsx';

/** The scratch buffer shown in the sandbox step (never graded, never saved). */
export const SANDBOX_SAMPLE = [
  '<!doctype html>',
  '<html>',
  '  <body>',
  '    <h1>hello</h1>',
  '  </body>',
  '</html>',
];

/**
 * The tour, in order. `tier` is the capability tier from detectCapabilities()
 * ('A'..'D'); the mouse step is only shown when the terminal has a mouse.
 */
export function tourSteps({ tier = 'A' } = {}) {
  const steps = [
    {
      id: 'welcome',
      title: 'Welcome',
      body: [
        'A 12-module full-stack curriculum you work through in this terminal.',
        'Every lesson ends in challenges you solve by editing real code.',
        '',
        'Your progress lives in .data/progress.json - plain JSON, safe to back up.',
        '',
        'The dashboard keeps a daily goal (3 challenges by default, never enforced).',
        'Change or switch it off in Settings - s from the dashboard.',
      ],
    },
    {
      id: 'screen',
      title: 'The screen',
      body: [
        'Header    - where you are, and the module badges.',
        'Body      - the list or document you are working in: j/k move, Enter opens.',
        'Footer    - the keys that work right now, plus the last thing that happened.',
        '',
        'Esc always goes back. Ctrl+C always quits.',
      ],
    },
    {
      id: 'keys',
      title: 'Vim in 30 seconds',
      body: [
        'The editor has two modes. Normal mode is for moving around; insert mode',
        'is for typing. Press i to start typing and Esc to go back to normal.',
        '',
        'Normal mode: h j k l move, :w checks your code, u undoes. Arrow keys always',
        'work, in both modes - you can ignore everything else until you are ready.',
        '',
        'Press v now to switch to simple, modeless keys instead (it is remembered).',
      ],
    },
    {
      id: 'sandbox',
      title: 'Try it',
      body: [
        'This is a scratch buffer. Nothing here is graded or saved.',
        '',
        '1. Type a few characters.',
        '2. Press Ctrl+Space for completions.',
        '3. Press Ctrl+S to check it.',
        '4. Press Ctrl+B to open the browser pane.',
        '',
        'The editor that makes all of that real is the next milestone; for now,',
        'Enter moves on and you can come back to any of it later.',
      ],
    },
    {
      id: 'mouse',
      title: 'Mouse & clipboard',
      body: [
        'The wheel scrolls. Clicking a list row focuses it, and a pane divider',
        'can be dragged to resize it.',
        '',
        'Hold Shift while selecting to use your terminal\'s own text selection -',
        'the only copy that reaches your system clipboard.',
      ],
    },
  ];
  return tier === 'C' || tier === 'D' ? steps.filter((s) => s.id !== 'mouse') : steps;
}

/**
 * Pure step machine. `next` on the last step finishes the tour (that is the
 * "Done → dashboard" step of §9) and `skip` finishes from anywhere.
 *
 * The modeless choice is NOT state here: it is written straight to
 * `settings.data.editor.vimMode` (the same preference `settings.vimToggle`
 * flips) and read back for display, so the tour can never show one thing while
 * a different value is persisted — the "modeless switch persists" criterion.
 *
 * @returns {{ index: number, done: boolean }}
 */
export function tourReducer({ index = 0 } = {}, action = {}, total = 1) {
  switch (action.type) {
    case 'next':
      if (index >= total - 1) return { index, done: true };
      return { index: index + 1, done: false };
    case 'skip':
      return { index, done: true };
    default:
      return { index, done: false };
  }
}

export function TourScreen({ step = 0, total = 1, title, body = [], modeless = false, sandbox = false, onCommand }) {
  const theme = useTheme();
  const ic = useIcons();
  useKeymap('tour', (id) => onCommand?.(id));

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.accent} bold> {ic.brand} Welcome tour </Text>
        <Text color={theme.muted}> step {Math.min(step + 1, total)}/{total}</Text>
      </Text>
      <Text> </Text>
      <Text bold color={theme.accent}> {title}</Text>
      {body.map((line, i) => (
        <Text key={i} color={i === 0 ? undefined : theme.muted}> {line}</Text>
      ))}
      {sandbox ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.muted}> scratch buffer</Text>
          {SANDBOX_SAMPLE.map((line, i) => (
            <Text key={i} color={theme.good}> {line}</Text>
          ))}
        </Box>
      ) : null}
      <Text> </Text>
      <Text color={modeless ? theme.good : theme.muted}>
        {' '}keys: {modeless ? 'simple (no modes) - remembered' : 'vim (i to type, Esc to stop)'}
      </Text>
      <Text color={theme.muted}> Enter {step >= total - 1 ? 'finish' : 'next'} {ic.bullet} v simple keys {ic.bullet} Esc skip</Text>
    </Box>
  );
}
