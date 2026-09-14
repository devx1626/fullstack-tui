import { T } from '../core/grade.js';

/**
 * React challenges run for real.
 *
 * `REACT_PRELUDE` gives the sandbox a miniature React runtime: `h()` builds
 * element objects (which is *exactly* what JSX compiles to), and `useState` /
 * `useReducer` / `useEffect` are backed by a tiny hook store. Your component is
 * then called with props, the returned tree is inspected, and clicking a button
 * or typing into an input genuinely re-renders it.
 *
 * The checks use `__must`, `__text`, `__byClass`, `__click` and `__change`
 * helpers from the same prelude, and every failure comes with a plain-English
 * message instead of a bare `false`.
 */
const REACT_PRELUDE = `
function __flatten(nodes, out) {
  out = out || [];
  for (let i = 0; i < nodes.length; i += 1) {
    const n = nodes[i];
    if (Array.isArray(n)) __flatten(n, out);
    else if (n === null || n === undefined || n === false || n === true) continue;
    else out.push(n);
  }
  return out;
}
function h(type, props, ...children) {
  const p = props || {};
  const rest = {};
  const names = Object.keys(p);
  for (let i = 0; i < names.length; i += 1) {
    if (names[i] !== 'key' && names[i] !== 'children') rest[names[i]] = p[names[i]];
  }
  const direct = __flatten(children);
  return {
    __el: true,
    type: type,
    key: p.key === undefined ? null : p.key,
    props: rest,
    children: direct.length ? direct : __flatten([p.children])
  };
}
const Fragment = '__fragment';
const __hooks = { i: 0, store: [] };
function __resetHooks() { __hooks.i = 0; }
function useState(initial) {
  const i = __hooks.i;
  __hooks.i += 1;
  if (__hooks.store[i] === undefined) __hooks.store[i] = { v: typeof initial === 'function' ? initial() : initial };
  const slot = __hooks.store[i];
  const set = function (next) { slot.v = typeof next === 'function' ? next(slot.v) : next; };
  return [slot.v, set];
}
function useReducer(reducer, initial, init) {
  const i = __hooks.i;
  __hooks.i += 1;
  if (__hooks.store[i] === undefined) __hooks.store[i] = { v: init ? init(initial) : initial };
  const slot = __hooks.store[i];
  return [slot.v, function (action) { slot.v = reducer(slot.v, action); }];
}
function useEffect(fn) { const cleanup = fn(); return cleanup; }
function useMemo(fn) { return fn(); }
function useRef(value) { return { current: value }; }
function __render(Component, props) { __resetHooks(); return Component(props || {}); }
/** Called before every check, so each one starts with a freshly mounted tree. */
function __beforeTest() { __hooks.store.length = 0; __hooks.i = 0; }
function __find(node, pred, out) {
  out = out || [];
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) __find(node[i], pred, out);
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  if (pred(node)) out.push(node);
  if (node.children) __find(node.children, pred, out);
  return out;
}
function __one(node, pred) { return __find(node, pred)[0]; }
function __text(node) {
  if (node === null || node === undefined || node === false) return '';
  if (Array.isArray(node)) return node.map(__text).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return __text(node.children);
}
function __classes(node) { return (node && node.props && node.props.className) || ''; }
function __byClass(node, name) {
  return __one(node, function (n) { return __classes(n).split(' ').indexOf(name) !== -1; });
}
function __byType(node, type) { return __one(node, function (n) { return n.type === type; }); }
function __keysOf(node) { return __find(node, function () { return true; }).map(function (n) { return n.key; }); }
function __click(el) { return el.props.onClick({ preventDefault: function () {}, stopPropagation: function () {} }); }
function __change(el, value) { return el.props.onChange({ target: { value: value } }); }
function __isEl(node, type) { return !!node && node.__el === true && node.type === type; }
`;

/** A tiny event bus that stands in for a real subscription source. */
const BUS_PRELUDE = `
const __bus = {
  subs: [],
  latest: function (symbol) { return symbol === 'AAPL' ? 191.2 : 42; },
  subscribe: function (symbol, handler) {
    const entry = { symbol: symbol, handler: handler };
    __bus.subs.push(entry);
    return function () {
      const i = __bus.subs.indexOf(entry);
      if (i !== -1) __bus.subs.splice(i, 1);
    };
  }
};
`;

