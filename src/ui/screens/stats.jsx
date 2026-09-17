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

const BLOCKS = '▁▂▃▄▅▆▇█';
export const SPARK_WIDTH = 28;

/** Map daily counts to block glyphs (empty series → a flat baseline). */
export function sparkline(values = [], width = SPARK_WIDTH) {
  const data = values.slice(-width);
  if (!data.length) return '▁'.repeat(Math.min(width, 12));
  const max = Math.max(1, ...data.map((v) => Number(v) || 0));
  return data
    .map((v) => BLOCKS[Math.min(BLOCKS.length - 1, Math.round(((Number(v) || 0) / max) * (BLOCKS.length - 1)))])
    .join('');
}

/** Flatten the progress page into renderable rows (unkeyed). */
export function statsLines({ stats = {}, overall = {}, store, curriculum = [] } = {}) {
  const lines = [];
  const push = (el) => lines.push(el);
  const totals = stats.totals || {};
  const streak = stats.streak || totals.streak || { current: 0, best: 0 };
  const passed = totals.challengesPassed || 0;
  const total = totals.challenges || 0;
  const pct = total ? Math.round((passed / total) * 100) : 0;

  push(
    <Text>
      <Text color="cyan" bold> Progress </Text>
      <Text color="gray"> everything is stored in .data/progress.json</Text>
    </Text>,
  );
  push(
    <Text>
      {'  '}
      <Text color="cyan">{'█'.repeat(Math.round(pct / 5))}</Text>
      <Text color="gray">{'░'.repeat(Math.max(0, 20 - Math.round(pct / 5)))}</Text>
      <Text color="gray">   {passed}/{total} challenges</Text>
      <Text color={pct === 100 ? 'green' : 'cyan'} bold>  {pct}%</Text>
    </Text>,
  );
  push(<Text> </Text>);
  push(
    <Text>
      {'  '}
      <Text color={streak.current ? 'green' : 'gray'} bold>{String(streak.current)}</Text>
      <Text color="gray"> day streak   </Text>
      <Text bold>{String(streak.best)}</Text>
      <Text color="gray"> best   </Text>
      <Text color="cyan">{String(store && store.todayMinutes ? store.todayMinutes() : 0)}m</Text>
      <Text color="gray"> today   </Text>
      <Text>{String(store && store.weekMinutes ? store.weekMinutes() : 0)}m</Text>
      <Text color="gray"> week   </Text>
      <Text color="magenta">{`${totals.debugPassed || 0}/${totals.debug || 0}`}</Text>
      <Text color="gray"> debug   </Text>
      <Text color="yellow">{String(totals.writePassed || 0)}</Text>
      <Text color="gray"> write</Text>
    </Text>,
  );
  push(<Text color="cyan">  {sparkline(store && store.activity ? store.activity(SPARK_WIDTH) : [])}</Text>);
  push(<Text> </Text>);

  push(<Text><Text color="cyan" bold> By module</Text></Text>);
  const perModule = stats.perModule || [];
  for (const mod of curriculum) {
    const s = perModule.find((m) => m.id === mod.id)
      || { lessonsRead: 0, lessons: (mod.lessons || []).length, challengesPassed: 0, challenges: 1, percent: 0 };
    const filled = Math.round((s.percent || 0) / 10);
    push(
      <Text>
        {'  '}
        <Text color="cyan" bold>{String(mod.badge || '').padEnd(4)}</Text>
        <Text>{String(mod.title || '').padEnd(16)}</Text>
        <Text color="cyan">{'█'.repeat(filled)}</Text>
        <Text color="gray">{'░'.repeat(Math.max(0, 10 - filled))}</Text>
        <Text color="gray">  {String(s.challengesPassed).padStart(2)}/{String(s.challenges).padEnd(2)} solved</Text>
        <Text color="gray">   {s.lessonsRead}/{s.lessons} read</Text>
        <Text color={s.percent === 100 ? 'green' : 'gray'}>   {s.percent || 0}%</Text>
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
      <Text color="cyan" bold> Recently solved </Text>
      <Text color="gray"> {solved.length} of {total}</Text>
    </Text>,
  );
  if (!solved.length) {
    push(<Text color="gray">  Nothing yet. Open a module and fix your first bug - Ctrl+S checks your work.</Text>);
  }
  for (const s of solved) {
    push(
      <Text>
        {'  '}
        <Text color={s.ch.kind === 'debug' ? 'yellow' : 'cyan'} bold>{s.ch.kind === 'debug' ? 'bug ' : 'code'}</Text>
        <Text>  {s.lesson.title}</Text>
        <Text color="gray">  &gt; {s.ch.id}</Text>
        <Text color="gray">   wrong turns: {Math.max(0, s.attempts - 1)}</Text>
        {s.hints ? <Text color="gray">  hints: {s.hints}</Text> : null}
        <Text color="gray">   {s.at ? String(s.at).slice(0, 10) : ''}</Text>
      </Text>,
    );
  }
  push(<Text> </Text>);
  push(
    <Text>
      <Text color="gray">  Wrong turns are the useful number. </Text>
      <Text color="gray">A challenge you solved on the fifth attempt taught you more than one you solved first try.</Text>
    </Text>,
  );
  return lines;
}

export function StatsScreen({ stats, overall, store, curriculum, cursor = 0, height = 24, onCommand }) {
  useKeymap('stats', (id) => onCommand?.(id));

  const lines = statsLines({ stats, overall, store, curriculum });
  const view = Math.max(1, height - 3);
  const offset = clampScroll(cursor, lines.length, view);
  const shown = lines.slice(offset, offset + view);

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="cyan" bold> Progress </Text>
        <Text color="gray"> j/k scroll · PgUp/PgDn page · Esc back</Text>
      </Text>
      {shown.map((el, i) => <React.Fragment key={offset + i}>{el}</React.Fragment>)}
      <Text color="gray"> {lines.length ? offset + 1 : 0}-{Math.min(lines.length, offset + view)} of {lines.length} </Text>
    </Box>
  );
}
