/**
 * A tiny, deliberately restricted shell runner.
 *
 * Git challenges are only useful if the commands actually run, so this creates
 * a throwaway repository, executes an *allowlisted* subset of commands in it,
 * and exposes the resulting state (log, branches, status, file contents) for
 * assertions.
 *
 * Nothing outside the allowlist is executed - no arbitrary shell, no network,
 * no touching anything outside the temp directory.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const GIT_TIMEOUT = 8000;

/** Split a command line into argv, honouring single and double quotes. */
export function splitArgs(line) {
  const out = [];
  let buf = '';
  let quote = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else buf += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (buf) {
        out.push(buf);
        buf = '';
      }
      continue;
    }
    buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

/** Split a script into logical commands, dropping comments and blank lines. */
export function parseScript(script) {
  return String(script ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

const SAFE_BINARIES = new Set(['mkdir', 'touch', 'echo', 'printf', 'ls', 'cat', 'pwd', 'cd', 'rm']);

function git(dir, args) {
  const result = spawnSync('git', args, {
    cwd: dir,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', HOME: dir },
  });
  return {
    code: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

export function gitAvailable() {
  try {
    const r = spawnSync('git', ['--version'], { encoding: 'utf8', timeout: 4000 });
    return r.status === 0;
  } catch {
    return false;
  }
}

/**
 * Create a temp repository, seed it with `files`, then run `commands`.
 */
export function createRepo({ files = {}, commands = [] } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fullstack-git-'));
  const transcript = [];
  const skipped = [];
  const escapes = [];
  let cwd = dir;

  /**
   * Nothing is ever written outside the throwaway repository, but the attempt
   * is recorded so a challenge can still teach the `..` traversal lesson.
   */
  const insideSandbox = (abs, command) => {
    if (abs === dir || abs.startsWith(dir + path.sep)) return true;
    escapes.push({ command, path: abs });
    return false;
  };

  const writeFile = (target, content, append = false) => {
    const abs = path.resolve(cwd, target);
    if (!insideSandbox(abs, `write ${target}`)) return;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, append && fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') + content : content);
  };

  const state = {
    dir,
    transcript,
    skipped,
    /** Commands that tried to write outside the repository. */
    escapes: () => escapes.slice(),
    log: () => {
      const r = git(dir, ['log', '--pretty=format:%H|%s|%an']);
      if (r.code !== 0 || !r.stdout) return [];
      return r.stdout.split('\n').map((line) => {
        const [hash, subject, author] = line.split('|');
        return { hash, subject, author };
      });
    },
    branches: () => {
      const r = git(dir, ['branch', '--format=%(refname:short)']);
      const list = r.code === 0 && r.stdout ? r.stdout.split('\n').filter(Boolean) : [];
      const current = git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']);
      return { all: list, current: current.code === 0 ? current.stdout : null };
    },
    status: () => {
      const r = git(dir, ['status', '--porcelain']);
      const staged = [];
      const unstaged = [];
      const untracked = [];
      for (const line of (r.stdout || '').split('\n')) {
        if (!line.trim()) continue;
        const x = line[0];
        const y = line[1];
        const file = line.slice(3).trim();
        if (x === '?') untracked.push(file);
        else {
          if (x !== ' ') staged.push(file);
          if (y !== ' ') unstaged.push(file);
        }
      }
      return { staged, unstaged, untracked, raw: r.stdout };
    },
    remotes: () => {
      const r = git(dir, ['remote', '-v']);
      const set = new Set();
      for (const line of (r.stdout || '').split('\n')) {
        const name = line.split(/\s+/)[0];
        if (name) set.add(name);
      }
      return [...set];
    },
    lastCommitFiles: () => {
      const r = git(dir, ['show', '--name-only', '--pretty=format:']);
      return (r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
    },
    commitCount: () => {
      const r = git(dir, ['rev-list', '--count', 'HEAD']);
      return r.code === 0 ? Number(r.stdout) : 0;
    },
    exists: (rel) => fs.existsSync(path.resolve(dir, rel)),
    read: (rel) => {
      try {
        return fs.readFileSync(path.resolve(dir, rel), 'utf8');
      } catch {
        return null;
      }
    },
    list: () => {
      const out = [];
      const walk = (d, prefix = '') => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          if (entry.name === '.git' || entry.name.startsWith('.fullstack')) continue;
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) walk(path.join(d, entry.name), rel);
          else out.push(rel);
        }
      };
      try {
        walk(dir);
      } catch {
        /* nothing to list */
      }
      return out.sort();
    },
    run: (command) => {
      const args = splitArgs(command);
      if (args[0] === 'git') return git(dir, args.slice(1));
      return { code: 127, stdout: '', stderr: `only git is executable here (${args[0]})` };
    },
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* temp dir will be cleaned by the OS eventually */
      }
    },
  };

  if (!gitAvailable()) return { ...state, unavailable: true };

  // Initialise and give the repo an identity so commits are never rejected.
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.name', 'Learner']);
  git(dir, ['config', 'user.email', 'learner@example.com']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);

  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }

  for (const line of commands) {
    // Support `cd` so a learner can move around like they would in a shell.
    if (line.startsWith('cd ')) {
      const target = splitArgs(line)[1];
      const abs = path.resolve(cwd, target || '.');
      if (abs.startsWith(dir) && fs.existsSync(abs)) cwd = abs;
      transcript.push({ command: line, code: 0, stdout: '', stderr: '' });
      continue;
    }

    // `echo text > file` and `>> file`
    const redirect = line.match(/^(echo|printf)\s+(.*?)\s*(>>?)\s*(\S+)\s*$/);
    if (redirect) {
      const value = splitArgs(redirect[2]).join(' ');
      writeFile(redirect[4].replace(/^['"]|['"]$/g, ''), value + (redirect[1] === 'echo' ? '\n' : ''), redirect[3] === '>>');
      transcript.push({ command: line, code: 0, stdout: '', stderr: '' });
      continue;
    }

    const argv = splitArgs(line);
    const bin = argv[0];

    if (bin === 'git') {
      const result = git(cwd, argv.slice(1));
      transcript.push({ command: line, code: result.code, stdout: result.stdout, stderr: result.stderr });
      continue;
    }

    if (bin === 'mkdir') {
      // `mkdir -p a/b c/d` takes several paths; flags are ignored. The sandbox
      // is always recursive, so a missing parent is never an error here.
      for (const target of argv.slice(1).filter((a) => !a.startsWith('-'))) {
        const abs = path.resolve(cwd, target);
        if (!insideSandbox(abs, line)) continue;
        fs.mkdirSync(abs, { recursive: true });
      }
      transcript.push({ command: line, code: 0, stdout: '', stderr: '' });
      continue;
    }

    if (bin === 'touch') {
      for (const target of argv.slice(1)) {
        const abs = path.resolve(cwd, target);
        if (!insideSandbox(abs, line)) continue;
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        if (!fs.existsSync(abs)) fs.writeFileSync(abs, '');
      }
      transcript.push({ command: line, code: 0, stdout: '', stderr: '' });
      continue;
    }

    if (bin === 'ls' || bin === 'cat' || bin === 'pwd') {
      const target = argv[1] ? path.resolve(cwd, argv[1]) : cwd;
      let stdout = '';
      try {
        if (bin === 'ls') stdout = fs.readdirSync(target).join('\n');
        else if (bin === 'cat') stdout = fs.readFileSync(target, 'utf8');
        else stdout = cwd;
      } catch (err) {
        transcript.push({ command: line, code: 1, stdout: '', stderr: err.message });
        continue;
      }
      transcript.push({ command: line, code: 0, stdout, stderr: '' });
      continue;
    }

    if (bin === 'rm') {
      const target = argv[argv.length - 1];
      const abs = path.resolve(cwd, target);
      if (insideSandbox(abs, line)) fs.rmSync(abs, { recursive: true, force: true });
      transcript.push({ command: line, code: 0, stdout: '', stderr: '' });
      continue;
    }

    if (SAFE_BINARIES.has(bin)) {
      transcript.push({ command: line, code: 0, stdout: '', stderr: '' });
      continue;
    }

    skipped.push(line);
  }

  state.unavailable = false;
  return state;
}
