import { T } from '../core/grade.js';

/**
 * These challenges run the learner's code with a real `python3` interpreter
 * (`python3 -I -B`, isolated mode) via core/pyrun.js. When python3 is not
 * installed the challenges degrade to a friendly "install Python" note
 * instead of failures - the same graceful contract as the git sandbox.
 */
export default {
  id: 'python',
  title: 'Python',
  badge: 'PY',
  color: 'star',
  tagline: 'The scripting language every fullstack developer leans on eventually',
  hours: 10,
  why:
    'Python is the glue of the industry: data pipelines, build scripts, cloud tooling, AI work and "let me automate that" all happen here. ' +
    'You already know how to program - this module is the fast translation course from JavaScript thinking to Python thinking, plus the ' +
    'standard library tricks that make people reach for Python in the first place.',
  source: {
    course: 'MIT 6.0001 - Introduction to CS and Programming in Python',
    url: 'https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/',
    roadmap: 'https://roadmap.sh/python',
    docs: 'https://docs.python.org/3/tutorial/',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'py-01',
      title: 'Python in 90 Seconds (for JS Developers)',
      minutes: 25,
      objectives: [
        'Read and execute Python using what you already know from JavaScript',
        'Map lists, dicts, loops and f-strings onto familiar JS concepts',
        'Use capture() so the checker can assert on your values',
      ],
      sections: [
        {
          heading: 'The mental translation table',
          body:
            '- `// comment` -> `# comment`\n' +
            '- `console.log(x)` -> `print(x)`\n' +
            '- `===` -> `==` (Python has no triple equals; `is` checks identity, not equality)\n' +
            '- `&&` `||` `!` -> `and` `or` `not`\n' +
            '- `` `total: ${n}` `` -> `f"total: {n}"`\n' +
            '- `null` -> `None` (there is no `undefined`; a missing name is a `NameError`)\n' +
            '- `arr.length` -> `len(arr)`\n' +
            '- `arr.push(x)` -> `arr.append(x)`\n' +
            '- `arr.map(f)` / `.filter(f)` -> `[f(x) for x in arr]` / `[x for x in arr if p(x)]`\n' +
            '- `Object.keys(o)` -> `o.keys()` (a view, wrap in `list(...)`)\n' +
            '- `const x = 1` -> `x = 1` (names are just bindings; convention shouts CONSTANT_CASE)\n\n' +
            'Two structural differences matter more than any single token: **indentation is the syntax** (no braces, and inconsistent ' +
            'indent is an `IndentationError`, not a style opinion), and blocks end with a **colon** - `if x:` `def f():` `for x in xs:`.',
        },
        {
          heading: 'Sample code: the daily carry',
          body: 'Variables, lists, dicts, a loop and a comprehension in one small program.',
          code: {
            lang: 'py',
            caption: 'first_steps.py',
            source: `stack = ["html", "css", "js"]
hours = {"html": 8, "css": 10, "js": 30}

# f-strings are template literals
print(f"learning {len(stack)} things across {sum(hours.values())} hours")

for i, topic in enumerate(stack, start=1):
    print(f"{i}. {topic}")

# a list comprehension is map + filter in one line
long_names = [t.upper() for t in stack if len(t) > 3]
print(long_names)  # ['HTML'] - css and js are too short

# dicts are objects; .get() is the safe lookup
print(hours.get("rust", 0))  # 0, no KeyError`,
          },
        },
        {
          heading: 'How these challenges run',
          body:
            'Your code is executed with a real `python3` interpreter in isolated mode (`-I -B`: no user packages, no bytecode cache) ' +
            'from a throwaway directory. Two consequences:\n\n' +
            '- Standard library only. No `pip install` - if a challenge needs it, it is already imported for you.\n' +
            '- The checker cannot see your variables unless you hand them over. Call **`capture(name, value)`** and the value is ' +
            'recorded and asserted back in the grader, e.g. `capture("evens", [n for n in nums if n % 2 == 0])`.\n\n' +
            'Expression checks can also read top-level names directly: if the check says "words contains 11 items", it evaluates ' +
            '`len(words) == 11` in your module. Top-level assignments are visible; names inside a function are not.',
        },
        {
          heading: 'Where Python beats JS at its own game',
          body:
            'Text and file processing is where Python feels unfair. Compare reading a file and counting words:\n\n' +
            'JavaScript needs `fs`, a callback or `readFileSync`, and `.split(/\\s+/)`. Python gives you the `with open(...)` block, ' +
            'string methods that do the heavy lifting, and `collections.Counter` which turns the whole problem into one line. ' +
            'You will meet all of those in the next lesson.',
        },
      ],
      pitfalls: [
        'Forgetting the colon after `if`/`for`/`def` - the single most common first-day error',
        'Mixing tabs and spaces: both look identical, Python refuses to guess',
        'Using `=` (assignment) where you meant `==` (comparison)',
        '`range(5)` is 0..4 - five numbers, never including the stop value',
        'Reassigning a builtin (`list = [1,2]`) and then wondering why `list()` crashes',
      ],
      keyPoints: [
        'Indentation is syntax; blocks start with a colon',
        'f-strings, list comprehensions, `len()`, `.append()`, `None`',
        '`capture(name, value)` records a value for the checker',
        'Top-level names are visible to expression checks',
      ],
      resources: [
        { label: 'The official Python tutorial', url: 'https://docs.python.org/3/tutorial/' },
        { label: 'Automate the Boring Stuff (free book)', url: 'https://automatetheboringstuff.com/' },
        { label: 'Python Tutor - visualise execution', url: 'https://pythontutor.com/' },
      ],
      challenges: [
        {
          id: 'fix-fahrenheit',
          kind: 'debug',
          difficulty: 'easy',
          minutes: 8,
          lang: 'py',
          prompt:
            'This conversion script refuses to run at all. Fix the syntax error, then make sure every temperature is captured: ' +
            'add one `capture("conversions", ...)` call that records the list of formatted strings like `"30C is 86.0F"`.',
          requirements: [
            'The loop prints one line per temperature',
            'to_f(100) is 212.0 and to_f(0) is 32.0',
            'capture("conversions", ...) records all four formatted strings',
          ],
          starter: `celsius = [0, 15, 30, 100]

def to_f(c):
    return c * 9 / 5 + 32

# print each conversion with an f-string
for c in celsius
    print(f"{c}C is {to_f(c)}F")
`,
          hints: [
            'The error message points at the line: what character ends the header of every `for` block?',
            'Python is pickier than JS here - a block header always ends with `:`',
            'The capture goes after the loop: capture("conversions", [f"{c}C is {to_f(c)}F" for c in celsius])',
          ],
          solution: `celsius = [0, 15, 30, 100]

def to_f(c):
    return c * 9 / 5 + 32

for c in celsius:
    print(f"{c}C is {to_f(c)}F")

capture("conversions", [f"{c}C is {to_f(c)}F" for c in celsius])
`,
          checks: [
            T.py('to_f(100) is 212.0', 'to_f(100) == 212.0'),
            T.py('to_f(0) is 32.0', 'to_f(0) == 32.0'),
            T.py('all four conversions captured', {
              name: 'conversions',
              fn: (v) =>
                Array.isArray(v) && v.length === 4 && v[2] === '30C is 86.0F' && v[3] === '100C is 212.0F'
                  ? true
                  : 'expected the list ["0C is 32.0F", "15C is 59.0F", "30C is 86.0F", "100C is 212.0F"]',
            }),
          ],
        },
        {
          id: 'write-word-stats',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'py',
          prompt:
            'Working copy-editor mode: `text` holds a paragraph. Split it into words and record three values with `capture()`:\n' +
            '- `capture("count", ...)` - total number of words\n' +
            '- `capture("unique", ...)` - number of distinct words (case matters: "The" != "the" here)\n' +
            '- `capture("longest", ...)` - the longest word\n' +
            'Name your word list `words` at the top level - the checker reads it directly.',
          requirements: [
            '`words` is the top-level list of words from text.split()',
            'capture("count") is 12, capture("unique") is 11',
            'capture("longest") is "sleepy"',
          ],
          starter: `text = """the quick brown fox jumps over a very sleepy dog the end"""

words = text.split()

# capture("count", ...)
# capture("unique", ...)
# capture("longest", ...)
`,
          hints: [
            'text.split() with no arguments splits on any whitespace and drops the newlines',
            'set(words) removes duplicates; len() counts either',
            'max(words, key=len) returns the longest word',
          ],
          solution: `text = """the quick brown fox jumps over a very sleepy dog the end"""

words = text.split()

capture("count", len(words))
capture("unique", len(set(words)))
capture("longest", max(words, key=len))
`,
          checks: [
            T.py('split produced the word list', {
              name: 'count',
              fn: (v) => (v === 12 ? true : `expected 12 words, got ${JSON.stringify(v)}`),
            }),
            T.py('unique counts 11 distinct words', {
              name: 'unique',
              fn: (v) => (v === 11 ? true : `expected 11 unique words, got ${JSON.stringify(v)}`),
            }),
            T.py('longest word is sleepy', {
              name: 'longest',
              fn: (v) => (v === 'sleepy' ? true : `expected "sleepy", got ${JSON.stringify(v)}`),
            }),
            T.py('words is the top-level split list', {
              expr: 'isinstance(words, list) and len(words) == 12 and words[0] == "the"',
            }),
          ],
        },
      ],
    },
    // ---------------------------------------------------------------------
    {
      id: 'py-02',
      title: 'Files, Functions and the Standard Library',
      minutes: 30,
      objectives: [
        'Define functions with def, defaults and multiple returns',
        'Read and parse structured data with json and string methods',
        'Handle failure with try/except instead of crashing',
      ],
      sections: [
        {
          heading: 'Functions the Python way',
          body:
            '- `def name(arg, default=3):` declares; `return` may hand back several values at once: `return lo, hi` (a tuple that unpacks)\n' +
            '- Keyword arguments make calls self-documenting: `resize(w, h=720, fit="cover")`\n' +
            '- No `=>` shorthand - but `lambda x: x * 2` covers tiny one-expression functions\n' +
            '- Docstrings live right under the `def` line and power `help()`\n\n' +
            'A warning from production code: **never use a mutable default** (`def add(item, cart=[])`). The list is created once ' +
            'and shared across every call. Use `cart=None` and create inside.',
        },
        {
          heading: 'Sample code: reading real files',
          body: 'The `with` block closes the file even if parsing blows up - treat it as the only way to open files.',
          code: {
            lang: 'py',
            caption: 'process.py',
            source: `import json
from collections import Counter

def load(path):
    """Return parsed JSON or None if the file is unusable."""
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None

def top_words(text, n=3):
    words = [w.lower() for w in text.split()]
    return Counter(words).most_common(n)

print(top_words("a b a c a b"))  # [('a', 3), ('b', 2), ('c', 1)]`,
          },
        },
        {
          heading: 'Errors are handled, not ignored',
          body:
            '- `try / except ValueError:` is `try / catch` - catch the **specific** type, never a bare `except:`\n' +
            '- `raise ValueError("bad input")` throws; custom messages travel with the error\n' +
            '- `finally:` runs either way (cleanup)\n' +
            '- The usual suspects: `ValueError` (bad value), `KeyError` (missing dict key), `IndexError`, `TypeError`, `ZeroDivisionError`\n\n' +
            'Unlike JS, where a missing property is `undefined`, a missing dict key is a crash: `user["age"]` raises `KeyError`, ' +
            '`user.get("age")` returns `None`. Choose deliberately.',
        },
        {
          heading: 'Batteries included',
          body:
            '- `json` - load/dump, the same job JSON does in JS\n' +
            '- `csv` - row-by-row reading of spreadsheets and exports\n' +
            '- `pathlib.Path` - file paths as objects (`Path("log.txt").read_text()`)\n' +
            '- `collections.Counter` - counts things; `.most_common(n)` sorts them\n' +
            '- `datetime` - dates, times, formatting\n\n' +
            'The rule of thumb: before you write a utility function, check whether the standard library already ships it. ' +
            'It very often does, tested and documented.',
        },
      ],
      pitfalls: [
        'Mutable default arguments shared across calls (`def f(x, acc=[])`)',
        'Bare `except:` swallowing the bug you needed to see',
        'Reading a file without `with` and leaking the handle',
        '`/` is float division even for ints - use `//` when you want floor division',
        '`u.age` on a dict: attribute access does not work, you need `u["age"]`',
      ],
      keyPoints: [
        'def + return; multiple returns unpack',
        'with open(...) as f: - always',
        'try/except with specific exception types; raise for bad input',
        'json, csv, pathlib, Counter - check the stdlib first',
      ],
      resources: [
        { label: 'stdlib reference', url: 'https://docs.python.org/3/library/index.html' },
        { label: 'Errors and exceptions tutorial', url: 'https://docs.python.org/3/tutorial/errors.html' },
        { label: 'collections.Counter how-to', url: 'https://docs.python.org/3/library/collections.html#counter-objects' },
      ],
      challenges: [
        {
          id: 'fix-json-loader',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'py',
          prompt:
            'This "find the oldest user" helper was written by someone half-remembering JavaScript. It has three separate bugs. ' +
            'Fix them so `oldest_user(RAW)` returns the right dict and `oldest_user` of an empty user list returns `None`.',
          requirements: [
            'oldest_user(RAW) returns the Grace dict (age 45)',
            'oldest_user of an empty user list returns None instead of crashing',
            'dict values are read with ["name"], not .name',
          ],
          starter: `import json

RAW = '{"users": [{"name": "Ada", "age": 36}, {"name": "Grace", "age": 45}]}'

def oldest_user(raw):
    data = json.loads(raw)
    best = None
    for u in data["users"]
        if u.age > best.age:
            best = u
    return best

capture("oldest", oldest_user(RAW))
`,
          hints: [
            'Run it and read the FIRST error - Python reports one bug at a time, in order',
            'A block header needs its colon; dict values use ["age"] not .age',
            'Comparing against best.age crashes when best is still None - compare carefully on the first pass',
          ],
          solution: `import json

RAW = '{"users": [{"name": "Ada", "age": 36}, {"name": "Grace", "age": 45}]}'

def oldest_user(raw):
    data = json.loads(raw)
    best = None
    for u in data["users"]:
        if best is None or u["age"] > best["age"]:
            best = u
    return best

capture("oldest", oldest_user(RAW))
`,
          checks: [
            T.py('oldest is Grace', {
              name: 'oldest',
              fn: (v) => (v && v.name === 'Grace' && v.age === 45 ? true : `expected Grace/45, got ${JSON.stringify(v)}`),
            }),
            T.py('returns the dict for RAW', `oldest_user(RAW)["name"] == "Grace" and oldest_user(RAW)["age"] == 45`),
            T.py('empty user list gives None', `oldest_user('{"users": []}') is None`),
            T.py('a one-user list still works', `oldest_user('{"users": [{"name": "Lin", "age": 20}]}')["name"] == "Lin"`),
          ],
        },
        {
          id: 'write-log-report',
          kind: 'write',
          difficulty: 'hard',
          minutes: 18,
          lang: 'py',
          prompt:
            'Ops hand-off time. `LOG` is a list of lines in `"LEVEL message"` form. Build a report and record it:\n' +
            '- `counts` - a dict mapping each level to how many lines it has\n' +
            '- `error_msgs` - a list of just the message part of every ERROR line, in order\n' +
            'Keep `counts` as a top-level name too - one of the checks reads it directly.',
          requirements: [
            'counts equals {"INFO": 3, "ERROR": 2, "WARN": 1}',
            'capture("error_msgs") is the two "Disk full..." messages in order',
            'counts.get("WARN") is 1',
          ],
          starter: `LOG = [
    "INFO Boot sequence started",
    "ERROR Disk full on /var",
    "INFO Cache warmed in 120ms",
    "WARN Retrying request 3 of 5",
    "ERROR Disk full on /backup",
    "INFO Shutdown complete",
]

counts = {}

# capture("counts", counts)
# capture("error_msgs", ...)
`,
          hints: [
            'line.split(" ", 1) gives ["ERROR", "Disk full on /var"] - the maxsplit keeps the message whole',
            'counts[level] = counts.get(level, 0) + 1 is the classic tally idiom',
            'A dict literal works too; do not overthink the shape - keys are the level strings',
          ],
          solution: `LOG = [
    "INFO Boot sequence started",
    "ERROR Disk full on /var",
    "INFO Cache warmed in 120ms",
    "WARN Retrying request 3 of 5",
    "ERROR Disk full on /backup",
    "INFO Shutdown complete",
]

counts = {}
error_msgs = []
for line in LOG:
    level, msg = line.split(" ", 1)
    counts[level] = counts.get(level, 0) + 1
    if level == "ERROR":
        error_msgs.append(msg)

capture("counts", counts)
capture("error_msgs", error_msgs)
`,
          checks: [
            T.py('counts tallies every level', {
              name: 'counts',
              fn: (v) =>
                v && v.INFO === 3 && v.ERROR === 2 && v.WARN === 1
                  ? true
                  : `expected {"INFO": 3, "ERROR": 2, "WARN": 1}, got ${JSON.stringify(v)}`,
            }),
            T.py('error messages extracted in order', {
              name: 'error_msgs',
              fn: (v) =>
                Array.isArray(v) && v.length === 2 && v[0] === 'Disk full on /var' && v[1] === 'Disk full on /backup'
                  ? true
                  : `expected the two Disk full messages, got ${JSON.stringify(v)}`,
            }),
            T.py('counts is a plain dict with WARN 1', `isinstance(counts, dict) and counts.get("WARN") == 1`),
          ],
        },
        {
          id: 'write-inventory',
          kind: 'write',
          difficulty: 'medium',
          minutes: 15,
          lang: 'py',
          prompt:
            'Two functions manage a tiny shop inventory (`inventory` is already defined):\n' +
            '- `sell(item, qty)` - reduce the stock and return the remaining amount. Unknown items or asking for more than ' +
            'is in stock must `raise ValueError`.\n' +
            '- `safe_sell(item, qty)` - same job, but returns `None` instead of raising when the sale is impossible.\n' +
            'The checker calls them in order and inspects `inventory` afterwards - leave the dict updated.',
          requirements: [
            'sell("apples", 2) returns 3 and updates inventory["apples"] to 3',
            'safe_sell returns None for impossible sales (unknown item or too many) without raising',
            'failed sales leave inventory untouched',
          ],
          starter: `inventory = {"apples": 5, "bananas": 2}

def sell(item, qty):
    # raise ValueError when impossible; otherwise update and return the remainder
    ...

def safe_sell(item, qty):
    # delegate to sell(), catching the error
    ...
`,
          hints: [
            'Two impossibility checks first: item not in inventory, or inventory[item] < qty',
            'raise ValueError("out of stock") is the whole statement - no parens-after-class nonsense',
            'safe_sell is a two-line function: try: return sell(...) / except ValueError: return None',
          ],
          solution: `inventory = {"apples": 5, "bananas": 2}

def sell(item, qty):
    if item not in inventory or inventory[item] < qty:
        raise ValueError(f"cannot sell {qty} {item}")
    inventory[item] -= qty
    return inventory[item]

def safe_sell(item, qty):
    try:
        return sell(item, qty)
    except ValueError:
        return None
`,
          checks: [
            T.py('sell returns the remainder', `sell("apples", 2) == 3 and inventory["apples"] == 3`),
            T.py('impossible sale returns None, not a crash', `safe_sell("bananas", 99) is None`),
            T.py('unknown item returns None', `safe_sell("dragonfruit", 1) is None`),
            T.py('failed sales never mutated the stock', `inventory["bananas"] == 2 and "dragonfruit" not in inventory`),
          ],
        },
      ],
    },
  ],
};
