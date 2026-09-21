/**
 * Help manual content — one source of truth for both UIs.
 *
 * The classic canvas view (`src/views/help.js`) and the next-UI screen
 * (`src/ui/screens/help.jsx`) render this same data, so a key that changes
 * here cannot go stale in one renderer. Rows are `[key, label]` pairs;
 * sections keep their display order and hints.
 */

/** Ordered help sections: which keys work where, plus one line of context. */
export const HELP_SECTIONS = [
  {
    title: 'Keyboard',
    hint: 'everything is reachable without a mouse',
    rows: [
      ['j / k', 'move down / up'],
      ['Enter', 'open the highlighted item'],
      ['Esc', 'go back one screen'],
      ['Ctrl+K', 'command palette (any command, any screen)'],
      ['?', 'this help screen'],
      ['Ctrl+C', 'quit (progress is saved)'],
      ['Ctrl+L', 'force a full redraw if the terminal glitches'],
    ],
  },
  {
    title: 'Inside a challenge',
    hint: '',
    rows: [
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
    ],
  },
  {
    title: 'Inside the editor',
    hint: 'completions and auto-pairing',
    rows: [
      ['<', 'in HTML/CSS/JS: a live suggestion list appears'],
      ['Ctrl+Space', 'ask for suggestions anywhere'],
      ['Tab / Enter', 'accept the highlighted suggestion'],
      ['Up / Down', 'walk the suggestion list'],
      ['Esc', 'dismiss the list'],
      ['( [ {', 'close themselves, and so do quotes'],
      ['>', 'in HTML, closes the tag you just opened'],
      ['Backspace', 'on an empty pair, removes both halves'],
      ['Ctrl+Q / Ctrl+W', 'previous / next file tab (multi-file challenges)'],
    ],
  },
  {
    title: 'Inside the built-in browser',
    hint: 'Ctrl+B from any challenge',
    rows: [
      ['Tab / Shift+Tab', 'cycle Render, Elements, Styles, Console, Network'],
      ['1 - 5', 'jump straight to a pane'],
      ['j / k', 'scroll, or move through the DOM tree'],
      ['PgUp / PgDn', 'scroll a page at a time'],
      ['Enter', 'jump to the selected element\'s source line; evaluates on Console'],
      ['Ctrl+U', 'clear the console input line'],
      ['Ctrl+L', 'clear the console output'],
      ['Esc / Ctrl+B', 'back to the editor'],
    ],
  },
  {
    title: 'Inside a lesson',
    hint: '',
    rows: [
      ['j / k', 'scroll the lesson'],
      ['PgUp / PgDn', 'scroll a page at a time'],
      ['Tab', 'focus the next challenge in the list'],
      ['Enter', 'open the focused challenge (or the first unsolved one)'],
      ['m', 'mark the lesson as read'],
      ['n', 'jump straight to the next lesson'],
    ],
  },
];

/** "How this works" prose notes, rendered after the key tables. */
export const HELP_NOTES = [
  '**Grading is real.** Your JavaScript is executed in a sandbox and the assertions call your actual functions.',
  'HTML is parsed into a tree, so checks ask structural questions ("is there an `img` inside a `figure` with a non-empty alt").',
  'CSS is parsed into rules, so checks can look at computed intent, not text.',
  '**Debug challenges** hand you broken code. **Write challenges** start you from nothing. Both end with a sample solution you can compare against.',
  'Every artefact you solve is written to `.workspace/` as a real file. Open it, keep it, push it to GitHub.',
  'The editor suggests code the way an editor extension does: tag and attribute names, CSS properties and values, JS/SQL/shell snippets, and the words already in your file. Auto-pairing closes brackets, quotes and HTML tags as you type.',
  '**Ctrl+B** opens a browser for the page you are building: Render shows the layout with your CSS applied (click a line to inspect the element that produced it — Enter jumps to its source line, and the ⚠ rows underneath are clickable too), Elements is the DOM tree, Styles explains which rules matched, Console evaluates expressions against your own code on a warmed session, and Network shows the challenge\'s mocked routes plus what your code actually fetched.',
];
