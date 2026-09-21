/**
 * Modal dialog + transient toast (overhaul Phase 1, task 1.1b).
 *
 * Both are pure, controlled components: the parent owns open/visible state
 * and passes content in. They never call process.stdout — everything renders
 * inside ink's frame, so they compose with the harness and snapshot tests.
 */
import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { openOverlay, closeOverlay } from '../input/overlayStack.js';
import { useTheme, useIcons } from '../theme/context.jsx';
import { animationAllowed, framesFor, frameAt, createAnimator } from '../animation.js';
import { detectCapabilities } from '../capabilities.js';

/**
 * Centered dialog. Rendering is a no-op when `open` is false, so callers can
 * mount it unconditionally inside a screen.
 *
 * Key behavior rides with the visual: while `open`, the modal registers an
 * overlay handler for the LIFO stack the dispatcher consults BEFORE the
 * focused screen (and swallows unconsumed keys). Keys therefore work
 * identically whether a test drives the component directly or the app drives
 * the real dispatcher.
 */
export function Modal({ title, open = false, width = 44, onKey, children }) {
  const theme = useTheme();
  useEffect(() => {
    if (!open || typeof onKey !== 'function') return undefined;
    const close = openOverlay({ id: 'modal', onKey });
    return close;
  }, [open, onKey]);

  if (!open) return null;
  return (
    <Box justifyContent="center" marginTop={1}>
      <Box
        flexDirection="column"
        width={width}
        borderStyle="double"
        borderColor={theme.accent}
        paddingX={1}
      >
        {title ? (
          <Text bold color={theme.accent}> {title}</Text>
        ) : null}
        {children}
      </Box>
    </Box>
  );
}

const TOAST_COLORS = (theme) => ({ info: theme.accent, warn: theme.warn, error: theme.bad, ok: theme.good });

/** One-line transient notice, pinned above the footer area of a screen. */
export function Toast({ message, kind = 'info', visible = true }) {
  const theme = useTheme();
  const ic = useIcons();
  if (!visible || !message) return null;
  const color = TOAST_COLORS(theme)[kind] || theme.accent;
  return (
    <Box>
      <Text color={color} bold={kind === 'error'}>
        {' '}{ic.bullet} {message} {ic.bullet}{' '}
      </Text>
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Motion (overhaul §7.3): a running indicator and a pass celebration.
// Gated by `animationAllowed` — static text at tiers C/D, NO_ANIMATION and CI.
// ---------------------------------------------------------------------------

/**
 * One shared animation clock per module: the challenge route's BusyLine and
 * CelebrateLine mount/unmount independently, and two intervals would double
 * the frame rate and stack timers under StrictMode.
 */
const animator = createAnimator();

function useAnimationFrame(icons) {
  const [value, setValue] = useState(animator.value);
  useEffect(() => {
    if (!animationAllowed(detectCapabilities())) return undefined;
    animator.start(80, setValue);
    return () => animator.stop();
  }, [icons]);
  return value;
}

/** The busy line shown while a check runs: spinner + status text. */
export function BusyLine({ label = 'running your code…', visible = true }) {
  const theme = useTheme();
  const ic = useIcons();
  const { spinner } = framesFor(ic);
  const frame = useAnimationFrame(ic);
  if (!visible) return null;
  const glyph = animationAllowed(detectCapabilities()) ? frameAt(spinner, frame) : spinner[0];
  return (
    <Text color={theme.warn} bold>
      {' '}{glyph} {label}
    </Text>
  );
}

/**
 * The one-line pass celebration. The sparkle advances for a few frames and
 * then settles (a celebrant, not a screensaver); every Nth frame shows a
 * different glyph, so a static render still shows the last one.
 */
export function CelebrateLine({ label = 'solved — nice work.', frames = 24 }) {
  const theme = useTheme();
  const ic = useIcons();
  const { celebrate } = framesFor(ic);
  const allowed = animationAllowed(detectCapabilities());
  const frame = useAnimationFrame(ic);
  // Settle: after `frames` ticks the glyph stops advancing.
  const i = allowed ? Math.min(frame, frames) : frames;
  return (
    <Text color={theme.good} bold>
      {' '}{frameAt(celebrate, i)} {label}
    </Text>
  );
}
