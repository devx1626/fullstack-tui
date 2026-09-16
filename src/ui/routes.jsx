/**
 * Route components (Phase 1 wiring) — the thin layer between the router, the
 * command host, and the ported screens.
 *
 * Division of labour:
 *   screens (screens/*.jsx)  render a view-model; they own no behavior
 *   routes  (this file)      cursor + what "open" means + running actions
 *   host    (host.jsx)       cross-screen commands, navigation, notices
 *
 * Each route also resolves its own data from services (the router only passes
 * ids), so `SCREENS` in main.jsx stays a plain name → component map.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { Text } from 'ink';
import { useHost } from './host.jsx';
import { useServices } from './services.jsx';
import { nextIndex } from './nav.js';
import { findChallenge, firstUnpassedIn } from '../core/targets.js';
import { HomeScreen } from './screens/home.jsx';
import { ModuleScreen } from './screens/module.jsx';
import { ChallengeScreen } from './screens/challenge.jsx';

/** Solution → displayable text (string challenges or a files map). */
function solutionText(challenge) {
  const sol = challenge && challenge.solution;
  if (!sol) return '';
  if (typeof sol === 'string') return sol;
  return Object.entries(sol).map(([name, text]) => `── ${name} ──\n${text}`).join('\n\n');
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export function HomeRoute() {
  const host = useHost();
  const services = useServices();
  const modules = (services && services.curriculum) || [];
  const count = modules.length;
  const { cursor, setCursor } = host;

  const onCommand = useCallback((id) => {
    const next = nextIndex(cursor, id, count);
    if (next !== null) {
      setCursor(next);
      return;
    }
    switch (id) {
      case 'home.openModule': {
        const mod = modules[cursor];
        if (mod) host.go('module', { moduleId: mod.id });
        return;
      }
      case 'home.dismissBanner':
        if (services && services.settings) services.settings.dismissBanner();
        host.say('Banner dismissed for today.', 'ok');
        return;
      default:
        host.run(id);
    }
  }, [count, cursor, host, modules, services, setCursor]);

  return <HomeScreen cursor={cursor} height={host.height} onCommand={onCommand} />;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

export function ModuleRoute({ moduleId }) {
  const host = useHost();
  const services = useServices();
  const modules = (services && services.curriculum) || [];
  const mod = modules.find((m) => m.id === moduleId) || modules[0];
  const rows = mod ? mod.lessons.length + (mod.project ? 1 : 0) : 0;
  const { cursor, setCursor } = host;

  const onCommand = useCallback((id) => {
    const next = nextIndex(cursor, id, rows);
    if (next !== null) {
      setCursor(next);
      return;
    }
    switch (id) {
      case 'module.openLesson': {
        if (!mod) return;
        const lesson = mod.lessons[cursor];
        if (!lesson) {
          // The project row follows the lessons (classic convention).
          host.run('module.openProject');
          return;
        }
        const index = firstUnpassedIn(lesson, (chId) => services.store.isPassed(chId));
        host.go('challenge', { moduleId: mod.id, lessonId: lesson.id, challengeId: lesson.challenges[index].id });
        return;
      }
      default:
        host.run(id);
    }
  }, [cursor, host, mod, rows, services, setCursor]);

  return (
    <ModuleScreen
      moduleId={mod ? mod.id : moduleId}
      cursor={cursor}
      height={host.height}
      onCommand={onCommand}
    />
  );
}

// ---------------------------------------------------------------------------
// Challenge
// ---------------------------------------------------------------------------

export function ChallengeRoute({ moduleId, lessonId, challengeId }) {
  const host = useHost();
  const services = useServices();
  const [showSolution, setShowSolution] = useState(false);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);

  const target = useMemo(() => {
    if (!services) return null;
    return findChallenge(
      services.curriculum,
      { moduleId, lessonId, challengeId },
      (id) => services.store.isPassed(id),
    );
  }, [challengeId, lessonId, moduleId, services]);

  const challengeKey = target ? `${target.lessonId}.${target.challengeId}` : null;
  const record = target ? services.store.challengeRecord(challengeKey) : null;
  const saved = record && typeof record.lastCode === 'string' ? record.lastCode : null;
  const starter = target ? (target.challenge.starter ?? '') : '';
  const code = showSolution ? solutionText(target.challenge) : (saved ?? starter);

  const onCommand = useCallback(async (id) => {
    if (nextIndex(0, id, 0) !== null) return; // no list on this screen
    if (!target) return;
    switch (id) {
      case 'challenge.check': {
        if (busy) return;
        if (target.challenge.files) {
          setStatus('Multi-file challenges are graded in the classic UI for now.');
          return;
        }
        setBusy(true);
        setStatus('running your code…');
        try {
          const { evaluate } = await import('../core/grade.js');
          const result = await evaluate(target.challenge, code);
          const passed = result.results.filter((r) => r.ok).length;
          const total = result.results.length;
          setStatus(result.passed
            ? `${total}/${total} checks passed — solved. Saved to your workspace.`
            : `${passed}/${total} checks passed — read the failing messages in the classic UI for now.`);
          if (result.passed) services.store.recordAttempt(challengeKey, code, true);
        } catch (err) {
          setStatus(`check threw: ${err && err.message ? err.message : err}`);
        } finally {
          setBusy(false);
        }
        return;
      }
      case 'challenge.hint': {
        const hints = target.challenge.hints || [];
        if (!hints.length) {
          setStatus('No hints for this challenge.');
          return;
        }
        const i = Math.min(hintIndex, hints.length - 1);
        setHintIndex(i + 1);
        // Revealing a hint is progress the store must keep (classic parity).
        services.store.useHint(challengeKey);
        setStatus(`Hint ${i + 1}/${hints.length}: ${hints[i]}`);
        return;
      }
      case 'challenge.solution':
        setShowSolution((v) => !v);
        setStatus(showSolution
          ? 'Solution hidden.'
          : `Solution for ${target.challenge.title} — Ctrl+G again to hide.`);
        return;
      case 'challenge.reset':
        setShowSolution(false);
        setStatus('Reset needs the Phase 2 editor (the classic UI resets drafts today).');
        return;
      default:
        host.run(id);
    }
  }, [busy, challengeKey, code, hintIndex, host, services, showSolution, target]);

  if (!target) return <Text color="red">unknown challenge: {challengeId || lessonId || moduleId}</Text>;

  return (
    <ChallengeScreen
      title={target.challenge.title}
      brief={target.challenge.prompt || ''}
      code={code}
      width={host.width}
      status={status}
      busy={busy}
      onCommand={onCommand}
    />
  );
}