export default {
  id: 'react',
  title: 'React',
  badge: 'RE',
  color: 'star',
  tagline: 'Declarative UIs: describe the screen, let the state drive it',
  hours: 16,
  why:
    'React is the mental model shift of frontend work: instead of telling the browser what to change, you describe what the screen should look like ' +
    'for a given state, and React works out the edits. That thinking - state, props, derived data, keys, effects - is what every React interview ' +
    'and every real codebase is built on. Learn it here and Angular or Vue feel like dialects.',
  source: {
    course: 'Dave Gray - React JS Full Course for Beginners (all-in-one tutorial)',
    url: 'https://www.youtube.com/watch?v=RVFAyFWO4go',
    roadmap: 'https://roadmap.sh/react',
    docs: 'https://react.dev/learn/thinking-in-react',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'react-01',
      title: 'Elements, Components and Props',
      minutes: 40,
      objectives: [
        'Explain what a React element actually is (a plain object)',
        'Write a function component that takes props and returns an element',
        'Treat props as read-only input and compose components with children',
      ],
      sections: [
        {
          heading: 'JSX is sugar for function calls',
          body:
            'A React element is not a DOM node. It is a small object describing what you want: `{ type, props, children }`. JSX looks like HTML ' +
            'because it is nicer to read, but the tooling rewrites it:\n\n' +
            '```jsx\n<article className="card">\n  <h2>{user.name}</h2>\n</article>\n```\n\n' +
            'compiles to\n\n' +
            '```js\nh(\'article\', { className: \'card\' }, h(\'h2\', null, user.name));\n```\n\n' +
            'Everything in this module is written as `h(...)` calls so the TUI can run your code without a build step; the shape of the tree is ' +
            'identical to what JSX produces.',
        },
        {
          heading: 'A component is a function from props to element',
          body:
            '```js\nfunction Avatar({ user, size = 48 }) {\n  return h(\'img\', { src: user.avatar, alt: user.name, width: size, height: size });\n}\n```\n\n' +
            'Three rules that keep components predictable:\n\n' +
            '1. **Same props in, same element out.** No reading a clock or a global during render.\n' +
            '2. **Never mutate props.** They belong to the parent.\n' +
            '3. **Start with the data, then the UI.** Sketch the data, then say what it looks like.',
        },
        {
          heading: 'Composition beats configuration',
          body:
            'Rather than adding a `showFooter` boolean, pass the content in:\n\n' +
            '```js\nfunction Card({ title, children }) {\n  return h(\'section\', { className: \'card\' },\n    h(\'header\', null, h(\'h3\', null, title)),\n    h(\'div\', { className: \'body\' }, children),\n  );\n}\n\n' +
            'Card({\n  title: \'Deploys\',\n  children: h(\'p\', null, \'All systems normal\'),\n});\n```\n\n' +
            '`children` is just another prop. That single idea removes most boolean-prop bloat in real codebases.',
        },
      ],
      pitfalls: [
        'Mutating `props` inside a component - the parent never sees the change and the bug is invisible',
        'Returning a string or array from a component instead of a single element (React 18 needs one root, or a Fragment)',
        'Reading `window` or `Math.random()` during render, so the UI stops being a pure function of state',
        'Copying props into state, then wondering why updates do not arrive',
      ],
      keyPoints: [
        'An element is a plain object: `{ type, props, children }` - JSX is a nicer way to write it',
        'A component is a function from props to an element; same props, same output',
        'Props are read-only input; composition with `children` beats configuration with flags',
      ],
      resources: [
        { label: 'react.dev: Your First Component', url: 'https://react.dev/learn/your-first-component' },
        { label: 'react.dev: Passing Props to a Component', url: 'https://react.dev/learn/passing-props-to-a-component' },
        { label: 'Dave Gray: React JS Crash Course playlist', url: 'https://www.youtube.com/playlist?list=PL0Zuz27SZ-6PrE9srvEn8nbhOOy3EXJu6' },
      ],
      challenges: [
        {
          id: 'write-card',
          kind: 'write',
          difficulty: 'easy',
          minutes: 12,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'Write a `ProfileCard` component that takes a `user` prop (`{ name, role, skills }`) and returns an article with the name in an `h2`, ' +
            'the role in a paragraph with `className: "role"`, and a `ul` with one `li` per skill. Give the article `className: "card"`.',
          requirements: [
            'Return a single `h("article", { className: "card" }, ...)` element',
            'The name appears in an `h2` and the role in a `p` with `className: "role"`',
            'One `li` per skill, each keyed by the skill string itself',
            'Never mutate the `user` prop',
          ],
          starter: `function ProfileCard({ user }) {\n  // Render the card here.\n  return null;\n}\n`,
          hints: [
            'A component is just a function: `function ProfileCard({ user }) { return h(...); }`',
            'For the list: `user.skills.map((skill) => h("li", { key: skill }, skill))`',
            'Nest elements as extra arguments: `h("article", { className: "card" }, h("h2", null, user.name), ...)`',
          ],
          solution: `function ProfileCard({ user }) {
  return h('article', { className: 'card' },
    h('h2', null, user.name),
    h('p', { className: 'role' }, user.role),
    h('ul', null, user.skills.map((skill) => h('li', { key: skill }, skill))),
  );
}
`,
          checks: [
            T.js(
              'returns an <article> with class "card"',
              `__must(__isEl(__byType(__render(ProfileCard, { user: { name: 'Ama', role: 'Dev', skills: ['css', 'js'] } }), 'article'), 'article'), 'return an <article> element from the component') && __must(__classes(__byType(__render(ProfileCard, { user: { name: 'Ama', role: 'Dev', skills: ['css', 'js'] } }), 'article')) === 'card', 'give the <article> a className of "card"')`,
              'Return `h("article", { className: "card" }, ...)` as the root of the tree.',
            ),
            T.js(
              'name and role are rendered',
              `(function () { const tree = __render(ProfileCard, { user: { name: 'Ama', role: 'Dev', skills: [] } }); __must(__text(__byType(tree, 'h2')) === 'Ama', 'the <h2> should contain the user name'); __must(__text(__byClass(tree, 'role')) === 'Dev', 'put the role in a <p className="role">'); return true; })()`,
              'Use `h("h2", null, user.name)` and `h("p", { className: "role" }, user.role)`.',
            ),
            T.js(
              'one keyed <li> per skill',
              `(function () {
  const tree = __render(ProfileCard, { user: { name: 'Ama', role: 'Dev', skills: ['css', 'js', 'react'] } });
  const items = __find(tree, (n) => __isEl(n, 'li'));
  __must(items.length === 3, 'expected 3 <li> elements, got ' + items.length);
  __must(__text(items) === 'cssjsreact', 'each <li> should contain the skill text');
  __must(items.map((n) => n.key).join(',') === 'css,js,react', 'key each <li> by the skill: { key: skill }');
  return true;
})()`,
              'Map the skills into `li` elements and give each one `key: skill`.',
            ),
            T.js(
              'does not mutate the user prop',
              `(function () { const user = { name: 'Ama', role: 'Dev', skills: ['css'] }; __render(ProfileCard, { user }); __must(user.name === 'Ama' && user.skills.join() === 'css', 'you changed the user object - props are read-only'); return true; })()`,
              'Derive new values into local variables instead of assigning to `user.*`.',
            ),
          ],
        },
        {
          id: 'debug-greeting',
          kind: 'debug',
          difficulty: 'easy',
          minutes: 10,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'This component "works" in the sense that it prints something, but it breaks the two rules of props: it mutates the object it was ' +
            'handed, and it returns a bare string instead of an element. Fix it so the caller\'s object is untouched and the output is an `h1` ' +
            'reading `Hello, AMA!` when the name is `ama`.',
          requirements: [
            'Return an `h1` element, not a string',
            'The text is `Hello, ` + name in upper case + `!`',
            'The object the caller passed is not modified',
          ],
          starter: `function Greeting(props) {
  props.name = props.name.toUpperCase();
  return 'Hello, ' + props.name;
}
`,
          hints: [
            'Return `h("h1", null, text)` - a component must return an element.',
            'Upper-casing into a new variable leaves the input alone: `const shouted = name.toUpperCase();`',
            'Destructure in the parameter list: `function Greeting({ name })`.',
          ],
          solution: `function Greeting({ name }) {
  const shouted = name.toUpperCase();
  return h('h1', null, 'Hello, ' + shouted + '!');
}
`,
          checks: [
            T.js(
              'returns an <h1> with the shouted greeting',
              `(function () { const tree = __render(Greeting, { name: 'ama' }); __must(__isEl(tree, 'h1'), 'a component must return an element, not a string'); __must(__text(tree) === 'Hello, AMA!', 'expected "Hello, AMA!" but got ' + JSON.stringify(__text(tree))); return true; })()`,
              'Return `h("h1", null, \'Hello, \' + name.toUpperCase() + \'!\')`.',
            ),
            T.js(
              'does not mutate the props object',
              `(function () { const props = { name: 'ama' }; __render(Greeting, props); __must(props.name === 'ama', 'you assigned to props.name - the caller still sees the old value, and React would not re-render'); return true; })()`,
              'Copy to a local variable instead of writing back to `props`.',
            ),
          ],
        },
        {
          id: 'write-card-children',
          kind: 'write',
          difficulty: 'medium',
          minutes: 14,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'Write a reusable `Card` component that takes `title`, an optional `tone` (default `"neutral"`) and `children`. It returns a `section` ' +
            'with `className` `"card card-<tone>"`, a `header` containing an `h3` with the title, and a `div` with `className: "body"` wrapping ' +
            'the children.',
          requirements: [
            '`className` is exactly `card card-<tone>`',
            'A missing `tone` defaults to `neutral`',
            'Children are rendered inside the `div` with `className: "body"`',
            'Works with no children at all (renders an empty body, not a crash)',
          ],
          starter: `function Card({ title, tone, children }) {\n  // Implementation goes here.\n  return null;\n}\n`,
          hints: [
            'Default parameters work here: `function Card({ title, tone = "neutral", children })`.',
            'Template string for the class: `` `card card-${tone}` ``.',
            '`children` is a value you can pass straight as the last argument to `h`.',
          ],
          solution: `function Card({ title, tone = 'neutral', children }) {
  return h('section', { className: 'card card-' + tone },
    h('header', null, h('h3', null, title)),
    h('div', { className: 'body' }, children),
  );
}
`,
          checks: [
            T.js(
              'renders the default tone',
              `(function () { const tree = __render(Card, { title: 'Deploys' }); __must(__classes(__byType(tree, 'section')) === 'card card-neutral', 'a missing tone should give className "card card-neutral", got ' + JSON.stringify(__classes(__byType(tree, 'section')))); return true; })()`,
              'Use a default in the destructuring: `tone = "neutral"`.',
            ),
            T.js(
              'renders the supplied tone and the title',
              `(function () { const tree = __render(Card, { title: 'Deploys', tone: 'warn' }); __must(__classes(__byType(tree, 'section')) === 'card card-warn', 'className should be "card card-warn"'); __must(__text(__byType(tree, 'h3')) === 'Deploys', 'the <h3> should contain the title'); return true; })()`,
              'Build the class with `"card card-" + tone`.',
            ),
            T.js(
              'renders children inside the body',
              `(function () { const tree = __render(Card, { title: 'x', children: h('p', null, 'All systems normal') }); const body = __byClass(tree, 'body'); __must(body, 'wrap the children in a <div className="body">'); __must(__text(body) === 'All systems normal', 'the children should be rendered inside that div'); return true; })()`,
              'Pass `children` as the third argument to the body `h()` call.',
            ),
            T.js(
              'survives being given no children',
              `(function () { const tree = __render(Card, { title: 'Empty' }); __must(__byClass(tree, 'body'), 'still render the body div when there are no children'); __must(__text(tree) === 'Empty', 'nothing else should appear'); return true; })()`,
              'Do not call `children.map(...)` - React renders `undefined` children as nothing.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'react-02',
      title: 'State, Events and Re-rendering',
      minutes: 45,
      objectives: [
        'Add state to a component with `useState` and trigger a re-render',
        'Use functional updates so several updates in one handler all apply',
        'Lift state up when two components need to agree',
      ],
      sections: [
        {
          heading: 'State is a snapshot, not a variable',
          body:
            '```js\nconst [count, setCount] = useState(0);\n```\n\n' +
            'On every render, `count` is a *constant* holding the value for that render. `setCount` does not change `count`; it asks React for a ' +
            'new render with a new value. That is why this handler is wrong:\n\n' +
            '```js\nfunction bumpTwice() {\n  setCount(count + 1);  // 0 + 1\n  setCount(count + 1);  // still 0 + 1, same snapshot\n}\n```\n\n' +
            'The second call uses the same stale `count`, so the total is 1, not 2.',
        },
        {
          heading: 'Functional updates see the latest value',
          body:
            '```js\nfunction bumpTwice() {\n  setCount((c) => c + 1);  // 0 -> 1\n  setCount((c) => c + 1);  // 1 -> 2\n}\n```\n\n' +
            'React queues the updater functions and applies them in order. Rule of thumb: **if the new state depends on the old state, pass a ' +
            'function.** It also means the handler does not need `count` in scope, so it stays stable across renders.',
        },
        {
          heading: 'Events are props, so they flow down',
          body:
            '```js\nfunction SearchBox({ onSearch }) {\n  const [term, setTerm] = useState(\'\');\n  return h(\'form\', {\n    onSubmit: (event) => {\n      event.preventDefault();\n      onSearch(term);\n    },\n  },\n    h(\'input\', { value: term, onChange: (e) => setTerm(e.target.value) }),\n    h(\'button\', { type: \'submit\' }, \'Search\'),\n  );\n}\n```\n\n' +
            'The child owns the typing state; the parent owns what a search means. When two siblings must share state, move it to the closest ' +
            'common parent and pass the value down, the setter down as a callback.',
        },
        {
          heading: 'Derive, do not duplicate',
          body:
            'If a value can be computed from props or state, compute it during render instead of storing it:\n\n' +
            '```js\n// no\nconst [total, setTotal] = useState(0);\n// yes\nconst total = items.reduce((sum, item) => sum + item.price, 0);\n```\n\n' +
            'Duplicated state is the single most common source of "the UI is out of sync" bugs, because two values must be updated together and ' +
            'some code path will forget.',
        },
      ],
      pitfalls: [
        '`setCount(count + 1)` twice in one handler - only one increment lands',
        'Storing a value that can be derived from existing state',
        'Mutating an array or object in state: `items.push(x)` then `setItems(items)` - same reference, no re-render',
        'Calling a state setter during render instead of in an event handler or effect',
      ],
      keyPoints: [
        'State is per-render snapshot; setters request a new render',
        'Use `setX((prev) => ...)` whenever the update depends on the previous value',
        'Lift shared state to the nearest common parent; pass data down, callbacks up',
      ],
      resources: [
        { label: 'react.dev: State - A Component\'s Memory', url: 'https://react.dev/learn/state-a-components-memory' },
        { label: 'react.dev: Queueing a Series of State Updates', url: 'https://react.dev/learn/queueing-a-series-of-state-updates' },
        { label: 'react.dev: Sharing State Between Components', url: 'https://react.dev/learn/sharing-state-between-components' },
      ],
      challenges: [
        {
          id: 'write-counter',
          kind: 'write',
          difficulty: 'easy',
          minutes: 12,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'Write a `Counter` component taking `{ start = 0 }`. Render an `output` showing the count, then three buttons: `className: "inc"` ' +
            '(`+`), `className: "dec"` (`-`) and `className: "reset"` which returns the count to `start`.',
          requirements: [
            'The `output` shows the current count as text',
            'Clicking `.inc` increases the count by one, `.dec` decreases it',
            'Clicking `.reset` returns the count to `start`',
            'Use `useState` - do not keep the count in a module-level variable',
          ],
          starter: `function Counter({ start = 0 }) {\n  // Add state and the three buttons here.\n  return null;\n}\n`,
          hints: [
            '`const [count, setCount] = useState(start);`',
            '`onClick: () => setCount(count + 1)` for the increment button.',
            '`onClick: () => setCount(start)` for reset.',
          ],
          solution: `function Counter({ start = 0 }) {
  const [count, setCount] = useState(start);

  return h('div', null,
    h('output', null, String(count)),
    h('button', { className: 'inc', onClick: () => setCount(count + 1) }, '+'),
    h('button', { className: 'dec', onClick: () => setCount(count - 1) }, '-'),
    h('button', { className: 'reset', onClick: () => setCount(start) }, 'reset'),
  );
}
`,
          checks: [
            T.js(
              'starts at the start prop',
              `(function () { const tree = __render(Counter, { start: 3 }); const out = __byType(tree, 'output'); __must(out, 'render an <output> element for the count'); __must(__text(out) === '3', 'the <output> should show the start value 3, got ' + JSON.stringify(__text(out))); __must(__byType(tree, 'button') && ['inc', 'dec', 'reset'].every((c) => __byClass(tree, c)), 'render the three buttons with classNames inc, dec and reset'); return true; })()`,
              'Use `useState(start)` and render the count inside an `<output>`.',
            ),
            T.js(
              'increment and decrement work',
              `(function () {
  const render = () => __render(Counter, { start: 0 });
  let tree = render();
  __click(__byClass(tree, 'inc'));
  tree = render();
  __must(__text(__byType(tree, 'output')) === '1', 'one click on + should give 1, got ' + __text(__byType(tree, 'output')));
  __click(__byClass(tree, 'inc'));
  tree = render();
  __must(__text(__byType(tree, 'output')) === '2', 'two clicks on + should give 2, got ' + __text(__byType(tree, 'output')));
  __click(__byClass(tree, 'dec'));
  tree = render();
  __must(__text(__byType(tree, 'output')) === '1', 'a click on - should give 1, got ' + __text(__byType(tree, 'output')));
  return true;
})()`,
              'Give each button an `onClick` that calls the setter.',
            ),
            T.js(
              'reset returns to the start value',
              `(function () { let tree = __render(Counter, { start: 7 }); __click(__byClass(tree, 'inc')); tree = __render(Counter, { start: 7 }); __click(__byClass(tree, 'reset')); tree = __render(Counter, { start: 7 }); __must(__text(__byType(tree, 'output')) === '7', 'reset should go back to start, got ' + __text(__byType(tree, 'output'))); return true; })()`,
              'Reset sets the count back to the `start` prop.',
            ),
          ],
        },
        {
          id: 'debug-stale-state',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'The "bump twice" button only ever bumps the count once. Both setters run, but each one reads the same stale snapshot of `count`. ' +
            'Fix the handler so a single click adds 2 - without adding a second button or a second render pass.',
          requirements: [
            'One click on the button adds exactly 2 to the count',
            'Two clicks add 4',
            'The updater must read the latest value, not the value captured in this render',
          ],
          starter: `function Stepper() {
  const [count, setCount] = useState(0);

  function bumpTwice() {
    setCount(count + 1);
    setCount(count + 1);
  }

  return h('div', null,
    h('output', null, String(count)),
    h('button', { onClick: bumpTwice }, 'bump twice'),
  );
}
`,
          hints: [
            'Both lines read the same `count` from this render - that is why only one lands.',
            'Pass a function instead of a value: `setCount((c) => c + 1)`',
            'The updater receives the pending value, so applying it twice really adds two.',
          ],
          solution: `function Stepper() {
  const [count, setCount] = useState(0);

  function bumpTwice() {
    setCount((c) => c + 1);
    setCount((c) => c + 1);
  }

  return h('div', null,
    h('output', null, String(count)),
    h('button', { onClick: bumpTwice }, 'bump twice'),
  );
}
`,
          checks: [
            T.js(
              'one click adds two',
              `(function () { let tree = __render(Stepper, {}); __click(__byType(tree, 'button')); tree = __render(Stepper, {}); __must(__text(__byType(tree, 'output')) === '2', 'one click should give 2, got ' + __text(__byType(tree, 'output')) + ' - both setters are still reading the same snapshot'); return true; })()`,
              '`setCount((c) => c + 1)` twice.',
            ),
            T.js(
              'two clicks add four',
              `(function () { let tree = __render(Stepper, {}); __click(__byType(tree, 'button')); __click(__byType(tree, 'button')); tree = __render(Stepper, {}); __must(__text(__byType(tree, 'output')) === '4', 'two clicks should give 4, got ' + __text(__byType(tree, 'output'))); return true; })()`,
              'Functional updates stack, so repeated clicks keep adding.',
            ),
          ],
        },
        {
          id: 'write-toggle',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'Write a `PasswordField` component with props `{ value, onChange }`. It renders an `input` whose `type` is `"password"` until the ' +
            'toggle button (the only `button`, text `Show`/`Hide`) is clicked, after which it is `"text"`. The input passes its value out through ' +
            '`onChange`, and the button label flips between `Show` and `Hide`.',
          requirements: [
            'The input `type` starts as `password` and becomes `text` after one click, then flips back',
            'The button text is `Show` while hidden and `Hide` while visible',
            '`value` is passed straight through to the input - the component does not own it',
            'Typing calls `onChange` with the new value',
          ],
          starter: `function PasswordField({ value, onChange }) {\n  // Add the local "visible" state here.\n  return null;\n}\n`,
          hints: [
            'Only the visibility is local state: `const [visible, setVisible] = useState(false);`',
            '`type: visible ? "text" : "password"`',
            'Toggle with an updater: `setVisible((v) => !v)` - no stale closure.',
          ],
          solution: `function PasswordField({ value, onChange }) {
  const [visible, setVisible] = useState(false);

  return h('div', { className: 'field' },
    h('input', {
      type: visible ? 'text' : 'password',
      value,
      onChange: (event) => onChange(event.target.value),
    }),
    h('button', { onClick: () => setVisible((v) => !v) }, visible ? 'Hide' : 'Show'),
  );
}
`,
          checks: [
            T.js(
              'the input type toggles',
              `(function () { let tree = __render(PasswordField, { value: 'hunter2' }); const input = () => __byType(__render(PasswordField, { value: 'hunter2' }), 'input'); __must(input().props.type === 'password', 'the input should start as type="password"'); __click(__byType(tree, 'button')); __must(input().props.type === 'text', 'after one click the input should be type="text"'); __click(__byType(__render(PasswordField, { value: 'hunter2' }), 'button')); __must(input().props.type === 'password', 'clicking again should hide the value again'); return true; })()`,
              'Keep `visible` in state and derive the `type` from it.',
            ),
            T.js(
              'the button label follows the state',
              `(function () { let tree = __render(PasswordField, { value: '' }); __must(__text(__byType(tree, 'button')) === 'Show', 'the button should read "Show" while the value is hidden'); __click(__byType(tree, 'button')); tree = __render(PasswordField, { value: '' }); __must(__text(__byType(tree, 'button')) === 'Hide', 'the button should read "Hide" while the value is visible'); return true; })()`,
              'The label is `visible ? "Hide" : "Show"`.',
            ),
            T.js(
              'the value is controlled and reported upward',
              `(function () { const seen = []; const tree = __render(PasswordField, { value: 'abc', onChange: (v) => seen.push(v) }); __must(__byType(tree, 'input').props.value === 'abc', 'pass the value prop straight to the input'); __change(__byType(tree, 'input'), 'abcd'); __must(seen.join() === 'abcd', 'typing should call onChange with the new value, got ' + JSON.stringify(seen)); return true; })()`,
              'The input is controlled: `onChange: (e) => onChange(e.target.value)`.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'react-03',
      title: 'Lists, Keys and Derived State',
      minutes: 40,
      objectives: [
        'Render collections with `map` and stable keys',
        'Explain why the array index is a bad key',
        'Filter, sort and total data during render instead of storing copies',
      ],
      sections: [
        {
          heading: 'Keys tell React which item is which',
          body:
            '```js\ntodos.map((todo) => h(\'li\', { key: todo.id }, todo.title))\n```\n\n' +
            'React reconciles a list by key. With `key={index}` every key is reassigned when the list changes, so React reuses the wrong DOM node ' +
            'and the *uncontrolled* state inside it (focus, caret position, checkbox, animation) follows the position instead of the item. With a ' +
            'stable id, inserting an item at the top moves nothing.',
        },
        {
          heading: 'Filter and sort during render',
          body:
            '```js\nfunction TaskList({ tasks, hideDone }) {\n  const visible = hideDone ? tasks.filter((t) => !t.done) : tasks;\n  const sorted = [...visible].sort((a, b) => a.title.localeCompare(b.title));\n  return h(\'ul\', null, sorted.map((t) => h(\'li\', { key: t.id }, t.title)));\n}\n```\n\n' +
            'Note `[...visible].sort(...)`: `sort` mutates, and mutating state or props is forbidden. Copy first, always.',
        },
        {
          heading: 'Compute totals, do not store them',
          body:
            '```js\nconst done = tasks.filter((t) => t.done).length;\nconst total = tasks.length;\nconst label = `${done} of ${total} done`;\n```\n\n' +
            'If you ever store `count` in state, you now have two sources of truth and a whole category of bug. Keep one: the array. Derive the rest.\n\n' +
            'For lists that are expensive to compute, `useMemo` caches the result between renders - but reach for it only after measuring.',
        },
      ],
      pitfalls: [
        '`key={index}` on a list that can be reordered, filtered or inserted into',
        'Forgetting `key` entirely - React warns and falls back to positional matching',
        '`items.sort()` or `items.reverse()` directly on props/state - both mutate',
        'Storing a filtered copy in state, so the list goes stale when the source changes',
        'Rendering `null` from a `map` callback without filtering it out first, producing holes',
      ],
      keyPoints: [
        'Use a stable, unique id from your data as the key - never the index',
        'Filter/sort a *copy* during render; never mutate props or state',
        'Derive counts and totals from the source array instead of storing them',
      ],
      resources: [
        { label: 'react.dev: Rendering Lists', url: 'https://react.dev/learn/rendering-lists' },
        { label: 'react.dev: Keeping Components Pure', url: 'https://react.dev/learn/keeping-components-pure' },
        { label: 'react.dev: You Might Not Need an Effect', url: 'https://react.dev/learn/you-might-not-need-an-effect' },
      ],
      challenges: [
        {
          id: 'write-task-list',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'Write `TaskList({ tasks })`. Render a `ul` with one `li` per task, keyed by `task.id`, each `li` carrying `className: "done"` when ' +
            'the task is done. Above the list render a `p` with `className: "summary"` reading `"2 of 3 done"`.',
          requirements: [
            'One `li` per task, in the original order',
            'Keys come from `task.id`, not the index',
            'An `li` for a done task has `className: "done"`; an open one has `className: "todo"`',
            'The summary is derived from the array: `<done> of <total> done`',
          ],
          starter: `function TaskList({ tasks }) {\n  // Render the summary and the list here.\n  return null;\n}\n`,
          hints: [
            'Count first: `const done = tasks.filter((t) => t.done).length;`',
            'Then map: `tasks.map((task) => h("li", { key: task.id, className: task.done ? "done" : "todo" }, task.title))`',
            'A `div` root can hold the summary paragraph and the `ul` together.',
          ],
          solution: `function TaskList({ tasks }) {
  const done = tasks.filter((task) => task.done).length;

  return h('div', null,
    h('p', { className: 'summary' }, done + ' of ' + tasks.length + ' done'),
    h('ul', null, tasks.map((task) => h('li', {
      key: task.id,
      className: task.done ? 'done' : 'todo',
    }, task.title))),
  );
}
`,
          checks: [
            T.js(
              'renders one keyed item per task',
              `(function () {
  const tasks = [{ id: 7, title: 'A', done: false }, { id: 9, title: 'B', done: true }, { id: 12, title: 'C', done: false }];
  const tree = __render(TaskList, { tasks });
  const items = __find(tree, (n) => __isEl(n, 'li'));
  __must(items.length === 3, 'expected 3 <li> elements, got ' + items.length);
  __must(items.map((n) => n.key).join() === '7,9,12', 'key each item by task.id (no index keys), got ' + items.map((n) => n.key).join());
  __must(__text(items) === 'ABC', 'keep the original order and render the titles');
  return true;
})()`,
              'Map over tasks and set `key: task.id`.',
            ),
            T.js(
              'marks done items with the right class',
              `(function () {
  const tasks = [{ id: 1, title: 'A', done: true }, { id: 2, title: 'B', done: false }];
  const items = __find(__render(TaskList, { tasks }), (n) => __isEl(n, 'li'));
  __must(__classes(items[0]) === 'done', 'a done task should have className "done", got ' + JSON.stringify(__classes(items[0])));
  __must(__classes(items[1]) === 'todo', 'an open task should have className "todo", got ' + JSON.stringify(__classes(items[1])));
  return true;
})()`,
              '`className: task.done ? "done" : "todo"`.',
            ),
            T.js(
              'derives the summary from the array',
              `(function () { const tree = __render(TaskList, { tasks: [{ id: 1, done: true }, { id: 2, done: true }, { id: 3, done: false }] }); __must(__text(__byClass(tree, 'summary')) === '2 of 3 done', 'the summary should read "2 of 3 done", got ' + JSON.stringify(__text(__byClass(tree, 'summary')))); return true; })()`,
              'Count the done tasks and the total from the same array.',
            ),
            T.js(
              'does not mutate the tasks it is given',
              `(function () { const tasks = [{ id: 1, title: 'A', done: true }, { id: 2, title: 'B', done: false }]; const copy = JSON.stringify(tasks); __render(TaskList, { tasks }); __must(JSON.stringify(tasks) === copy, 'you mutated the tasks array - filter/sort a copy instead'); return true; })()`,
              'Avoid `sort`, `reverse`, `push` or assignment on the prop.',
            ),
          ],
        },
        {
          id: 'debug-index-key',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 15,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'This list is supposed to show only the *open* tasks. It does render, but it lies in two ways: it mutates the data it was handed (so ' +
            'the parent\'s array is silently rewritten), and it keys by index, so React reuses the wrong DOM nodes on every reorder. Fix both.',
          requirements: [
            'Only tasks with `done === false` are rendered',
            'Every rendered item is keyed by `task.id`',
            'The `tasks` prop is not modified in any way',
            'The rendered titles keep their original relative order',
          ],
          starter: `function OpenTasks({ tasks }) {
  const open = tasks.filter((task) => {
    task.done = false;
    return true;
  });

  return h('ul', null, open.map((task, index) => h('li', { key: index }, task.title)));
}
`,
          hints: [
            'The filter callback should *test* the task, not assign to it: `!task.done`.',
            'The index tells React the position, not the identity - use `task.id`.',
            'A filter callback that always returns `true` is a smell: it is not filtering at all.',
          ],
          solution: `function OpenTasks({ tasks }) {
  const open = tasks.filter((task) => !task.done);

  return h('ul', null, open.map((task) => h('li', { key: task.id }, task.title)));
}
`,
          checks: [
            T.js(
              'renders only the open tasks',
              `(function () { const tasks = [{ id: 1, title: 'A', done: true }, { id: 2, title: 'B', done: false }, { id: 3, title: 'C', done: false }]; const items = __find(__render(OpenTasks, { tasks }), (n) => __isEl(n, 'li')); __must(items.length === 2, 'expected 2 open tasks, rendered ' + items.length); __must(__text(items) === 'BC', 'the open tasks are B and C, in order'); return true; })()`,
              'Filter with `!task.done` instead of assigning `task.done = false`.',
            ),
            T.js(
              'keys by id, not index',
              `(function () { const tasks = [{ id: 41, title: 'A', done: false }, { id: 55, title: 'B', done: false }]; const items = __find(__render(OpenTasks, { tasks }), (n) => __isEl(n, 'li')); __must(items.map((n) => n.key).join() === '41,55', 'expected keys 41 and 55, got ' + items.map((n) => n.key).join()); return true; })()`,
              'Use `key: task.id`.',
            ),
            T.js(
              'leaves the input array untouched',
              `(function () { const tasks = [{ id: 1, title: 'A', done: true }, { id: 2, title: 'B', done: false }]; const copy = JSON.stringify(tasks); __render(OpenTasks, { tasks }); __must(JSON.stringify(tasks) === copy, 'the tasks prop was modified - the filter callback is still writing to it'); return true; })()`,
              'Never assign to a prop or its objects.',
            ),
          ],
        },
        {
          id: 'write-summary',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'Write a pure function `summarise(tasks)` returning `{ total, done, open, byPriority }` where `byPriority` counts tasks per priority ' +
            'value, plus a `Summary({ tasks })` component that renders the derived numbers. The component must not keep any of them in state.',
          requirements: [
            '`summarise` returns counts - every value derived from the array, nothing stored',
            '`byPriority` has a key per priority that actually appears',
            '`Summary` renders `done` of `total` done and the number of open tasks',
            'The rendered numbers change when the `tasks` prop changes',
          ],
          starter: `function summarise(tasks) {\n  // Return { total, done, open, byPriority }.\n  return {};\n}\n\nfunction Summary({ tasks }) {\n  // Render the derived values.\n  return null;\n}\n`,
          hints: [
            '`const done = tasks.filter((t) => t.done).length;` then `total - done` for open.',
            'Build `byPriority` with `reduce`: `tasks.reduce((acc, t) => { acc[t.priority] = (acc[t.priority] || 0) + 1; return acc; }, {})`',
            'The component calls `summarise(tasks)` on every render - no `useState`, no `useEffect`.',
          ],
          solution: `function summarise(tasks) {
  const done = tasks.filter((task) => task.done).length;
  const byPriority = tasks.reduce((acc, task) => {
    acc[task.priority] = (acc[task.priority] || 0) + 1;
    return acc;
  }, {});

  return { total: tasks.length, done, open: tasks.length - done, byPriority };
}

function Summary({ tasks }) {
  const { total, done, open, byPriority } = summarise(tasks);

  return h('div', { className: 'summary' },
    h('p', { className: 'done' }, done + ' of ' + total + ' done'),
    h('p', { className: 'open' }, String(open) + ' open'),
    h('ul', null, Object.keys(byPriority).sort().map((priority) =>
      h('li', { key: priority }, priority + ': ' + byPriority[priority]))),
  );
}
`,
          checks: [
            T.js(
              'summarise counts correctly',
              `(function () {
  const tasks = [{ done: true, priority: 'low' }, { done: false, priority: 'high' }, { done: false, priority: 'high' }];
  const s = summarise(tasks);
  __must(s.total === 3 && s.done === 1 && s.open === 2, 'expected total 3, done 1, open 2 - got ' + JSON.stringify(s));
  __must(s.byPriority.high === 2 && s.byPriority.low === 1, 'byPriority should count each priority, got ' + JSON.stringify(s.byPriority));
  return true;
})()`,
              'Filter for `done`, and reduce into an object for `byPriority`.',
            ),
            T.js(
              'summarise does not mutate the input',
              `(function () { const tasks = [{ done: true, priority: 'low' }]; const copy = JSON.stringify(tasks); summarise(tasks); __must(JSON.stringify(tasks) === copy, 'summarise modified the array it was given'); return true; })()`,
              'Build a new object in `reduce` and never sort or assign the input.',
            ),
            T.js(
              'Summary renders the derived values',
              `(function () {
  const tree = __render(Summary, { tasks: [{ done: true, priority: 'low' }, { done: false, priority: 'high' }] });
  __must(__text(__byClass(tree, 'done')) === '1 of 2 done', 'the done line should read "1 of 2 done", got ' + JSON.stringify(__text(__byClass(tree, 'done'))));
  __must(__text(__byClass(tree, 'open')) === '1 open', 'the open line should read "1 open"');
  return true;
})()`,
              'Call `summarise(tasks)` during render and read the fields out.',
            ),
            T.js(
              'recomputes when props change',
              `(function () {
  const first = __render(Summary, { tasks: [{ done: true, priority: 'low' }] });
  const second = __render(Summary, { tasks: [{ done: false, priority: 'low' }, { done: false, priority: 'low' }] });
  __must(__text(__byClass(first, 'done')) === '1 of 1 done', 'the first render is wrong: ' + __text(__byClass(first, 'done')));
  __must(__text(__byClass(second, 'done')) === '0 of 2 done', 'the second render should recompute from the new prop, got ' + __text(__byClass(second, 'done')));
  return true;
})()`,
              'Whatever you render must come from `tasks` on this render, not from state.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'react-04',
      title: 'Effects, Fetching and Cleanup',
      minutes: 45,
      objectives: [
        'Fetch data in an effect without causing an infinite loop',
        'Guard against out-of-order responses and unmounted components',
        'Return a cleanup function so subscriptions and timers stop',
      ],
      sections: [
        {
          heading: 'An effect runs after the render it belongs to',
          body:
            '```js\nfunction UserCard({ id }) {\n  const [user, setUser] = useState(null);\n\n  useEffect(() => {\n    let active = true;\n    fetch(`/api/users/${id}`)\n      .then((res) => res.json())\n      .then((data) => { if (active) setUser(data); });\n    return () => { active = false; };\n  }, [id]);\n\n  if (!user) return h(\'p\', null, \'Loading...\');\n  return h(\'h2\', null, user.name);\n}\n```\n\n' +
            'The dependency array is a contract: re-run the effect when `id` changes, and run the cleanup for the previous `id` first. Leave the ' +
            'array out and you run after *every* render; pass an empty array and you run once.',
        },
        {
          heading: 'Cleanup is not optional',
          body:
            'Every subscription, timer, listener or abortable request needs a matching teardown. Returning a function from the effect is how you ' +
            'give it one:\n\n' +
            '```js\nuseEffect(() => {\n  const controller = new AbortController();\n  load(controller.signal);\n  return () => controller.abort();\n}, [url]);\n```\n\n' +
            'The same applies outside React: a function that subscribes should hand back the unsubscribe function. That is a *design* rule, ' +
            'not a React trick - and it is exactly what the challenge below tests.',
        },
        {
          heading: 'Races are the classic async bug',
          body:
            'If a user clicks A then B, B may resolve before A. Without a guard, A\'s late response overwrites B - the "wrong data on screen" ' +
            'bug. Two fixes:\n\n' +
            '- **Abort**: cancel the stale request with `AbortController`\n' +
            '- **Token**: tag each request and ignore any response that is not the newest\n\n' +
            '```js\nlet token = 0;\nreturn async function load(id) {\n  const mine = ++token;\n  const data = await fetcher(id);\n  if (mine !== token) return null;   // a newer load started\n  return data;\n};\n```',
        },
        {
          heading: 'You might not need an effect',
          body:
            'Before writing one, ask:\n\n' +
            '- Can I compute this during render? (yes - do that)\n' +
            '- Is this a response to a user event? (then it belongs in the handler)\n' +
            '- Am I syncing to an external system? (that is a real effect)\n\n' +
            'Fetching, subscriptions, timers, logging and imperative DOM work are real effects. Formatting a date, filtering a list and ' +
            'computing a total are not.',
        },
      ],
      pitfalls: [
        '`useEffect(async () => ...)` - the callback must not be `async`; declare an inner function instead',
        'Missing dependency, so the effect closes over a stale `id` or `url`',
        'Setting state after the component has gone, or after a newer request (no guard)',
        'Forgetting the cleanup, so timers and sockets accumulate on every navigation',
        'Fetching in an effect when the data is already in props',
      ],
      keyPoints: [
        'Effects run after render; the dependency array decides when they re-run',
        'Always return a cleanup for anything you start',
        'Guard async responses with an abort signal or a token so stale data cannot win',
      ],
      resources: [
        { label: 'react.dev: Synchronizing with Effects', url: 'https://react.dev/learn/synchronizing-with-effects' },
        { label: 'react.dev: You Might Not Need an Effect', url: 'https://react.dev/learn/you-might-not-need-an-effect' },
        { label: 'MDN: AbortController', url: 'https://developer.mozilla.org/en-US/docs/Web/API/AbortController' },
      ],
      challenges: [
        {
          id: 'write-load-user',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          async: true,
          prelude: REACT_PRELUDE,
          mockFetch: {
            '/api/users/1': { id: 1, name: 'Ama', company: { name: 'Kumasi Labs' } },
            '/api/users/2': { id: 2, name: 'Kofi', company: { name: 'Accra Digital' } },
          },
          prompt:
            'Write `async function loadUser(id)` that fetches `/api/users/<id>`, checks the response is ok, and resolves with only ' +
            '`{ name, company }` where `company` is the company *name*. A non-ok response must reject with an `Error` whose message includes ' +
            '`404`. This runs against a mock `fetch`, so it is fully offline.',
          requirements: [
            'Uses `fetch("/api/users/" + id)` and awaits it',
            'Throws when `response.ok` is false, with the status in the message',
            'Resolves with `{ name, company }` - company as a string, not the nested object',
            'Calling it with an unknown id rejects rather than resolving with bad data',
          ],
          starter: `async function loadUser(id) {\n  // Fetch and reshape the user here.\n}\n`,
          hints: [
            '`const res = await fetch("/api/users/" + id);`',
            '`if (!res.ok) throw new Error("Request failed with " + res.status);`',
            '`const data = await res.json(); return { name: data.name, company: data.company.name };`',
          ],
          solution: `async function loadUser(id) {
  const res = await fetch('/api/users/' + id);
  if (!res.ok) {
    throw new Error('Request failed with status ' + res.status);
  }
  const data = await res.json();
  return { name: data.name, company: data.company.name };
}
`,
          checks: [
            T.js(
              'resolves with the reshaped user',
              `(async function () { const user = await loadUser(1); __must(user.name === 'Ama', 'expected the name Ama, got ' + JSON.stringify(user.name)); __must(user.company === 'Kumasi Labs', 'company should be the nested company name, got ' + JSON.stringify(user.company)); return true; })()`,
              'Await `res.json()` and pull `data.company.name` out.',
            ),
            T.js(
              'works for another id',
              `(async function () { const user = await loadUser(2); __must(user.name === 'Kofi' && user.company === 'Accra Digital', 'expected Kofi from Accra Digital, got ' + JSON.stringify(user)); return true; })()`,
              'Build the URL from the id argument, not a hard-coded path.',
            ),
            T.js(
              'rejects for an unknown id',
              `(async function () { try { const user = await loadUser(999); throw new Error('it resolved with ' + JSON.stringify(user) + ' instead of rejecting'); } catch (err) { __must(/404/.test(err.message), 'the error message should mention 404, got ' + JSON.stringify(err.message)); return true; } })()`,
              'Check `res.ok` and `throw new Error("... " + res.status)`.',
            ),
          ],
        },
        {
          id: 'debug-subscription-leak',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 15,
          lang: 'js',
          prelude: REACT_PRELUDE + BUS_PRELUDE,
          prompt:
            '`watchPrice` subscribes to the price bus and calls the handler once immediately, but it never gives the caller a way to stop. ' +
            'Navitaging away from a screen leaves every old handler attached, so one price change fires six callbacks. Make it return an ' +
            'unsubscribe function that is safe to call more than once.',
          requirements: [
            '`watchPrice(symbol, handler)` returns a function',
            'Calling the returned function removes exactly that subscription',
            'The handler still fires once immediately with the latest price',
            'Calling the returned function twice does not throw',
          ],
          starter: `function watchPrice(symbol, handler) {
  __bus.subscribe(symbol, handler);
  handler(__bus.latest(symbol));
}
`,
          hints: [
            '`__bus.subscribe(...)` already returns the unsubscribe function - do not throw it away.',
            'Return it: `const unsubscribe = __bus.subscribe(...); ... return unsubscribe;`',
            'The bus removes by object identity and ignores a missing entry, so a second call is already safe.',
          ],
          solution: `function watchPrice(symbol, handler) {
  const unsubscribe = __bus.subscribe(symbol, handler);
  handler(__bus.latest(symbol));
  return unsubscribe;
}
`,
          checks: [
            T.js(
              'returns an unsubscribe function',
              `(function () { const stop = watchPrice('AAPL', function () {}); __must(typeof stop === 'function', 'watchPrice should return the unsubscribe function from __bus.subscribe'); stop(); return true; })()`,
              'Return the value `__bus.subscribe` gives you.',
            ),
            T.js(
              'unsubscribing stops the callbacks',
              `(function () {
  const before = __bus.subs.length;
  const seen = [];
  const stop = watchPrice('AAPL', (price) => seen.push(price));
  __must(__bus.subs.length === before + 1, 'the subscription was not registered');
  __must(seen.length === 1 && seen[0] === 191.2, 'the handler should be called once immediately with the latest price, saw ' + JSON.stringify(seen));
  stop();
  __must(__bus.subs.length === before, 'after calling the returned function the subscription should be gone');
  return true;
})()`,
              'Store the unsubscribe function and return it.',
            ),
            T.js(
              'unsubscribing twice is harmless',
              `(function () { const stop = watchPrice('AAPL', function () {}); stop(); stop(); return true; })()`,
              'It should be safe to call cleanup more than once - React does exactly that in strict mode.',
            ),
          ],
        },
        {
          id: 'write-stale-guard',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'js',
          async: true,
          prelude: REACT_PRELUDE,
          prompt:
            'Write `createLoader(fetcher)` that returns an async `load(id)`. Requests can resolve out of order, so a response that is no longer ' +
            'the newest must be discarded: return `null` instead of the data. The newest request always resolves with its own result, and the ' +
            'function is built from an injected `fetcher` so it can be tested with slow promises.',
          requirements: [
            '`createLoader(fetcher)` returns a function `load(id)`',
            'Each call tags itself and only the newest tag may resolve with data',
            'An older request that settles late resolves with `null`',
            'The loader is stateful across calls (closure), not a global',
          ],
          starter: `function createLoader(fetcher) {\n  return async function load(id) {\n    return fetcher(id);\n  };\n}\n`,
          hints: [
            'Keep a counter outside `load` but inside `createLoader`: `let token = 0;`',
            'At the start of each call: `const mine = ++token;`',
            'After awaiting: `if (mine !== token) return null;`',
          ],
          solution: `function createLoader(fetcher) {
  let token = 0;

  return async function load(id) {
    const mine = (token += 1);
    const data = await fetcher(id);
    if (mine !== token) return null;
    return data;
  };
}
`,
          checks: [
            T.js(
              'the newest request wins even when it resolves first',
              `(async function () {
  const pending = {};
  const fetcher = (id) => new Promise((resolve) => { pending[id] = () => resolve({ id }); });
  const load = createLoader(fetcher);
  const first = load(1);
  const second = load(2);
  pending[2]();
  pending[1]();
  const a = await first;
  const b = await second;
  __must(b && b.id === 2, 'the newest request should resolve with its own data');
  __must(a === null, 'the stale response should resolve with null, got ' + JSON.stringify(a));
  return true;
})()`,
              'Tag each call with an incrementing token and compare after the await.',
            ),
            T.js(
              'a single request still returns its data',
              `(async function () { const load = createLoader(async (id) => ({ id })); const only = await load(7); __must(only && only.id === 7, 'with no newer request the data should come through, got ' + JSON.stringify(only)); return true; })()`,
              'Do not return `null` unconditionally - only when a newer token exists.',
            ),
            T.js(
              'each loader keeps its own token',
              `(async function () {
  const loadA = createLoader(async (id) => ({ who: 'A', id }));
  const loadB = createLoader(async (id) => ({ who: 'B', id }));
  const a = await loadA(1);
  const b = await loadB(2);
  __must(a.who === 'A' && b.who === 'B', 'two loaders must not share state - the counter belongs inside createLoader');
  return true;
})()`,
              'Declare the counter inside `createLoader`, not at module scope.',
            ),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'react-05',
      title: 'Forms, Validation and Controlled Inputs',
      minutes: 40,
      objectives: [
        'Build controlled inputs whose value lives in state',
        'Handle submit, reset and validation without leaking data',
        'Keep validation in a pure function so it can be tested on its own',
      ],
      sections: [
        {
          heading: 'Controlled means state is the source of truth',
          body:
            '```js\nconst [title, setTitle] = useState(\'\');\n\nh(\'input\', {\n  value: title,\n  onChange: (event) => setTitle(event.target.value),\n});\n```\n\n' +
            'The input always shows exactly what state holds - which is what makes validation, formatting, resetting and undo trivial. ' +
            '`defaultValue` is the uncontrolled escape hatch: the DOM keeps the value, so React cannot read it without a ref, and "clear the ' +
            'form" becomes a DOM operation instead of `setTitle(\'\')`.',
        },
        {
          heading: 'One state object per form, updated immutably',
          body:
            '```js\nconst [values, setValues] = useState({ title: \'\', due: \'\' });\n\nfunction change(field) {\n  return (event) => setValues((prev) => ({ ...prev, [field]: event.target.value }));\n}\n```\n\n' +
            'Note three things: the updater form, the spread that copies the previous object, and the computed key. `values.title = x` would ' +
            'mutate the same object and render nothing.',
        },
        {
          heading: 'Validate on submit, show errors near the field',
          body:
            '```js\nfunction validate(values) {\n  const errors = {};\n  if (!values.title.trim()) errors.title = \'Title is required\';\n  if (values.title.length > 60) errors.title = \'Keep it under 60 characters\';\n  return errors;\n}\n```\n\n' +
            'A tiny pure function like this is the easiest thing in the world to unit test, and it keeps the component about rendering. On submit: ' +
            '`event.preventDefault()`, validate, and only call the parent callback when `Object.keys(errors).length === 0`.',
        },
      ],
      pitfalls: [
        'Using `defaultValue` and then wondering why the value is empty on submit',
        'Mutating the form object (`values.title = x`) so React sees no change',
        'Forgetting `event.preventDefault()`, so the browser navigates away and the app reloads',
        'Validating with `if (values.title)` when a value of `"   "` should count as empty',
        'Storing validation errors in state and letting them drift from the values',
      ],
      keyPoints: [
        'Controlled inputs: value from state, change writes back to state',
        'Update objects immutably with an updater function and a spread',
        'Keep validation in a pure `validate(values)` function returning an errors object',
      ],
      resources: [
        { label: 'react.dev: Reacting to Input with State', url: 'https://react.dev/learn/reacting-to-input-with-state' },
        { label: 'react.dev: <input> reference', url: 'https://react.dev/reference/react-dom/components/input' },
        { label: 'MDN: Client-side form validation', url: 'https://developer.mozilla.org/en-US/docs/Learn/Forms/Form_validation' },
      ],
      challenges: [
        {
          id: 'write-task-form',
          kind: 'write',
          difficulty: 'medium',
          minutes: 18,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'Write `TaskForm({ onSubmit })`: a controlled `input` (placeholder `New task`) whose value lives in state, a submit button labelled ' +
            '`Add`, and a form `onSubmit` that prevents the default, rejects an empty/whitespace title by rendering a `p` with ' +
            '`className: "error"` reading `Title is required`, and otherwise calls `onSubmit(title.trim())` and clears the input.',
          requirements: [
            'The input is controlled: `value` comes from state, `onChange` writes it back',
            'Submitting an empty or whitespace-only title shows the error and does NOT call `onSubmit`',
            'Submitting a valid title calls `onSubmit` with the trimmed value exactly once',
            'After a successful submit the input is empty again',
          ],
          starter: `function TaskForm({ onSubmit }) {\n  // Controlled input, error state and submit handler.\n  return null;\n}\n`,
          hints: [
            '`const [title, setTitle] = useState(""); const [error, setError] = useState("");`',
            '`onSubmit: (event) => { event.preventDefault(); ... }` - never forget `preventDefault`.',
            '`if (!title.trim()) { setError("Title is required"); return; }`',
          ],
          solution: `function TaskForm({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');

  function submit(event) {
    event.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    onSubmit(title.trim());
    setTitle('');
    setError('');
  }

  return h('form', { onSubmit: submit },
    h('input', {
      placeholder: 'New task',
      value: title,
      onChange: (event) => setTitle(event.target.value),
    }),
    error ? h('p', { className: 'error' }, error) : null,
    h('button', { type: 'submit' }, 'Add'),
  );
}
`,
          checks: [
            T.js(
              'the input is controlled',
              `(function () {
  let tree = __render(TaskForm, { onSubmit: function () {} });
  const input = () => __byType(__render(TaskForm, { onSubmit: function () {} }), 'input');
  __must(__byType(tree, 'input'), 'render an <input>');
  __must(input().props.value !== undefined && input().props.defaultValue === undefined, 'the input must be controlled: use value, not defaultValue');
  __change(input(), 'Write tests');
  __must(input().props.value === 'Write tests', 'typing should land in state and come back as the value prop, got ' + JSON.stringify(input().props.value));
  return true;
})()`,
              'Set `value: title` and update it in `onChange`.',
            ),
            T.js(
              'an empty title is rejected',
              `(function () {
  const calls = [];
  let tree = __render(TaskForm, { onSubmit: (v) => calls.push(v) });
  __byType(tree, 'form').props.onSubmit({ preventDefault: function () {} });
  tree = __render(TaskForm, { onSubmit: (v) => calls.push(v) });
  __must(calls.length === 0, 'an empty title must not call onSubmit, got ' + JSON.stringify(calls));
  __must(__text(__byClass(tree, 'error')) === 'Title is required', 'show a <p className="error">Title is required</p>');
  return true;
})()`,
              'Check `!title.trim()` first and `return` before calling `onSubmit`.',
            ),
            T.js(
              'a valid title is trimmed and submitted',
              `(function () {
  const calls = [];
  let tree = __render(TaskForm, { onSubmit: (v) => calls.push(v) });
  __change(__byType(tree, 'input'), '   Ship it   ');
  tree = __render(TaskForm, { onSubmit: (v) => calls.push(v) });
  __byType(tree, 'form').props.onSubmit({ preventDefault: function () {} });
  __must(calls.length === 1, 'onSubmit should fire exactly once, fired ' + calls.length + ' time(s)');
  __must(calls[0] === 'Ship it', 'pass the trimmed title, got ' + JSON.stringify(calls[0]));
  tree = __render(TaskForm, { onSubmit: (v) => calls.push(v) });
  __must(__byType(tree, 'input').props.value === '', 'clear the input after a successful submit, got ' + JSON.stringify(__byType(tree, 'input').props.value));
  return true;
})()`,
              '`onSubmit(title.trim())` then `setTitle("")`.',
            ),
          ],
        },
        {
          id: 'debug-uncontrolled-form',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'This form never updates what it displays and submits stale values. The input keeps its own DOM state (`defaultValue`) and the ' +
            'change handler writes directly into the state object instead of replacing it. Make it a proper controlled form.',
          requirements: [
            'The input uses `value` (controlled), not `defaultValue`',
            'The value shown updates as the user types',
            'State is replaced, not mutated: a fresh object each change',
            'Submit passes the current title out through `onSubmit`',
          ],
          starter: `function TaskForm({ onSubmit }) {
  const [values, setValues] = useState({ title: '' });

  return h('form', {
    onSubmit: (event) => {
      event.preventDefault();
      onSubmit(values);
    },
  },
    h('input', {
      defaultValue: values.title,
      onChange: (event) => { values.title = event.target.value; },
    }),
    h('button', { type: 'submit' }, 'Add'),
  );
}
`,
          hints: [
            'Two bugs: `defaultValue` means the DOM owns the value, and `values.title = ...` keeps the same object.',
            'Use `value: values.title` and `setValues((prev) => ({ ...prev, title: event.target.value }))`.',
            'Spreading into a new object gives React a new reference, which is what triggers the render.',
          ],
          solution: `function TaskForm({ onSubmit }) {
  const [values, setValues] = useState({ title: '' });

  return h('form', {
    onSubmit: (event) => {
      event.preventDefault();
      onSubmit(values);
    },
  },
    h('input', {
      value: values.title,
      onChange: (event) => setValues((prev) => ({ ...prev, title: event.target.value })),
    }),
    h('button', { type: 'submit' }, 'Add'),
  );
}
`,
          checks: [
            T.js(
              'the input is controlled',
              `(function () { const tree = __render(TaskForm, { onSubmit: function () {} }); const input = __byType(tree, 'input'); __must(input.props.value !== undefined, 'use the value prop so state drives the input'); __must(input.props.defaultValue === undefined, 'remove defaultValue - the DOM must not own the value'); return true; })()`,
              'Replace `defaultValue` with `value: values.title`.',
            ),
            T.js(
              'typing updates the displayed value',
              `(function () { let tree = __render(TaskForm, { onSubmit: function () {} }); __change(__byType(tree, 'input'), 'Fix the leak'); tree = __render(TaskForm, { onSubmit: function () {} }); __must(__byType(tree, 'input').props.value === 'Fix the leak', 'the value prop should follow what was typed, got ' + JSON.stringify(__byType(tree, 'input').props.value)); return true; })()`,
              'Call `setValues` with a new object so React re-renders.',
            ),
            T.js(
              'submit reports the current value',
              `(function () {
  const calls = [];
  let tree = __render(TaskForm, { onSubmit: (v) => calls.push(v) });
  __change(__byType(tree, 'input'), 'Ship it');
  tree = __render(TaskForm, { onSubmit: (v) => calls.push(v) });
  __byType(tree, 'form').props.onSubmit({ preventDefault: function () {} });
  __must(calls.length === 1 && calls[0].title === 'Ship it', 'onSubmit should receive { title: "Ship it" }, got ' + JSON.stringify(calls));
  return true;
})()`,
              'Because the value now lives in state, `values` on the next render is current.',
            ),
            T.js(
              'state is replaced, not mutated',
              `(function () { let tree = __render(TaskForm, { onSubmit: function () {} }); __change(__byType(tree, 'input'), 'a'); tree = __render(TaskForm, { onSubmit: function () {} }); __change(__byType(tree, 'input'), 'ab'); tree = __render(TaskForm, { onSubmit: function () {} }); __must(__byType(tree, 'input').props.value === 'ab', 'expected "ab" after two changes, got ' + JSON.stringify(__byType(tree, 'input').props.value)); return true; })()`,
              'Use `setValues((prev) => ({ ...prev, title: value }))`.',
            ),
          ],
        },
        {
          id: 'write-validate',
          kind: 'write',
          difficulty: 'easy',
          minutes: 12,
          lang: 'js',
          prelude: REACT_PRELUDE,
          prompt:
            'Write a pure `validate(values)` returning an errors object. Rules: `title` is required after trimming and must be 60 characters ' +
            'or fewer; `priority` must be one of `low`, `medium`, `high` (default to `medium` when missing); `due` must be a valid date string ' +
            'if provided. A valid form returns an object with no keys.',
          requirements: [
            'Whitespace-only titles are invalid',
            'Titles over 60 characters are invalid',
            'A missing priority is treated as `medium`; anything else outside the three values is an error',
            '`due` is only checked when provided, and must parse to a real date',
            'A valid form returns `{}`',
          ],
          starter: `function validate(values) {\n  return {};\n}\n`,
          hints: [
            'Start with `const errors = {};` and add keys as you find problems.',
            'Trim once: `const title = (values.title || "").trim();`',
            'Check the date with `Number.isNaN(new Date(values.due).getTime())`.',
          ],
          solution: `function validate(values) {
  const errors = {};
  const title = (values.title || '').trim();
  const priority = values.priority || 'medium';

  if (!title) errors.title = 'Title is required';
  else if (title.length > 60) errors.title = 'Keep the title under 60 characters';

  if (['low', 'medium', 'high'].indexOf(priority) === -1) {
    errors.priority = 'Priority must be low, medium or high';
  }

  if (values.due && Number.isNaN(new Date(values.due).getTime())) {
    errors.due = 'Due date must be a valid date';
  }

  return errors;
}
`,
          checks: [
            T.js(
              'a valid form has no errors',
              `(function () { const errors = validate({ title: 'Ship it', priority: 'high', due: '2026-01-31' }); __must(Object.keys(errors).length === 0, 'expected no errors, got ' + JSON.stringify(errors)); return true; })()`,
              'Only add keys when a rule is broken.',
            ),
            T.js(
              'catches empty and over-long titles',
              `(function () { const empty = validate({ title: '   ' }); __must(empty.title, 'a whitespace-only title must be an error, got ' + JSON.stringify(empty)); const long = validate({ title: new Array(62).join('x') }); __must(long.title, 'a 61-character title must be an error, got ' + JSON.stringify(long)); const ok = validate({ title: new Array(60).join('x') }); __must(!ok.title, 'exactly 60 characters is allowed, got ' + JSON.stringify(ok)); return true; })()`,
              'Trim before checking, and use `> 60`.',
            ),
            T.js(
              'validates the priority',
              `(function () { __must(Object.keys(validate({ title: 'x' })).length === 0, 'a missing priority should default to medium'); __must(validate({ title: 'x', priority: 'urgent' }).priority, 'priority "urgent" must be rejected'); __must(!validate({ title: 'x', priority: 'low' }).priority, 'priority "low" is valid'); return true; })()`,
              'Default with `values.priority || "medium"` and test membership.',
            ),
            T.js(
              'validates the due date only when present',
              `(function () { __must(Object.keys(validate({ title: 'x' })).length === 0, 'an omitted due date is fine'); __must(validate({ title: 'x', due: 'not-a-date' }).due, 'an unparseable due date must be rejected'); __must(!validate({ title: 'x', due: '2026-04-01' }).due, 'a real date is valid'); return true; })()`,
              '`Number.isNaN(new Date(values.due).getTime())` tells you it is invalid.',
            ),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'react-capstone',
    title: 'Capstone: build a task manager SPA',
    minutes: 360,
    brief:
      'Build the React front end for the task API you wrote in the Express and SQL modules: a small but complete single-page app with routing, ' +
      'data fetching, optimistic updates and real error states.\\n\\n' +
      'This is the project that makes the module real - no tutorial follows you here. Plan the component tree and the data flow *before* you ' +
      'write code, then build it in vertical slices: list, then create, then edit, then filter, then ship.',
    starter: `task-app/
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── api/
│   │   └── tasks.js
│   ├── hooks/
│   │   ├── useTasks.js
│   │   └── useForm.js
│   ├── components/
│   │   ├── TaskList.jsx
│   │   ├── TaskItem.jsx
│   │   └── TaskForm.jsx
│   └── routes/
│       ├── TasksPage.jsx
│       └── TaskDetailPage.jsx
└── README.md`,
    requirements: [
      'A component tree you can draw on paper, with each component taking props and returning elements only',
      'State lives in the lowest common ancestor; components below are presentational',
      'At least one custom hook (`useTasks`) that owns fetching, loading, error and mutation state',
      'Routes for the list and for a single task, with a not-found state',
      'Create, complete and delete a task, each updating the UI without a full reload',
      'Optimistic update on complete: the checkbox flips immediately, and rolls back on failure',
      'Loading, empty and error states for every async view - all three, not just the happy path',
      'A controlled form with validation reusing your `validate` function from the lesson',
      'Keys from ids everywhere; no index keys; no mutation of props or state',
      'Every list derivation (filter, sort, count) computed during render, never stored',
      'At least 6 components under 80 lines each - if one grows past that, split it',
      'A `README.md` with the component tree, the data flow, and the API contract you depend on',
    ],
    checks: [
      'Draw the component tree before writing code - the README contains it',
      'Grep the source for `.push(`, `= event.target.value;` and `key={index}`: none of the state-mutating or index-key patterns appear',
      'Delete a task: the row disappears immediately, and reappears with an error toast if the request fails',
      'Complete a task while offline (DevTools "offline"): the checkbox rolls back',
      'A stale fetch cannot overwrite a newer one - navigate quickly between two tasks and confirm the right data is shown',
      'Filter and sort during render only: no `useState` holds a derived list',
      'Nothing subscribes without cleaning up: no warning about setting state on an unmounted component',
      'Reload on a nested route: the app still renders the right page',
      'Submit an empty form: validation message appears, no network request fires',
      'Lighthouse accessibility score of 90+ on the list page',
    ],
    stretch: [
      'Add `useReducer` for the task collection and explain when it beat `useState`',
      'Add virtualised rendering for 5,000 tasks and measure the difference',
      'Add context for the theme, with a toggle that survives a reload',
      'Add a keyboard-only path for create, complete and delete with focus management',
      'Port the app to React Server Components (Next.js) and write down what moved off the client',
      'Write component tests with Testing Library covering the rollback path',
    ],
  },
};
