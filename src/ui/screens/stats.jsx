/**
 * Progress/stats screen (next-UI port, Phase 1).
 *
 * Totals + streak chips, the 28-day activity sparkline, a per-module meter
 * table, and the recently-solved list with wrong-turn counts — the same
 * numbers `src/views/stats.js` draws, derived from the same store API.
 *
 * Every input is a prop so the screen is pure: tests pass a fake store.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { clampScroll } from './screenModel.js';
import { useKeymap } from '../useKeymap.js';
import { useTheme, useIcons } from '../theme/context.jsx';
import { midnight } from '../theme/themes.js';
import { ICON_SETS } from '../theme/icons.js';

const BLOCKS = '▁▂▃▄▅▆▇█';
export const SPARK_WIDTH = 28;

/** Map daily counts to glyphs (empty series → a flat baseline). */
export function sparkline(values = [], width = SPARK_WIDTH, blocks = BLOCKS) {
  const data = values.slice(-width);
  if (!data.length) return blocks[0].repeat(Math.min(width, 12));
  const max = Math.max(1, ...data.map((v) => Number(v) || 0));
  return data
    .map((v) => blocks[Math.min(blocks.length - 1, Math.round(((Number(v) || 0) / max) * (blocks.length - 1)))])
    .join('');
}

/**
 * Flatten the progress page into renderable rows (unkeyed). Theme is a
 * parameter so the helper stays pure and directly callable from tests.
 */
