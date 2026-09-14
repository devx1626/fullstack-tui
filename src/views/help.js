import { seg, fit } from '../tui/canvas.js';
import { box, clampRows, sectionLabel, prose } from '../tui/widgets.js';

const GLOBAL = [
  ['j / k', 'move down / up'],
  ['Enter', 'open the highlighted item'],
  ['Esc', 'go back one screen'],
  ['Ctrl+P', 'command palette (jump to any lesson or challenge)'],
  ['?', 'this help screen'],
  ['Ctrl+C', 'quit (progress is saved)'],
  ['Ctrl+L', 'force a full redraw if the terminal glitches'],
];

const CHALLENGE = [
  ['Ctrl+S', 'check your code against every requirement'],
  ['Ctrl+R', 'reset the editor back to the starting code'],
  ['Ctrl+H', 'reveal the next hint'],
  ['Ctrl+G', 'show / hide the worked solution'],
  ['Ctrl+B', 'open the built-in browser and dev tools'],
  ['Ctrl+P', 'write a preview file and open it in your browser'],
  ['Ctrl+O', 'save the current code to your workspace'],
  ['Ctrl+E', 'open this file in $EDITOR (vim, nano, VS Code...)'],
  ['Ctrl+T', 'toggle the console output panel'],
  ['Tab', 'switch panes on a narrow terminal'],
];

// The editor behaves like the one in a code editor, not like a text field.
const EDITOR = [
  ['<', 'in HTML/CSS/JS: a live suggestion list appears'],
  ['Ctrl+Space', 'ask for suggestions anywhere'],
  ['Tab / Enter', 'accept the highlighted suggestion'],
  ['Up / Down', 'walk the suggestion list'],
  ['Esc', 'dismiss the list'],
  ['( [ {', 'close themselves, and so do quotes'],
  ['>', 'in HTML, closes the tag you just opened'],
  ['Backspace', 'on an empty pair, removes both halves'],
  ['Ctrl+Q / Ctrl+W', 'previous / next file tab (multi-file challenges)'],
];

const BROWSER = [
  ['Tab / Shift+Tab', 'cycle Render, Elements, Styles, Console, Issues'],
  ['1 - 5', 'jump straight to a pane'],
  ['j / k', 'scroll, or move through the DOM tree'],
  ['PgUp / PgDn', 'scroll a page at a time'],
  ['Enter', 'on the Console pane: evaluate the expression'],
  ['Ctrl+U', 'clear the console input line'],
  ['Ctrl+L', 'clear the console output'],
  ['Esc / Ctrl+B', 'back to the editor'],
];

const LESSON = [
  ['j / k', 'scroll the lesson'],
  ['PgUp / PgDn', 'scroll a page at a time'],
  ['Tab', 'focus the next challenge in the list'],
  ['Enter', 'open the focused challenge (or the first unsolved one)'],
  ['m', 'mark the lesson as read'],
  ['n', 'jump straight to the next lesson'],
];

function keyTable(theme, w, rows) {
  return rows.map(([key, label]) => fit([
    seg('  ', {}),
    seg(key.padEnd(12), { fg: theme.accent, bold: true }),
    seg(label, { fg: theme.text }),
  ], w, { bg: theme.bg }));
}

export default function renderHelp(app, w, h) {
  const t = app.theme;
  const rows = [];

  rows.push(sectionLabel(t, w, 'Keyboard', 'everything is reachable without a mouse'));
  rows.push(...keyTable(t, w, GLOBAL));

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(sectionLabel(t, w, 'Inside a challenge'));
  rows.push(...keyTable(t, w, CHALLENGE));

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(sectionLabel(t, w, 'Inside the editor', 'completions and auto-pairing'));
  rows.push(...keyTable(t, w, EDITOR));

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(sectionLabel(t, w, 'Inside the built-in browser', 'Ctrl+B from any challenge'));
  rows.push(...keyTable(t, w, BROWSER));

  rows.push(fit([], w, { bg: t.bg }));
  rows.push(sectionLabel(t, w, 'Inside a lesson'));
  rows.push(...keyTable(t, w, LESSON));

  const notes = [
    '**Grading is real.** Your JavaScript is executed in a sandbox and the assertions call your actual functions.',
    'HTML is parsed into a tree, so checks ask structural questions ("is there an `img` inside a `figure` with a non-empty alt").',
    'CSS is parsed into rules, so checks can look at computed intent, not text.',
    '**Debug challenges** hand you broken code. **Write challenges** start you from nothing. Both end with a sample solution you can compare against.',
    'Every artefact you solve is written to `.workspace/` as a real file. Open it, keep it, push it to GitHub.',
    'The editor suggests code the way an editor extension does: tag and attribute names, CSS properties and values, JS/SQL/shell snippets, and the words already in your file. Auto-pairing closes brackets, quotes and HTML tags as you type.',
    '**Ctrl+B** opens a browser for the page you are building: Render shows the layout with your CSS applied, Elements is the DOM tree, Styles explains which rules matched, Console evaluates expressions against your own code, and Issues lists accessibility and structure problems.',
  ];
  rows.push(fit([], w, { bg: t.bg }));
  rows.push(sectionLabel(t, w, 'How this works'));
  for (const note of notes) {
    rows.push(...prose(t, w - 2, note).map((line) => fit([seg('  ', {}), ...line], w, { bg: t.bg })));
  }

  return clampRows(rows, w, h, t);
}
