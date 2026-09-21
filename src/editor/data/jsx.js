/**
 * React / JSX extras for the next-UI completion superset (overhaul §8.9, task
 * 2.7: "React/JSX tags for the React modules").
 *
 * The curriculum has a React module whose challenges are `jsx`, so this is the
 * data for the language learners actually write there: hooks, the JSX-specific
 * props (`className`, not `class`; `onClick`, not `onclick`) and the element
 * names they will reach for. It is merged over `src/core/complete.js`'s JS data
 * by `src/editor/completions.js`, so a `jsx` file gets both.
 *
 * Entries are `[label, insert, detail, caret?]` — `caret` is the offset from the
 * start of the insertion where the caret should land.
 */
export const JSX_HOOKS = [
  ['useState', 'const [value, setValue] = useState(initial);', 'state in a function component', 7],
  ['useEffect', 'useEffect(() => {\n  \n}, []);', 'run after render', 20],
  ['useRef', 'const ref = useRef(null);', 'a mutable ref', 4],
  ['useMemo', 'const value = useMemo(() => compute(), [deps]);', 'memoise a value', 7],
  ['useCallback', 'const handler = useCallback(() => {\n  \n}, [deps]);', 'memoise a callback', 18],
  ['useReducer', 'const [state, dispatch] = useReducer(reducer, initial);', 'state with a reducer', 7],
  ['useContext', 'const value = useContext(Context);', 'read a context', 7],
  ['useId', 'const id = useId();', 'a stable id for a11y', 4],
  ['useLayoutEffect', 'useLayoutEffect(() => {\n  \n}, []);', 'before paint', 18],
  ['useTransition', 'const [pending, startTransition] = useTransition();', 'non-urgent updates', 7],
];

export const JSX_PROPS = [
  ['className', 'className=""', 'the CSS class (not `class`)', 11],
  ['htmlFor', 'htmlFor=""', 'label target (not `for`)', 9],
  ['onClick', 'onClick={() => {}}', 'click handler', 12],
  ['onChange', 'onChange={(event) => {}}', 'input change', 12],
  ['onSubmit', 'onSubmit={(event) => {\n    event.preventDefault();\n  }}', 'form handler', 11],
  ['onKeyDown', 'onKeyDown={(event) => {}}', 'key press', 11],
  ['onBlur', 'onBlur={() => {}}', 'focus left', 9],
  ['value', 'value={value}', 'controlled value', 7],
  ['defaultValue', 'defaultValue={value}', 'uncontrolled value', 14],
  ['checked', 'checked={checked}', 'controlled checkbox', 9],
  ['key', 'key={item.id}', 'list identity', 5],
  ['ref', 'ref={ref}', 'DOM or value ref', 5],
  ['style', 'style={{ }}', 'inline styles', 8],
  ['disabled', 'disabled={disabled}', 'disable a control', 10],
  ['type', 'type="button"', 'button input type', 6],
  ['placeholder', 'placeholder="Search"', 'input hint', 13],
  ['aria-label', 'aria-label="Description"', 'accessible name', 12],
  ['role', 'role="button"', 'ARIA role', 6],
  ['dangerouslySetInnerHTML', 'dangerouslySetInnerHTML={{ __html: html }}', 'inject HTML (careful)', 29],
  ['data-testid', 'data-testid="thing"', 'test hook', 12],
];

export const JSX_ELEMENTS = [
  'Fragment', 'StrictMode', 'Suspense', 'React', 'ReactDOM', 'createRoot',
  'Provider', 'Consumer', 'Outlet', 'Link', 'Routes', 'Route', 'BrowserRouter',
];

export const JSX_SNIPPETS = [
  ['component', 'function Component({ props }) {\n  return (\n    <div>{props}</div>\n  );\n}', 'function component'],
  ['usestate', 'const [value, setValue] = useState(initial);', 'state hook'],
  ['useeffect', 'useEffect(() => {\n  \n}, []);', 'effect hook'],
  ['list', '{items.map((item) => (\n  <li key={item.id}>{item.name}</li>\n))}', 'render a list'],
  ['conditional', '{condition && <p>shown</p>}', 'render conditionally'],
  ['fragment', '<>\n  \n</>', 'fragment shorthand'],
  ['createRoot', "const root = createRoot(document.getElementById('root'));\nroot.render(<App />);", 'mount a React app'],
];