export function statsLines({ stats = {}, overall = {}, store, curriculum = [], theme = midnight, icons = ICON_SETS.unicode } = {}) {
  const lines = [];
  const push = (el) => lines.push(el);
  const totals = stats.totals || {};
  const streak = stats.streak || totals.streak || { current: 0, best: 0 };
  const passed = totals.challengesPassed || 0;
  const total = totals.challenges || 0;
  const pct = total ? Math.round((passed / total) * 100) : 0;

  push(
    <Text>
      <Text color={theme.accent} bold> Progress </Text>
      <Text color={theme.muted}> everything is stored in .data/progress.json</Text>
    </Text>,
  );
  push(
    <Text>
      {'  '}
      <Text color={theme.accent}>{icons.meterFull.repeat(Math.round(pct / 5))}</Text>
      <Text color={theme.muted}>{icons.meterEmpty.repeat(Math.max(0, 20 - Math.round(pct / 5)))}</Text>
      <Text color={theme.muted}>   {passed}/{total} challenges</Text>
      <Text color={pct === 100 ? theme.good : theme.accent} bold>  {pct}%</Text>
    </Text>,
  );
  push(<Text> </Text>);
  push(
    <Text>
      {'  '}
      <Text color={streak.current ? theme.good : theme.muted} bold>{String(streak.current)}</Text>
      <Text color={theme.muted}> day streak   </Text>
      <Text bold>{String(streak.best)}</Text>
      <Text color={theme.muted}> best   </Text>
      <Text color={theme.accent}>{String(store && store.todayMinutes ? store.todayMinutes() : 0)}m</Text>
      <Text color={theme.muted}> today   </Text>
      <Text>{String(store && store.weekMinutes ? store.weekMinutes() : 0)}m</Text>
      <Text color={theme.muted}> week   </Text>
      <Text color={theme.secondary}>{`${totals.debugPassed || 0}/${totals.debug || 0}`}</Text>
      <Text color={theme.muted}> debug   </Text>
      <Text color={theme.warn}>{String(totals.writePassed || 0)}</Text>
      <Text color={theme.muted}> write</Text>
    </Text>,
  );
  push(<Text color={theme.accent}>  {sparkline(store && store.activity ? store.activity(SPARK_WIDTH) : [], SPARK_WIDTH, icons.spark)}</Text>);
  push(<Text> </Text>);

  push(<Text><Text color={theme.accent} bold> By module</Text></Text>);
  const perModule = stats.perModule || [];
  for (const mod of curriculum) {
    const s = perModule.find((m) => m.id === mod.id)
      || { lessonsRead: 0, lessons: (mod.lessons || []).length, challengesPassed: 0, challenges: 1, percent: 0 };
    const filled = Math.round((s.percent || 0) / 10);
    push(
      <Text>
        {'  '}
        <Text color={theme.accent} bold>{String(mod.badge || '').padEnd(4)}</Text>
        <Text>{String(mod.title || '').padEnd(16)}</Text>
        <Text color={theme.accent}>{icons.meterFull.repeat(filled)}</Text>
        <Text color={theme.muted}>{icons.meterEmpty.repeat(Math.max(0, 10 - filled))}</Text>
        <Text color={theme.muted}>  {String(s.challengesPassed).padStart(2)}/{String(s.challenges).padEnd(2)} solved</Text>
        <Text color={theme.muted}>   {s.lessonsRead}/{s.lessons} read</Text>
        <Text color={s.percent === 100 ? theme.good : theme.muted}>   {s.percent || 0}%</Text>
      </Text>,
    );
  }

  // Recently solved, newest first.
  const records = (store && store.data && store.data.challenges) || {};
  const solved = [];
  for (const mod of curriculum) {
    for (const lesson of mod.lessons || []) {
      for (const ch of lesson.challenges || []) {
        const rec = records[`${lesson.id}.${ch.id}`];
        if (rec && rec.passed) {
          solved.push({ lesson, ch, at: rec.solvedAt, attempts: rec.attempts || 0, hints: rec.hintsUsed || 0 });
        }
      }
    }
  }
  solved.sort((a, b) => String(b.at).localeCompare(String(a.at)));

  push(<Text> </Text>);
  push(
    <Text>
      <Text color={theme.accent} bold> Recently solved </Text>
      <Text color={theme.muted}> {solved.length} of {total}</Text>
    </Text>,
  );
  if (!solved.length) {
    push(<Text color={theme.muted}>  Nothing yet. Open a module and fix your first bug - Ctrl+S checks your work.</Text>);
  }
  for (const s of solved) {
    push(
      <Text>
        {'  '}
        <Text color={s.ch.kind === 'debug' ? theme.warn : theme.accent} bold>{s.ch.kind === 'debug' ? 'bug ' : 'code'}</Text>
        <Text>  {s.lesson.title}</Text>
        <Text color={theme.muted}>  &gt; {s.ch.id}</Text>
        <Text color={theme.muted}>   wrong turns: {Math.max(0, s.attempts - 1)}</Text>
        {s.hints ? <Text color={theme.muted}>  hints: {s.hints}</Text> : null}
        <Text color={theme.muted}>   {s.at ? String(s.at).slice(0, 10) : ''}</Text>
      </Text>,
    );
  }
  push(<Text> </Text>);
  push(
    <Text>
      <Text color={theme.muted}>  Wrong turns are the useful number. </Text>
      <Text color={theme.muted}>A challenge you solved on the fifth attempt taught you more than one you solved first try.</Text>
    </Text>,
  );
  return lines;
}

export function StatsScreen({ stats, overall, store, curriculum, cursor = 0, height = 24, onCommand }) {
  const theme = useTheme();
  const ic = useIcons();
  useKeymap('stats', (id) => onCommand?.(id));

  const lines = statsLines({ stats, overall, store, curriculum, theme, icons: ic });
  const view = Math.max(1, height - 3);
  const offset = clampScroll(cursor, lines.length, view);
  const shown = lines.slice(offset, offset + view);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={theme.accent} bold> Progress </Text>
        <Text color={theme.muted}> j/k scroll {ic.bullet} PgUp/PgDn page {ic.bullet} Esc back</Text>
      </Text>
      {shown.map((el, i) => <React.Fragment key={offset + i}>{el}</React.Fragment>)}
      <Text color={theme.muted}> {lines.length ? offset + 1 : 0}-{Math.min(lines.length, offset + view)} of {lines.length} </Text>
    </Box>
  );
}
