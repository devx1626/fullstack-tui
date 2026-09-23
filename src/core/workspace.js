/**
 * The workspace: where learner code actually lands on disk.
 *
 * Every solved challenge is written to `.workspace/<module>/<lesson>/` so the
 * curriculum produces a real folder of work you can open in a browser or push
 * to GitHub - not just ephemeral scores inside the TUI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT } from './store.js';

export const WORKSPACE = path.join(ROOT, '.workspace');

export function artifactPath(relPath) {
  return path.join(WORKSPACE, relPath);
}

export function saveArtifact(relPath, content) {
  const abs = artifactPath(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return abs;
}

export function readArtifact(relPath) {
  try {
    return fs.readFileSync(artifactPath(relPath), 'utf8');
  } catch {
    return null;
  }
}

export function listWorkspace() {
  const out = [];
  const walkDir = (dir, prefix = '') => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walkDir(path.join(dir, e.name), rel);
      else out.push(rel);
    }
  };
  walkDir(WORKSPACE);
  return out.sort();
}

function openCommand(target) {
  if (process.platform === 'darwin') return { cmd: 'open', args: [target] };
  if (process.platform === 'win32') return { cmd: 'cmd', args: ['/c', 'start', '', target] };
  return { cmd: 'xdg-open', args: [target] };
}

/**
 * Best-effort "open this file in the user's default app".
 *
 * FULLSTACK_NO_OPEN=1 forces the off path (returns false without spawning):
 * headless environments — CI, test runners, ssh without X — have no desktop
 * opener, and spawning one at best warns and at worst hangs the session. The
 * caller's own fallback ("Preview written to …") is the useful answer there.
 */
export function openExternally(target) {
  if (process.env.FULLSTACK_NO_OPEN) return false;
  try {
    const { cmd, args } = openCommand(target);
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Wrap learner markup in a presentable document. If they wrote a full page
 * already we keep it, otherwise we scaffold one so the browser shows it nicely.
 */
export function previewDocument({ html = '', css = '', js = '', title = 'Preview' } = {}) {
  const isFullPage = /<html[\s>]/i.test(html);
  const base = `    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 1.5rem; line-height: 1.6; color: #1b1b1f; background: #fbfbfd; }
    img { max-width: 100%; height: auto; }
    .tui-preview-banner { font: 600 12px/1.4 ui-monospace, monospace; letter-spacing: .04em; text-transform: uppercase;
      color: #556; background: #eef; border-left: 4px solid #66c; padding: .5rem .75rem; margin: -.5rem -.5rem 1.25rem; }`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
${base}
${css}
  </style>
</head>
<body>
  <p class="tui-preview-banner">fullstack-tui preview</p>
${html}
  <script>
${js}
  </script>
</body>
</html>
`;
}

/** Write a previewable document for a challenge and return its path. */
export function writePreview(relPath, parts) {
  return saveArtifact(relPath, previewDocument(parts));
}
