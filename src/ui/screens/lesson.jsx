/**
 * Lesson screen (next-UI port, Phase 1).
 *
 * Content parity with `src/views/lesson.js`: header, objectives, sections with
 * prose + code, common mistakes, cheat sheet, the practice list, further
 * reading and the next-lesson line. `lessonLines()` is pure and returns the
 * rendered rows plus the row index of each challenge, so the route can scroll
 * to the focused challenge without measuring anything.
 *
 * Prose is the markdown-ish subset the curriculum uses (paragraphs, `code`,
 * **bold**, `-`/`*` bullets, `>` quotes, `#` headings, ``` fences), rendered as
 * text: the themed styling pass (spec §7.3) comes with the theme work.
 */
import React from 'react';
import { Box, Text } from 'ink';
import { clampScroll, wrapText } from './screenModel.js';
import { useTheme, useIcons } from '../theme/context.jsx';
import { midnight } from '../theme/themes.js';
import { ICON_SETS } from '../theme/icons.js';

/** Markdown-ish prose → wrapped display lines (indent applied per line). */
export function proseLines(text, width, indent = '  ', icons = ICON_SETS.unicode) {
  const out = [];
  const paragraphs = String(text || '').split(/\n\s*\n/);
  for (const raw of paragraphs) {
    const block = raw.trim();
    if (!block) continue;
    const lines = block.split('\n');
    if (lines[0].startsWith('```')) {
      // Fenced code: preserve the lines exactly, no rewrapping.
      const body = lines.slice(1).filter((l) => !l.startsWith('```'));
      for (const l of body) out.push({ kind: 'code', text: `${indent}  ${l}`.replace(/\s+$/, '') });
      continue;
    }
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const plain = trimmed.replace(/\*\*/g, '').replace(/`/g, '');
      const heading = /^#{1,4}\s+/.test(plain);
      const bullet = /^[-*]\s+/.test(plain);
      const quote = /^>\s?/.test(plain);
      const bodyText = plain.replace(/^#{1,4}\s+/, '').replace(/^[-*]\s+/, '').replace(/^>\s?/, '');
      const prefix = heading ? '' : bullet ? `${icons.bullet} ` : quote ? `${icons.rail} ` : '';
      const wrapped = wrapText(`${prefix}${bodyText}`, Math.max(12, width), indent);
      for (const w of wrapped) {
        out.push({ kind: heading ? 'heading' : quote ? 'quote' : bullet ? 'bullet' : 'prose', text: w });
      }
    }
  }
  return out;
}

const toneFor = (theme) => ({
  heading: theme.accent,
  quote: theme.muted,
  bullet: undefined,
  prose: undefined,
  code: theme.good,
});

/**
 * Flatten a lesson into renderable rows + the row index of each challenge.
 *
 * Pure and theme-parameterised (a `useTheme()` read here would make the helper
 * a hook); the default keeps direct callers — tests — rendering as before.
 */
export function lessonLines({ mod, lesson, store, focus = 0, width = 80, theme = midnight, icons = ICON_SETS.unicode }) {
  const TONE = toneFor(theme);
  const lines = [];
  const challengeRows = [];
  const push = (el) => lines.push(el);
  if (!mod || !lesson) return { lines, challengeRows };

  const read = store && store.isLessonRead ? store.isLessonRead(lesson.id) : false;
  push(
    <Text>
      {'  '}
      <Text backgroundColor={theme.accent} color={theme.bg} bold> {mod.badge} </Text>
      <Text color={theme.muted}>  {mod.title}</Text>
      <Text color={theme.muted}>  /  </Text>
      <Text>{lesson.title}</Text>
    </Text>,
  );
  push(
    <Text>
      {'  '}
      <Text color={theme.muted}>~{lesson.minutes} minutes</Text>
      {read
        ? <Text color={theme.good}>   {icons.check} marked read</Text>
        : <Text color={theme.muted}>   press m when you have finished reading</Text>}
    </Text>,
  );
  push(<Text> </Text>);

  if (lesson.objectives && lesson.objectives.length) {
    push(<Text><Text color={theme.accent} bold> What you will be able to do</Text></Text>);
    for (const o of lesson.objectives) push(<Text><Text color={theme.accent}>    {icons.arrowRight} </Text>{o}</Text>);
    push(<Text> </Text>);
  }

  const sections = lesson.sections || [];
  sections.forEach((section, i) => {
    push(
      <Text>
        <Text color={theme.accent} bold> {section.heading} </Text>
        {i === sections.length - 1 ? <Text color={theme.muted}> worked example</Text> : null}
      </Text>,
    );
    for (const line of proseLines(section.body, width - 4, '  ', icons)) {
      push(<Text color={TONE[line.kind]}>{line.text}</Text>);
    }
    push(<Text> </Text>);
    if (section.code && section.code.source) {
      if (section.code.caption) push(<Text color={theme.muted}>  {section.code.caption}</Text>);
      for (const l of String(section.code.source).split('\n')) {
        push(<Text color={theme.good}>{`    ${l}`.replace(/\s+$/, '')}</Text>);
      }
      push(<Text> </Text>);
    }
  });

  if (lesson.pitfalls && lesson.pitfalls.length) {
    push(
      <Text>
        <Text color={theme.accent} bold> Common mistakes </Text>
        <Text color={theme.muted}> every one of these has cost someone an afternoon</Text>
      </Text>,
    );
    for (const p of lesson.pitfalls) {
      for (const line of proseLines(p, width - 6, '    ', icons)) {
        push(<Text color={theme.bad}>    {icons.cross} {line.text.trim()}</Text>);
      }
    }
    push(<Text> </Text>);
  }

  if (lesson.keyPoints && lesson.keyPoints.length) {
    push(<Text><Text color={theme.accent} bold> Cheat sheet</Text></Text>);
    for (const k of lesson.keyPoints) {
      for (const line of proseLines(k, width - 6, '    ', icons)) {
        push(<Text color={theme.secondary}>    {icons.bullet} {line.text.trim()}</Text>);
      }
    }
    push(<Text> </Text>);
  }

  const challenges = lesson.challenges || [];
  const passed = challenges.filter((c) => store && store.isPassed(`${lesson.id}.${c.id}`)).length;
  push(
    <Text>
      <Text color={theme.accent} bold> Practice </Text>
      <Text color={theme.muted}> Tab then Enter, or just press Enter</Text>
    </Text>,
  );
  push(
    <Text>
      {'  '}
      <Text color={theme.accent}>{icons.meterFull.repeat(Math.round((challenges.length ? passed / challenges.length : 0) * 10))}</Text>
      <Text color={theme.muted}>{icons.meterEmpty.repeat(10 - Math.round((challenges.length ? passed / challenges.length : 0) * 10))}</Text>
      <Text color={theme.muted}>   {passed}/{challenges.length} solved here</Text>
    </Text>,
  );
  push(<Text> </Text>);

  challenges.forEach((ch, i) => {
    const id = `${lesson.id}.${ch.id}`;
    const solved = store && store.isPassed ? store.isPassed(id) : false;
    const active = i === focus;
    challengeRows.push(lines.length);
    push(
      <Text color={active ? theme.text : theme.muted} bold={active}>
        {active ? ` ${icons.select} ` : '   '}
        <Text color={solved ? theme.good : theme.muted} bold>{solved ? `${icons.check} ` : `${icons.bullet} `}</Text>
        <Text color={ch.kind === 'debug' ? theme.warn : theme.accent} bold>{ch.kind === 'debug' ? 'DEBUG ' : 'WRITE '}</Text>
        <Text>{String(ch.id).padEnd(22).slice(0, 22)}</Text>
        <Text color={theme.muted}>{String(ch.difficulty || '').padEnd(8)}</Text>
        <Text color={theme.muted}>{ch.minutes ? `${ch.minutes}m` : ''}</Text>
        <Text color={theme.muted}>{solved ? '   solved' : '   not solved yet'}</Text>
      </Text>,
    );
    const firstLine = String(ch.prompt || '').split('\n')[0].replace(/\*\*/g, '');
    for (const line of proseLines(firstLine, width - 8, '       ', icons)) {
      push(<Text color={theme.muted}>{line.text}</Text>);
    }
    push(<Text> </Text>);
  });

  if (lesson.resources && lesson.resources.length) {
    push(<Text><Text color={theme.accent} bold> Go deeper</Text></Text>);
    for (const r of lesson.resources) {
      push(
        <Text>
          {'    '}
          {r.label}
          <Text color={theme.muted}>   {r.url}</Text>
        </Text>,
      );
    }
    push(<Text> </Text>);
  }
  return { lines, challengeRows };
}

export function LessonScreen({ lines = [], height = 24, scroll = 0 }) {
  // Key handling lives in LessonRoute (it owns focus + scroll); this is a
  // windowing presenter, which keeps the row math in exactly one place.
  const theme = useTheme();
  const icons = useIcons();
  const view = Math.max(1, height - 2);
  const offset = clampScroll(scroll, lines.length, view);
  const shown = lines.slice(offset, offset + view);
  return (
    <Box flexDirection="column">
      <Text>
        {'  '}
        <Text color={theme.muted}>{lines.length ? offset + 1 : 0}-{Math.min(lines.length, offset + view)} of {lines.length}</Text>
        <Text color={theme.muted}>  j/k scroll {icons.bullet} Tab focus {icons.bullet} Enter open {icons.bullet} m read {icons.bullet} n next</Text>
      </Text>
      {shown.map((el, i) => <React.Fragment key={offset + i}>{el}</React.Fragment>)}
    </Box>
  );
}
