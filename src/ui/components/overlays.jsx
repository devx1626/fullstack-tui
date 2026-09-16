/**
 * Modal dialog + transient toast (overhaul Phase 1, task 1.1b).
 *
 * Both are pure, controlled components: the parent owns open/visible state
 * and passes content in. They never call process.stdout — everything renders
 * inside ink's frame, so they compose with the harness and snapshot tests.
 */
import React, { useEffect } from 'react';
import { Box, Text } from 'ink';
import { openOverlay, closeOverlay } from '../input/overlayStack.js';

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
        borderColor="cyan"
        paddingX={1}
      >
        {title ? (
          <Text bold color="cyan"> {title}</Text>
        ) : null}
        {children}
      </Box>
    </Box>
  );
}

const TOAST_COLORS = { info: 'cyan', warn: 'yellow', error: 'red', ok: 'green' };

/** One-line transient notice, pinned above the footer area of a screen. */
export function Toast({ message, kind = 'info', visible = true }) {
  if (!visible || !message) return null;
  const color = TOAST_COLORS[kind] || 'cyan';
  return (
    <Box>
      <Text color={color} bold={kind === 'error'}>
        {' '}· {message} ·{' '}
      </Text>
    </Box>
  );
}
