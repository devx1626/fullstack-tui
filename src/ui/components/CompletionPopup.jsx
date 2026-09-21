/**
 * Completion popup (overhaul §8.9, task 2.7) — the Ink view for the pure
 * popup state machine in `src/editor/completions.js`.
 *
 * Presentational by contract: the ROUTE owns the popup state
 * (`createPopup` / `popupKey` / `acceptItem`) and passes the current popup
 * down. The component only draws it, which is what keeps the visual selection
 * and the accepted item from ever disagreeing — `popup.selected` is the single
 * source of truth for both the highlighted row and what Enter accepts.
 *
 * Kinds come from the classic engine plus the additive data (`snip`, `tag`,
 * `attr`, `value`, `word`, `fn`, `kw`, `prop`); unmapped kinds fall back to a
 * neutral dot so an engine change can never blank the label.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { popupItem } from '../../editor/completions.js';
import { useTheme, useIcons } from '../theme/context.jsx';

const KIND_GLYPH = {
  tag: '<>',
  attr: '=',
  prop: ':',
  value: '#',
  sel: '::',
  at: '@',
  snip: '▸',
  kw: 'K',
  fn: 'ƒ',
  cmd: '$',
  word: 'w',
};

/**
 * @param {object|null} props.popup      `createPopup(list)` result
 * @param {number} [props.width=46]      popup width in columns
 * @param {number} [props.max=8]         rows shown (the list is longer)
 * @param {object|null} [props.signature] `signatureAt(doc)` result, if any
 */
export function CompletionPopup({ popup, width = 46, max = 8, signature = null }) {
  const theme = useTheme();
  const ic = useIcons();
  if (!popup || !popup.items || !popup.items.length) return null;
  const shown = popup.items.slice(0, max);
  const focused = popupItem(popup);
  const detail = (focused && (focused.detail || focused.doc)) || '';
  return (
    <Box
      flexDirection="column"
      width={width}
      borderStyle={ic.borderStyle}
      borderColor={theme.accent}
      paddingX={1}
    >
      {shown.map((item, i) => {
        const active = i === popup.selected;
        return (
          <Text
            key={`${item.label}.${i}`}
            inverse={active}
            color={active ? theme.accent : theme.muted}
          >
            {active ? ic.arrowRight : ' '} {item.kind === 'snip' ? ic.select : (KIND_GLYPH[item.kind] || ic.bullet)} {item.label}
            {item.detail ? `  ${item.detail}` : ''}
          </Text>
        );
      })}
      {detail ? <Text color={theme.muted}> {detail}</Text> : null}
      {signature ? (
        <Text color={theme.accent}>
          {' '}{signature.sig}
          {signature.params && signature.params.length
            ? `   [${signature.activeParam + 1}/${signature.params.length}]`
            : ''}
        </Text>
      ) : null}
      <Text color={theme.muted}> {ic.arrowUp}{ic.arrowDown} select {ic.bullet} Tab accept {ic.bullet} Esc dismiss</Text>
    </Box>
  );
}
