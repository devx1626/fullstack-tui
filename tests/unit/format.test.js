import test from 'node:test';
import assert from 'node:assert/strict';

import { formatCode, formatHtml, formatCss, formatJs, formatCodeAt, formatJson } from '../../src/core/format.js';

test('html normalises attributes, void tags and nesting', () => {
  const out = formatHtml("<!doctype html>\n<html><body  class='x'   id=main ><div><p>hi</p><br></div></body></html>");
  assert.ok(out);
  assert.equal(out, `<!doctype html>
<html>
  <body class="x" id="main">
    <div>
      <p>hi</p>
      <br>
    </div>
  </body>
</html>
`);
});

test('html keeps inline-only elements on one line and raw text verbatim', () => {
  const out = formatHtml('<div><span>hey <b>you</b></span></div><pre>  keep\n   me</pre>');
  assert.ok(out);
  assert.ok(out.includes('<div><span>hey <b>you</b></span></div>'), out);
  assert.ok(out.includes('<pre>  keep\n   me</pre>'), out);
});

test('html reindents style and script interiors', () => {
  const out = formatHtml('<style>body{color:red;margin:0}</style><script>if(x){y()}</script>');
  assert.ok(out);
  assert.ok(out.includes('color: red;'), out);
  assert.ok(out.includes('margin: 0;'), out);
  assert.ok(out.includes('</style>'));
  assert.ok(out.includes('if(x){'), out); // no reflow inside script
});

test('html aborts on stray closers and unclosed elements', () => {
  assert.equal(formatHtml('<div></span>'), null);
  assert.equal(formatHtml('<div><p>'), null);
});

test('css one decl per line, lowercase props, blank line between rules', () => {
  const out = formatCss('body{COLOR:red;margin:0}h1{font-size:2rem}');
  assert.equal(out, `body {
  color: red;
  margin: 0;
}

h1 {
  font-size: 2rem;
}
`);
});

test('css handles media, multi-selectors and block-less at-rules', () => {
  const out = formatCss('@media(min-width:700px){.a,.b{color:red}}@import "x.css";');
  assert.ok(out);
  assert.ok(out.includes('@media (min-width:700px) {'), out);
  assert.ok(out.includes('.a,\n  .b {'), out);
  assert.ok(out.includes('@import "x.css";'), out);
});

test('css preserves strings and aborts on malformed input', () => {
  const out = formatCss('a:after{content:"a, b"}');
  assert.ok(out.includes('content: "a, b";'), out);
  assert.equal(formatCss('body { color: ;;; }'), null);
  assert.equal(formatCss('body {'), null);
});

test('js reindents by brace depth without reflowing statements', () => {
  // No reflow: `if(x){` stays exactly as typed; only indentation changes.
  const out = formatJs('function f(){\nif(x){\ny()\n}\n}');
  assert.equal(out, 'function f(){\n  if(x){\n    y()\n  }\n}\n');
});

test('js masks strings, template interiors and comments for depth', () => {
  const out = formatJs('const s="a}b";\nconst t=`multi\nline}txt`;\n// } comment\nlog(s,t)');
  assert.ok(out);
  assert.ok(out.includes('"a}b"'), out);
  assert.ok(out.includes('`multi\nline}txt`'), out);
  assert.ok(out.includes('// } comment'), out);
  assert.equal(out.split('\n').filter((l) => l.startsWith('const ')).length, 2);
});

test('js aborts on unbalanced braces', () => {
  assert.equal(formatJs('function f(){'), null);
  assert.equal(formatJs('}'), null);
});

test('json pretty-prints and aborts on parse errors', () => {
  assert.equal(formatJson('{"a":1}'), '{\n  "a": 1\n}\n');
  assert.equal(formatJson('{bad'), null);
});

test('formatCode dispatches and reports changed', () => {
  const r = formatCode('css', 'body{color:red}');
  assert.ok(r);
  assert.equal(r.changed, true);
  assert.equal(r.lang, 'css');
  const same = formatCode('css', 'body {\n  color: red;\n}\n');
  assert.ok(same);
  assert.equal(same.changed, false);
  assert.equal(formatCode('sh', 'git status'), null);
});

test('formatCodeAt formats the enclosing css rule only', () => {
  const src = 'body {\n  color: red;\n}\nh1 {\n  font-size: 2rem;\n}\n';
  const caret = src.indexOf('2rem');
  const res = formatCodeAt('css', src, caret);
  assert.ok(res);
  assert.ok(res.text.startsWith('body {'));
  assert.ok(res.text.includes('h1 {'));
  // h1's rule got reindented to top-level and the rest of the doc survived.
  assert.ok(res.text.includes('  font-size: 2rem;'));
  assert.ok(!res.text.includes('\nh1 {'.replace('h1 {', '  h1 {'))); // no double indent
});

test('formatCodeAt falls back to whole-document outside any block', () => {
  const res = formatCodeAt('css', 'a{color:red}\n', 0);
  assert.ok(res);
  assert.ok(res.text.includes('a {'), res.text);
});
