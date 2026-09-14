import { T } from '../core/grade.js';

const NAV_DEMO = `<nav class="nav"><a href="#">Home</a><a href="#">Work</a><a href="#">Contact</a></nav>`;
const CARD_DEMO = `<article class="card"><img src="cover.png" alt="Cover"><h2 class="card__title">Title</h2><p class="card__body">Body copy.</p><a class="btn" href="#">Read</a></article>`;

export default {
  id: 'css',
  title: 'CSS',
  badge: 'CS',
  color: 'secondary',
  tagline: 'Layout, colour and the cascade - making it look deliberate',
  hours: 11,
  why:
    'CSS is where most beginners quietly give up, because it looks like guesswork. It is not: it is a small set of rules - the box model, ' +
    'the cascade, flexbox and grid - that explain almost every surprising result you will ever see. Learn those four and the guessing stops.',
  source: {
    course: 'Dave Gray - CSS Full Course for Beginners (11h)',
    url: 'https://www.youtube.com/watch?v=n4R2E7O-Ngo',
    roadmap: 'https://roadmap.sh/css',
    docs: 'https://developer.mozilla.org/en-US/docs/Web/CSS',
  },
  lessons: [
    // ---------------------------------------------------------------------
    {
      id: 'css-01',
      title: 'Selectors, Specificity and the Cascade',
      minutes: 25,
      objectives: [
        'Choose the right selector for the job instead of reaching for an id',
        'Predict which rule wins when two rules target the same element',
        'Stop `!important` from spreading',
      ],
      sections: [
        {
          heading: 'Specificity is a four-part score',
          body:
            'When two declarations set the same property on the same element, the browser compares specificity as four columns: ' +
            '`(inline, id, class/attribute/pseudo-class, element/pseudo-element)`.\n\n' +
            '- `p` -> `(0,0,0,1)`\n' +
            '- `.card p` -> `(0,0,1,1)`\n' +
            '- `#main .card p` -> `(0,1,1,1)`\n' +
            '- `style="color: red"` -> `(1,0,0,0)`\n\n' +
            'Compare left to right; the first column that differs wins. Source order only matters on an exact tie.',
        },
        {
          heading: 'Write selectors that stay low',
          body:
            'High specificity is a debt: every later fix needs something even more specific, until you are writing `!important` and losing. ' +
            'The practical discipline is: **target with a single class**, and use descendant selectors only to narrow meaningfully.\n\n' +
            '`!important` exists for overriding third-party CSS you cannot edit (a widget library, an embedded player). In your own sheet it ' +
            'is a smell that means an earlier selector was too specific.',
        },
        {
          heading: 'Relationship selectors worth knowing',
          body:
            '- `a b` descendant - any depth\n' +
            '- `a > b` child only\n' +
            '- `a + b` immediately after\n' +
            '- `a ~ b` any later sibling\n' +
            '- `[href^="https"]` attribute starts with; also `$=` ends with, `*=` contains\n' +
            '- `:is(h1, h2)` and `:where(h1, h2)` - `:where()` contributes **zero** specificity, which makes it a great reset tool',
        },
        {
          heading: 'Sample code: a low-specificity starting point',
          body: 'Nothing here is above one class. That is the whole trick - later overrides stay easy.',
          code: {
            lang: 'css',
            caption: 'styles.css',
            source: `:root {
  --ink: #1b1b1f;
  --paper: #fbfbfd;
  --accent: #1652f0;
  --radius: 12px;
}

/* A reset that adds no specificity at all. */
:where(*) {
  box-sizing: border-box;
  margin: 0;
}

body {
  font-family: system-ui, sans-serif;
  color: var(--ink);
  background: var(--paper);
  line-height: 1.6;
}

.card {
  border: 1px solid color-mix(in srgb, var(--ink) 15%, transparent);
  border-radius: var(--radius);
  padding: 1.25rem;
}

.card__title {
  font-size: 1.25rem;
  line-height: 1.2;
}

/* Only style a link inside a card, not every link on the site. */
.card a {
  color: var(--accent);
  text-underline-offset: 3px;
}

.card > img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: calc(var(--radius) - 4px);
}`,
          },
        },
      ],
      pitfalls: [
        'Styling with ids - one id column beats any number of classes',
        '`.card .title` when `.card__title` would be flatter and more reusable',
        'Using `!important` to win a fight you started by over-specifying',
        'Styling every `a` globally and then having to undo it in every component',
      ],
      keyPoints: [
        'Specificity = `(inline, id, class, element)`, compared left to right',
        'Aim for one class per rule',
        '`:where()` has zero specificity - ideal for resets',
      ],
      resources: [
        { label: 'MDN: Specificity', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Specificity' },
        { label: 'CSS Tricks: Specificity', url: 'https://css-tricks.com/specifics-on-css-specificity/' },
      ],
      challenges: [
        {
          id: 'lower-specificity',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'css',
          preview: true,
          previewHtml: CARD_DEMO,
          prompt:
            'This stylesheet works and is a maintenance trap: it styles by id, uses `!important` in two places, and reaches into unrelated ' +
            'components with deep descendant selectors. Rewrite it so every rule is one class (or zero-specificity) and nothing needs `!important`.',
          requirements: [
            'No `!important` anywhere',
            'No id selectors in the stylesheet',
            'No rule uses more than one class in its selector',
            'The card title still gets a distinct size and the card body still gets muted colour',
          ],
          starter: `#card .wrapper .card .title {
  font-size: 20px !important;
  color: blue;
}

#card .wrapper .card p {
  color: grey !important;
}

div.card {
  padding: 20px;
  border: 1px solid #ddd;
}`,
          hints: [
            'Count the columns of `#card .wrapper .card .title`: one id plus three classes. You only need one class.',
            '`.card__title` and `.card__body` are single-class selectors that describe the parts, not the position.',
            'If a rule needs `!important` to win, the rule it beats is too specific.',
          ],
          solution: `.card {
  padding: 1.25rem;
  border: 1px solid #ddd;
}

.card__title {
  font-size: 1.25rem;
  color: #1652f0;
}

.card__body {
  color: #555;
}`,
          checks: [
            T.notSrc('No !important remains', /!important/, 'remove it by lowering the specificity of the competing rule instead'),
            T.css('No id selectors', (c) => {
              const byId = c.rules.filter((r) => r.selectors.some((s) => s.includes('#')));
              return byId.length === 0 || `${byId.length} rule(s) still select by id: ${byId.map((r) => r.selectors.join(',')).join(' | ')}`;
            }),
            T.css('Each rule targets at most one class', (c) => {
              const heavy = c.rules.filter((r) => r.selectors.some((s) => {
                const classes = (s.match(/\.[\w-]+/g) || []).length;
                const elements = (s.match(/(^|[\s>+~])[a-z]+/g) || []).length;
                return classes > 1 || elements > 0;
              }));
              return heavy.length === 0 || `${heavy.length} rule(s) use descendant or multi-class selectors`;
            }),
            T.css('The card still gets padding', (c) => {
              const v = c.numeric('.card', 'padding');
              return (v !== null && v > 0) || 'keep padding on `.card`';
            }),
            T.css('The title has its own size', (c) => {
              const v = c.value('.card__title', 'font-size') || c.value('.card__title', 'color');
              return !!v || 'keep a `.card__title` rule with a size or colour';
            }),
            T.css('The body is visually muted', (c) => !!c.value('.card__body', 'color') || 'keep a `.card__body` rule setting the muted colour'),
            T.css('Every selector is a single class', (c) => {
              const bad = c.rules.filter((r) => r.selectors.length && r.selectors.some((s) => !/^\.[\w-]+$/.test(s.trim())));
              return bad.length === 0 || `${bad.length} rule(s) are not single-class: ${bad.map((r) => r.selectors.join(',')).join(' | ')}`;
            }),
          ],
        },
        {
          id: 'write-card-css',
          kind: 'write',
          difficulty: 'easy',
          minutes: 12,
          lang: 'css',
          preview: true,
          previewHtml: CARD_DEMO,
          prompt:
            'Style this card component from scratch. Write plain CSS - no framework, no nesting required - and aim for the lowest ' +
            'specificity that gets the job done.',
          requirements: [
            'A `:root` block with at least two custom properties (a colour and a radius or spacing value)',
            '`.card` with padding, border-radius and a border',
            '`.card__title` with a clearly larger font-size than the body',
            '`.card__body` with a muted colour (use a custom property)',
            'An image rule that fills the card width without overflowing',
            'No `!important`, no id selectors',
          ],
          starter: ``,
          hints: [
            'Start with the variables, then style the pieces from the outside in.',
            '`calc(var(--radius) - 4px)` is a neat trick for inner radii.',
            'Use `1.25rem`-ish spacing values rather than px, so the component scales with the user\'s font size.',
          ],
          solution: `:root {
  --ink: #1b1b1f;
  --muted: #5c5c66;
  --accent: #1652f0;
  --radius: 14px;
  --space: 1.25rem;
}

.card {
  padding: var(--space);
  border: 1px solid #dcdce4;
  border-radius: var(--radius);
  background: #fff;
}

.card__title {
  margin-bottom: 0.35rem;
  font-size: 1.4rem;
  line-height: 1.15;
  color: var(--ink);
}

.card__body {
  margin-bottom: var(--space);
  color: var(--muted);
  line-height: 1.6;
}

.card img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: calc(var(--radius) - 6px);
  margin-bottom: var(--space);
}

.btn {
  display: inline-block;
  padding: 0.6rem 1rem;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  text-decoration: none;
}`,
          checks: [
            T.css('A :root block defines custom properties', (c) => Object.keys(c.customProps()).length >= 2 || 'define at least two custom properties on `:root`'),
            T.css('A colour is exposed as a variable', (c) => {
              const props = c.customProps();
              const colours = Object.entries(props).filter(([, v]) => /^#|rgb|hsl/i.test(String(v)));
              return colours.length >= 1 || 'store at least one colour as a custom property';
            }),
            T.css('.card has padding, radius and a border', (c) => {
              const missing = ['padding', 'border-radius', 'border'].filter((p) => !c.value('.card', p));
              return missing.length === 0 || `.card is missing: ${missing.join(', ')}`;
            }),
            T.css('.card__title is noticeably larger', (c) => {
              const title = c.numeric('.card__title', 'font-size');
              if (title === null) return 'add a font-size to `.card__title`';
              const unit = c.unit('.card__title', 'font-size');
              const px = unit === 'rem' || unit === 'em' ? title * 16 : title;
              return px >= 20 || `1.4rem+ is the safe range for a card title (you have ~${Math.round(px)}px)`;
            }),
            T.css('.card__body uses a muted colour', (c) => {
              const v = c.value('.card__body', 'color');
              if (!v) return 'set a colour on `.card__body`';
              return /var\(--|#[0-9a-f]{3}|rgb|hsl/i.test(v) || 'use a colour value';
            }),
            T.css('Images are capped to the card width', (c) => {
              const usesWidth = c.uses('width').some((r) => r.selectors.some((s) => s.includes('img')));
              const usesMax = c.uses('max-width').some((r) => r.selectors.some((s) => s.includes('img')));
              const usesAspect = c.uses('aspect-ratio').length > 0;
              return usesWidth || usesMax || usesAspect || 'add a rule for `img` with `width: 100%` (or `max-width`)';
            }),
            T.css('No !important and no id selectors', (c) => {
              const bang = c.rules.some((r) => r.decls.some((d) => d.important));
              const byId = c.rules.some((r) => r.selectors.some((s) => s.includes('#')));
              if (bang) return 'remove the `!important`';
              if (byId) return 'remove the id selector';
              return true;
            }),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'css-02',
      title: 'The Box Model',
      minutes: 30,
      objectives: [
        'Explain content, padding, border and margin in that order',
        'Use border-box sizing by default so widths mean what you think',
        'Debug overflow and unexpected gaps with confidence',
      ],
      sections: [
        {
          heading: 'Every element is a box, inside out',
          body:
            'From the inside: **content** box, then **padding** (inside the border, takes the background), then **border**, then **margin** ' +
            '(outside, always transparent, and it collapses between siblings).\n\n' +
            'Padding is part of the clickable element. Margin is not. That single sentence resolves most "why is the gap clickable / not ' +
            'clickable" confusion.',
        },
        {
          heading: 'box-sizing: border-box is the fix for everything',
          body:
            'With the default `content-box`, `width: 300px; padding: 20px; border: 2px` renders **344px** wide. Layouts break because the ' +
            'maths is invisible.\n\n' +
            '`border-box` makes `width` mean "everything except the margin", so the box is exactly 300px. Every modern codebase turns it on ' +
            'globally:\n\n' +
            '```\n:where(*) { box-sizing: border-box; }\n```',
        },
        {
          heading: 'Margin collapsing, and how to stop it',
          body:
            'Vertical margins between siblings collapse: two `20px` margins produce a `20px` gap, not `40px`. A parent and its first child ' +
            'collapse too, which is why `margin-top` on a heading "escapes" its container.\n\n' +
            'Fixes that actually work: use `padding` on the parent, or `display: flow-root` on the parent to create a block formatting ' +
            'context. Flex and grid containers never collapse margins at all - another reason layout containers are calming.',
        },
        {
          heading: 'Overflow: the three values you need',
          body:
            '- `overflow: hidden` - clip it (and lose it, including for keyboard users)\n' +
            '- `overflow: auto` - scroll only when needed\n' +
            '- `overflow: clip` - clip without creating a scroll container\n\n' +
            'A horizontal scrollbar on a phone is nearly always one element wider than the viewport. Find it with ' +
            '`* { outline: 1px solid red }` in DevTools, not by guessing.',
        },
        {
          heading: 'Sample code: a card that will not surprise you',
          body: 'Note how `border-box` plus `max-width` plus `flow-root` removes three whole classes of bug in four lines.',
          code: {
            lang: 'css',
            caption: 'box-model.css',
            source: `:where(*) {
  box-sizing: border-box;
}

.page {
  max-width: 68ch;
  margin-inline: auto;
  padding: 1.5rem;
}

.card {
  display: flow-root;        /* stops margin collapse through the card */
  padding: 1.25rem;
  margin-block: 1.5rem;
  border: 1px solid #dcdce4;
  border-radius: 12px;
}

.card img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

/* A preview of the same card under content-box sizing. */
.card--legacy {
  box-sizing: content-box;
  width: 300px;
  padding: 20px;
  border: 2px solid red;   /* renders 344px wide - this is the bug */
}`,
          },
        },
      ],
      pitfalls: [
        'Forgetting `border-box` and then fighting the two pixels that make a three-column grid wrap',
        'Using margin where padding is meant, and getting a click target that is smaller than it looks',
        'Setting a fixed `height` on a text container, so content overflows on long strings',
        'Reaching for `!important` or negative margins to fix overflow you have not actually located',
      ],
      keyPoints: [
        'content -> padding -> border -> margin',
        'padding is clickable, margin is not',
        '`:where(*) { box-sizing: border-box }` globally',
        '`display: flow-root` stops margin collapse',
      ],
      resources: [
        { label: 'MDN: The box model', url: 'https://developer.mozilla.org/en-US/docs/Learn/CSS/Building_blocks/The_box_model' },
        { label: 'MDN: Mastering margin collapsing', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_box_model/Mastering_margin_collapsing' },
      ],
      challenges: [
        {
          id: 'fix-box-model',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'css',
          preview: true,
          previewHtml: `<div class="page"><article class="card"><h2>Card one</h2><p>Content here.</p></article><article class="card"><h2>Card two</h2><p>Content here.</p></article></div>`,
          prompt:
            'These cards render 344px wide when the designer asked for 300px, the two cards touch each other, the heading pokes out of the top ' +
            'of the card, and the row overflows on a narrow screen. Fix the box model rather than working around it.',
          requirements: [
            'Global `border-box` sizing',
            '`.card` is exactly the width you set, including padding and border',
            'A real gap between stacked cards (not collapsed to zero)',
            'No horizontal overflow: nothing sets a width wider than the viewport',
            'Headings do not escape the card',
          ],
          starter: `.card {
  width: 300px;
  padding: 20px;
  border: 2px solid #ddd;
  margin-bottom: 0;
}

.card h2 {
  margin-top: 30px;
}

.row {
  width: 1200px;
}`,
          hints: [
            'With the default sizing, padding and border are added on top of `width`. One line on `*` changes that.',
            '`margin-bottom: 0` on both cards means no gap at all.',
            'A child\'s `margin-top` collapses with its parent unless the parent establishes a block formatting context.',
            'A hard `width: 1200px` cannot fit a 375px phone.',
          ],
          solution: `:where(*) {
  box-sizing: border-box;
}

.card {
  display: flow-root;
  width: min(300px, 100%);
  padding: 1.25rem;
  border: 2px solid #ddd;
  border-radius: 12px;
  margin-bottom: 1.5rem;
}

.card h2 {
  margin-top: 0;
}

.row {
  max-width: 1200px;
  width: 100%;
}`,
          checks: [
            T.css('Border-box sizing is global', (c) => {
              const rules = c.rules.filter((r) => r.decls.some((d) => d.prop === 'box-sizing' && d.value === 'border-box'));
              if (!rules.length) return 'add `box-sizing: border-box`';
              const global = rules.some((r) => r.selectors.some((s) => s === '*' || s === ':where(*)' || s === ':where(*)' || s.includes('html') || s === '*, *::before, *::after'));
              return global || 'apply it globally, e.g. `:where(*) { box-sizing: border-box }`';
            }),
            T.css('The card width fits any viewport', (c) => {
              const raw = c.value('.card', 'width');
              if (!raw) return 'set a width or max-width on `.card`';
              if (/^\d+(\.\d+)?px$/.test(String(raw).trim()) && Number.parseFloat(raw) > 420) return `${raw} is a fixed width that will overflow a phone`;
              return /min\(|max\(|clamp\(|%|ch|rem|em|var\(/.test(raw) || `a bare px width of ${raw} will overflow small screens`;
            }),
            T.css('Cards have space between them', (c) => {
              const mb = c.value('.card', 'margin-bottom') || c.value('.card', 'margin-block') || c.value('.card', 'margin-block-end') || c.value('.card', 'gap');
              const numeric = c.numeric('.card', 'margin-bottom') ?? c.numeric('.card', 'margin-block');
              if (mb === null && numeric === null) return 'add a bottom margin (or use a gap on the container)';
              return (numeric === null || numeric > 0) || 'the margin is zero, so the cards touch';
            }),
            T.css('The heading does not escape the card', (c) => {
              const mt = c.numeric('.card h2', 'margin-top');
              const flowRoot = c.value('.card', 'display') === 'flow-root' || c.value('.card', 'overflow') === 'hidden' || c.value('.card', 'display') === 'flex' || c.value('.card', 'display') === 'grid' || !!c.value('.card', 'padding-top');
              if (mt !== null && mt > 0 && !flowRoot) return 'the heading margin will collapse out of the card - set margin-top: 0 or give the card `display: flow-root`';
              return flowRoot || (mt === 0) || 'set `.card h2 { margin-top: 0 }` or `display: flow-root` on the card';
            }),
            T.css('Nothing is wider than the viewport', (c) => {
              const bad = [];
              for (const rule of c.rules) {
                for (const d of rule.decls) {
                  if (d.prop !== 'width') continue;
                  const m = String(d.value).match(/^(\d+(?:\.\d+)?)px$/);
                  if (m && Number(m[1]) > 480) bad.push(`${rule.selectors.join(',')} { width: ${d.value} }`);
                }
              }
              return bad.length === 0 || `fixed px widths wider than a phone: ${bad.join(' | ')}`;
            }),
            T.css('The card declares padding', (c) => (c.numeric('.card', 'padding') ?? c.numeric('.card', 'padding-inline') ?? 0) > 0 || 'keep padding on the card'),
          ],
        },
        {
          id: 'write-box-model',
          kind: 'write',
          difficulty: 'easy',
          minutes: 10,
          lang: 'css',
          preview: true,
          previewHtml: `<div class="page"><h1>Three equal columns</h1><div class="row"><div class="col">One</div><div class="col">Two</div><div class="col">Three</div></div></div>`,
          prompt:
            'Build the CSS for a three-column row where each column is exactly one third of the available width **including** its padding and ' +
            'border. Prove you understand the box model by making the maths work.',
          requirements: [
            'Global border-box sizing',
            '`.row` constrains the page to a readable max width and centres itself',
            'Three `.col` items each take one third of the row with visible padding and a border',
            'The row never overflows its container',
          ],
          starter: ``,
          hints: [
            '`flex: 1` on each column is cleaner than `width: 33.33%` - but you need `display: flex` on the row first.',
            '`margin-inline: auto` centres a max-width block.',
            'Use `gap` on the row rather than margins on the columns.',
          ],
          solution: `:where(*) {
  box-sizing: border-box;
}

.page {
  max-width: 900px;
  margin-inline: auto;
  padding: 1.5rem;
}

.row {
  display: flex;
  gap: 1rem;
  max-width: 100%;
}

.col {
  flex: 1 1 0;
  min-width: 0;
  padding: 1.25rem;
  border: 1px solid #dcdce4;
  border-radius: 12px;
  max-width: 100%;
}`,
          checks: [
            T.css('Border-box sizing is global', (c) => c.rules.some((r) => r.decls.some((d) => d.prop === 'box-sizing' && d.value === 'border-box')) || 'add `box-sizing: border-box`'),
            T.css('.page is centred and constrained', (c) => {
              const max = c.value('.page', 'max-width');
              const centre = String(c.value('.page', 'margin-inline') || c.value('.page', 'margin') || '').includes('auto');
              if (!max) return 'give `.page` a max-width';
              return centre || 'centre it with `margin-inline: auto`';
            }),
            T.css('Columns are laid out in a row', (c) => ['flex', 'grid'].includes(c.value('.row', 'display')) || 'set `display: flex` on `.row`'),
            T.css('Columns share the space equally', (c) => {
              const flex = c.value('.col', 'flex');
              const width = c.value('.col', 'width');
              const basis = c.value('.col', 'flex-basis');
              if (flex && /^1(\s+1)?(\s+0)?/.test(String(flex))) return true;
              if (width && /33|calc\(.*\/\s*3|var\(/.test(String(width))) return true;
              if (basis) return true;
              return 'use `flex: 1` on each column so they share the width equally';
            }),
            T.css('Columns have padding and a border', (c) => {
              const missing = ['padding', 'border'].filter((p) => !c.value('.col', p));
              return missing.length === 0 || `.col is missing: ${missing.join(', ')}`;
            }),
            T.css('No fixed pixel width that would overflow', (c) => {
              const bad = c.rules.some((r) => r.decls.some((d) => d.prop === 'width' && /^\d+(\.\d+)?px$/.test(d.value) && Number.parseFloat(d.value) > 400));
              return !bad || 'avoid fixed px widths on the columns';
            }),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'css-03',
      title: 'Type, Colour and Custom Properties',
      minutes: 25,
      objectives: [
        'Build a type scale with rem and line-height instead of guessing',
        'Use custom properties so a theme change is one edit',
        'Pick colours with contrast in mind, not just taste',
      ],
      sections: [
        {
          heading: 'rem, em and why it matters',
          body:
            '`px` ignores the user\'s font-size setting. `rem` is relative to the root font size (16px by default), so `1.25rem` scales with ' +
            'the user\'s browser preference. Use `rem` for typography and spacing; use `px` only for hairlines and borders.\n\n' +
            '`line-height` should be unitless (`1.5`) so it scales with the font size instead of inheriting a fixed pixel value.',
        },
        {
          heading: 'A type scale beats arbitrary sizes',
          body:
            'Pick 5-6 sizes and stick to them, for example: `0.875rem` (small), `1rem` (body), `1.25rem` (h3), `1.6rem` (h2), `2.2rem` (h1). ' +
            'Use `clamp()` for fluid headings so they shrink on small screens without a media query:\n\n' +
            '```\nh1 { font-size: clamp(1.75rem, 4vw + 1rem, 3rem); }\n```',
        },
        {
          heading: 'Custom properties are variables with a scope',
          body:
            'Declare them on `:root` for global values. Declare them on a component to make it themable from the outside, and give them a ' +
            'fallback: `color: var(--card-fg, #1b1b1f)`.\n\n' +
            'Because they are real CSS values, they cascade. Set `--accent` on `.card` and only that card changes. That is how you build a ' +
            'dark-mode toggle without duplicating a single rule.',
          code: {
            lang: 'css',
            caption: 'theming without duplication',
            source: `:root {
  --ink: #1b1b1f;
  --paper: #fbfbfd;
  --accent: #1652f0;
}

[data-theme='dark'] {
  --ink: #f2f2f7;
  --paper: #15151a;
  --accent: #7aa2ff;
}

body {
  color: var(--ink);
  background: var(--paper);
  transition: background-color 0.2s ease;
}`,
          },
        },
        {
          heading: 'Sample code: a complete type and colour layer',
          body: 'Copy this into every project. It is the difference between "looks hand-made" and "looks designed".',
          code: {
            lang: 'css',
            caption: 'type.css',
            source: `:root {
  --font-body: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, monospace;

  --step--1: 0.875rem;
  --step-0: 1rem;
  --step-1: 1.25rem;
  --step-2: 1.6rem;
  --step-3: clamp(1.9rem, 3vw + 1rem, 2.75rem);

  --ink: #1b1b1f;
  --muted: #5c5c66;
  --paper: #fbfbfd;
  --accent: #1652f0;

  --space: 1rem;
  --radius: 12px;
}

body {
  font-family: var(--font-body);
  font-size: var(--step-0);
  line-height: 1.6;
  color: var(--ink);
  background: var(--paper);
}

h1, h2, h3 {
  line-height: 1.15;
  text-wrap: balance;          /* stops one-word widows in headings */
  margin-block: 0 0.5em;
}

h1 { font-size: var(--step-3); letter-spacing: -0.02em; }
h2 { font-size: var(--step-2); }
h3 { font-size: var(--step-1); }

p {
  max-width: 68ch;             /* readable measure */
  text-wrap: pretty;
}

code, pre {
  font-family: var(--font-mono);
  font-size: var(--step--1);
}

a {
  color: var(--accent);
  text-underline-offset: 0.2em;
  text-decoration-thickness: 1px;
}

a:hover {
  text-decoration-thickness: 2px;
}`,
          },
        },
      ],
      pitfalls: [
        'Fixed `px` font sizes that ignore the user\'s accessibility setting',
        'Unitless line-height everywhere including headings (headings usually want ~1.1)',
        'Low-contrast grey-on-grey body text that fails WCAG AA',
        'Hard-coding the same hex in twelve places instead of one custom property',
      ],
      keyPoints: [
        '`rem` for type and spacing, unitless `line-height`',
        '5-6 type steps, `clamp()` for fluid headings',
        'Custom properties cascade - scope them to theme a component',
        '60-75 characters is the comfortable measure for body text',
      ],
      resources: [
        { label: 'WebAIM: Contrast checker', url: 'https://webaim.org/resources/contrastchecker/' },
        { label: 'MDN: Using CSS custom properties', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties' },
        { label: 'Modern Font Stacks', url: 'https://modernfontstacks.com/' },
      ],
      challenges: [
        {
          id: 'fix-typography',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'css',
          preview: true,
          previewHtml: `<body><h1>Weekly notes</h1><h2>What I shipped</h2><p>A short summary of the week, written for a person with a life outside the terminal. It should be comfortable to read on a phone at night.</p><p class="muted">Last updated 12 September.</p></body>`,
          prompt:
            'This type layer has four real problems: it ignores the user\'s font size setting, headings are too tightly packed, body text runs ' +
            'the full width of a wide monitor, and one colour pair fails contrast. Fix all four.',
          requirements: [
            'Body text uses a rem-based size and a unitless line-height of at least 1.5',
            'Headings use a tighter line-height than body text and come from variables or rem values',
            'Paragraphs are limited to a readable measure (under 80 characters)',
            'A `:root` block holds the colours, and the muted colour is dark enough to read',
          ],
          starter: `body {
  font-family: Georgia, serif;
  font-size: 14px;
  line-height: 1;
}

h1, h2 {
  font-size: 18px;
  line-height: 2;
}

p {
  color: #c9c9c9;
  width: 100%;
}

.muted {
  color: #d0d0d0;
}`,
          hints: [
            '`14px` and `18px` ignore the browser font-size setting. `1rem`/`1.25rem` respect it.',
            'A `line-height` of 1 on body text is unreadable; 2 on a heading wastes vertical space.',
            'Long lines are hard to track. `max-width: 68ch` is the standard fix.',
            'Grey text on a light background needs to be much darker than you expect to pass AA.',
          ],
          solution: `:root {
  --ink: #1b1b1f;
  --muted: #55555e;
  --paper: #fbfbfd;
  --font-body: system-ui, sans-serif;
}

body {
  font-family: var(--font-body);
  font-size: 1rem;
  line-height: 1.6;
  color: var(--ink);
  background: var(--paper);
}

h1, h2 {
  line-height: 1.15;
  font-size: 1.5rem;
}

p {
  max-width: 68ch;
  color: var(--ink);
}

.muted {
  color: var(--muted);
}`,
          checks: [
            T.css('Body font-size is relative, not px', (c) => {
              const v = String(c.value('body', 'font-size') || '');
              if (!v) return 'set a font-size on body';
              return !/^\d+px$/.test(v) || `${v} ignores the user's font size setting - use rem`;
            }),
            T.css('Body line-height is comfortable', (c) => {
              const v = c.value('body', 'line-height');
              if (!v) return 'set a line-height on body';
              const n = Number.parseFloat(v);
              if (/px$/.test(v)) return 'unitless line-height scales with the font size';
              return n >= 1.5 || `line-height ${v} is too tight for body copy`;
            }),
            T.css('Headings are tighter than body copy', (c) => {
              const h = c.value('h1, h2', 'line-height') ?? c.value('h1,h2', 'line-height') ?? c.value('h1', 'line-height');
              if (h === null) return 'set a line-height on the headings';
              return Number.parseFloat(h) < 1.5 || `${h} is too loose for a heading`;
            }),
            T.css('Paragraphs have a readable measure', (c) => {
              const max = c.value('p', 'max-width') || c.value('p', 'width');
              if (!max) return 'add `max-width` to `p`';
              const ch = String(max).match(/^(\d+(?:\.\d+)?)ch$/);
              if (ch) return Number(ch[1]) <= 80 || `${ch[1]}ch is wider than the comfortable reading measure`;
              if (/%$/.test(String(max))) return true;
              return /min\(|clamp\(/.test(String(max)) || `a measure of 60-75ch is ideal (you have ${max})`;
            }),
            T.css('Colours live in custom properties', (c) => Object.keys(c.customProps()).length >= 2 || 'move the colours into `:root`'),
            T.css('The muted colour is dark enough to read', (c) => {
              const raw = c.value('.muted', 'color');
              if (!raw) return 'set a colour on `.muted`';
              const hex = String(raw).match(/^#([0-9a-f]{6})$/i);
              if (hex) {
                const r = parseInt(hex[1].slice(0, 2), 16);
                const g = parseInt(hex[1].slice(2, 4), 16);
                const b = parseInt(hex[1].slice(4, 6), 16);
                const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
                if (luminance > 0.75) return `${raw} is too light against a light background`;
              }
              return true;
            }),
          ],
        },
        {
          id: 'write-design-tokens',
          kind: 'write',
          difficulty: 'medium',
          minutes: 14,
          lang: 'css',
          preview: true,
          previewHtml: `<body><h1>Tokens</h1><h2>Section</h2><p>Body copy with <a href="#">a link</a> and <code>inline code</code>.</p></body>`,
          prompt:
            'Build a design-token layer from scratch: a `:root` block with a type scale, a colour set and a spacing value, then apply them. ' +
            'This is the file you will copy into every future project, so make it one you would actually keep.',
          requirements: [
            'At least four type steps as custom properties (`--step--1` through `--step-2` or similar)',
            'At least three colours including an accent, plus one radical change of theme under `[data-theme="dark"]`',
            'A fluid heading with `clamp()`',
            'Body font-size in rem, unitless line-height between 1.5 and 1.7',
            'A link style with a visible hover change',
          ],
          starter: ``,
          hints: [
            'A dark theme is just a second `:root`-like block that redefines the same variables.',
            '`clamp(min, preferred, max)` - the middle value can mix `vw` with `rem`.',
            'Style `a:hover` and `a:focus-visible` together so keyboard users see the same affordance.',
          ],
          solution: `:root {
  --step--1: 0.875rem;
  --step-0: 1rem;
  --step-1: 1.25rem;
  --step-2: clamp(1.6rem, 2vw + 1rem, 2.4rem);

  --ink: #1b1b1f;
  --muted: #55555e;
  --paper: #fbfbfd;
  --accent: #1652f0;

  --space: 1rem;
}

[data-theme='dark'] {
  --ink: #f2f2f7;
  --muted: #b8b8c4;
  --paper: #15151a;
  --accent: #7aa2ff;
}

body {
  font-size: var(--step-0);
  line-height: 1.6;
  color: var(--ink);
  background: var(--paper);
}

h1 { font-size: var(--step-2); line-height: 1.15; }
h2 { font-size: var(--step-1); line-height: 1.2; }

p {
  max-width: 68ch;
  color: var(--ink);
}

a {
  color: var(--accent);
  text-decoration-thickness: 1px;
  text-underline-offset: 0.2em;
}

a:hover,
a:focus-visible {
  text-decoration-thickness: 3px;
}`,
          checks: [
            T.css('At least four type steps exist', (c) => {
              const steps = Object.keys(c.customProps()).filter((p) => /^--(step|size|text|fs)/.test(p));
              return steps.length >= 4 || `found ${steps.length} type-scale variables - add more steps`;
            }),
            T.css('Colours are defined as variables', (c) => {
              const colours = Object.values(c.customProps()).filter((v) => /^#|rgb|hsl/i.test(String(v)));
              return colours.length >= 3 || `found ${colours.length} colour variables - you need at least three`;
            }),
            T.css('A dark theme redefines the same variables', (c) => {
              const dark = c.rules.filter((r) => r.selectors.some((s) => s.includes('dark')));
              if (!dark.length) return 'add a `[data-theme="dark"]` block (or `@media (prefers-color-scheme: dark)`)';
              const props = dark.flatMap((r) => r.decls.map((d) => d.prop)).filter((p) => p.startsWith('--'));
              return props.length >= 2 || 'the dark block should redefine the colour variables';
            }),
            T.css('A heading uses clamp() for fluid sizing', (c) => c.values('font-size').some((v) => c.resolve(v).includes('clamp(')) || 'use `clamp()` on a heading font-size'),
            T.css('Body type is rem with a comfortable line-height', (c) => {
              const size = c.resolve(c.value('body', 'font-size') || '');
              const lh = Number.parseFloat(c.value('body', 'line-height') || '0');
              const problems = [];
              if (!/rem|em|%/.test(size)) problems.push('font-size should be rem-based');
              if (!(lh >= 1.5 && lh <= 1.7)) problems.push('line-height should be between 1.5 and 1.7');
              return problems.length === 0 || problems.join('; ');
            }),
            T.css('Links have a hover state', (c) => {
              const hover = c.rules.filter((r) => r.selectors.some((s) => s.includes(':hover')));
              return hover.length > 0 || 'add an `a:hover` rule';
            }),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'css-04',
      title: 'Flexbox',
      minutes: 30,
      objectives: [
        'Reason about the main axis and the cross axis instead of guessing',
        'Centre anything without a hack',
        'Build a navbar, a media object and an equal-height card row',
      ],
      sections: [
        {
          heading: 'One axis at a time',
          body:
            'Flexbox lays items out along a **main axis**. `flex-direction: row` (the default) makes the main axis horizontal, so ' +
            '`justify-content` distributes horizontally and `align-items` aligns vertically. Switch to `column` and those two swap jobs. ' +
            'Almost every "why is justify-content not working" question is really "which axis am I on?".',
        },
        {
          heading: 'The container and the item properties',
          body:
            '**Container:** `display: flex`, `flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `align-content`, `gap`.\n\n' +
            '**Item:** `flex-grow`, `flex-shrink`, `flex-basis` (usually written `flex: 1`), `align-self`, `order`.\n\n' +
            '`gap` is the modern spacing tool - it works in flex and grid and never collapses like margins. Use it and delete your ' +
            '`:last-child` margin hacks.',
        },
        {
          heading: 'The three flex recipes you will use forever',
          body:
            '1. **Perfect centring** - `display: flex; align-items: center; justify-content: center` (or `place-items: center` in grid).\n' +
            '2. **Space between** - `justify-content: space-between` with `gap` for a logo on one side, nav on the other.\n' +
            '3. **`flex: 1` for equal columns** - but add `min-width: 0` or a long word or a `<pre>` block will refuse to shrink.\n\n' +
            'That third one is the single most useful flex debugging fact: **flex items have `min-width: auto`**, so overflow means "I forgot ' +
            '`min-width: 0`".',
        },
        {
          heading: 'Sample code: navbar, card row and media object',
          body: 'Three layouts that cover most of what a real page needs.',
          code: {
            lang: 'css',
            caption: 'flex.css',
            source: `.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
}

.navbar ul {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.card-row {
  display: flex;
  flex-wrap: wrap;      /* wrap instead of squashing on small screens */
  gap: 1rem;
}

.card-row > * {
  flex: 1 1 18rem;      /* grow, shrink, ideal width */
  min-width: 0;         /* the fix for stubborn overflow */
}

/* Media object: avatar + text, text takes the remaining space */
.media {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.media__body {
  flex: 1;
  min-width: 0;
}

/* Deeper nesting than you think you need */
.centre-all {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40vh;
}`,
          },
        },
      ],
      pitfalls: [
        'Forgetting `min-width: 0` and blaming flex for the overflow',
        'Using margins for spacing between flex items when `gap` exists',
        '`justify-content: center` on the wrong axis (check `flex-direction` first)',
        'Forgetting `flex-wrap: wrap`, so items squash instead of wrapping on a phone',
        'Setting `height: 100%` on a flex child instead of using `align-items: stretch` (the default)',
      ],
      keyPoints: [
        '`flex-direction` decides what `justify-content` and `align-items` mean',
        '`gap` for spacing, never margins',
        '`flex: 1 1 <ideal width>` plus `min-width: 0` for resilient columns',
      ],
      resources: [
        { label: 'CSS Tricks: Complete guide to Flexbox', url: 'https://css-tricks.com/snippets/css/a-guide-to-flexbox/' },
        { label: 'MDN: Basic concepts of flexbox', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout/Basic_concepts_of_flexbox' },
        { label: 'Flexbox Froggy (game)', url: 'https://flexboxfroggy.com/' },
      ],
      challenges: [
        {
          id: 'fix-flexbox',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'css',
          preview: true,
          previewHtml: `<nav class="navbar"><a class="logo" href="#">Dev</a><ul><li><a href="#">Home</a></li><li><a href="#">Work</a></li></ul></nav><main class="card-row"><article class="card">Short</article><article class="card">A much longer piece of content that refuses to shrink and pushes the row past the viewport edge</article><article class="card">Medium length</article></main>`,
          prompt:
            'This navbar stacks instead of sitting in a row, the nav links are bulleted, the cards are wildly uneven heights and the third card ' +
            'pushes the row past the edge of the screen. Fix the flexbox.',
          requirements: [
            'The navbar is a single row with the logo on the left and links on the right',
            'Nav links are a horizontal list with no bullets and a gap between them',
            'Cards sit in an equal-height row that wraps when space runs out',
            'No horizontal overflow: long content shrinks instead of pushing',
          ],
          starter: `.navbar {
  display: flex;
  flex-direction: column;
}

.navbar ul {
  list-style: disc;
}

.navbar li {
  margin-right: 20px;
}

.card-row {
  display: flex;
  justify-content: space-between;
}

.card {
  flex: 1;
  padding: 1rem;
}`,
          hints: [
            'The navbar is a flex container but it is a column - what does `row` give you instead?',
            'Turning off the bullets is `list-style: none` on the `ul`, and the list itself needs to be a flex row.',
            '`flex: 1` combined with `justify-content: space-between` fights itself; use `gap` and let items grow.',
            'The classic overflow fix is `min-width: 0` on flex items.',
          ],
          solution: `.navbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
}

.navbar ul {
  display: flex;
  align-items: center;
  gap: 1.25rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.navbar li {
  margin-right: 0;
}

.card-row {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 1rem;
}

.card {
  flex: 1 1 18rem;
  min-width: 0;
  padding: 1rem;
  overflow-wrap: break-word;
}`,
          checks: [
            T.css('The navbar is a flex row', (c) => {
              if (c.value('.navbar', 'display') !== 'flex') return 'set `display: flex` on the navbar';
              const dir = c.value('.navbar', 'flex-direction') || 'row';
              return dir === 'row' || `flex-direction is ${dir} - the navbar should be a row`;
            }),
            T.css('Logo and links are pushed apart', (c) => {
              const jc = c.value('.navbar', 'justify-content');
              const pos = c.value('.logo', 'margin-inline-start') || c.value('.logo', 'margin-left');
              return jc === 'space-between' || !!pos || 'use `justify-content: space-between` on the navbar';
            }),
            T.css('The nav list is horizontal', (c) => {
              const display = c.value('.navbar ul', 'display');
              if (display !== 'flex') return 'set `display: flex` on `.navbar ul`';
              const dir = c.value('.navbar ul', 'flex-direction') || 'row';
              return dir === 'row' || 'the nav list should run in a row';
            }),
            T.css('Nav bullets are removed', (c) => {
              const ls = c.value('.navbar ul', 'list-style') || c.value('.navbar ul', 'list-style-type') || c.value('.navbar li', 'list-style');
              return ls === 'none' || 'set `list-style: none` on the list';
            }),
            T.css('Nav items are spaced with gap', (c) => {
              const gap = c.numeric('.navbar ul', 'gap') ?? c.numeric('.navbar', 'gap');
              return (gap !== null && gap > 0) || 'use `gap` on the nav list';
            }),
            T.css('Long content shrinks instead of overflowing', (c) => {
              const minW = c.value('.card', 'min-width');
              const wrap = c.value('.card', 'overflow-wrap') || c.value('.card', 'word-break');
              const anyMin = c.rules.some((r) => r.decls.some((d) => d.prop === 'min-width' && String(d.value).startsWith('0')));
              return !!minW || !!wrap || anyMin || 'add `min-width: 0` (or `overflow-wrap: break-word`) to the flex item';
            }),
            T.css('The card row wraps', (c) => c.value('.card-row', 'flex-wrap') === 'wrap' || 'add `flex-wrap: wrap` so cards wrap instead of squashing'),
          ],
        },
        {
          id: 'write-flex-layout',
          kind: 'write',
          difficulty: 'medium',
          minutes: 14,
          lang: 'css',
          preview: true,
          previewHtml: `<body><header class="site-header"><h1 class="brand">Dev</h1><nav class="nav"><ul><li><a href="#">Posts</a></li><li><a href="#">Projects</a></li><li><a href="#">About</a></li></ul></nav></header><section class="hero"><h2>Hero</h2><p>Centred content.</p></section><div class="media"><img class="media__img" src="avatar.png" alt="Avatar"><div class="media__body"><h3>Title</h3><p>Body copy that is long enough to demonstrate the shrink behaviour of the flex item.</p></div></div></body>`,
          prompt:
            'Build three flex layouts in one stylesheet: a header with the brand left and nav right, a vertically-and-horizontally centred hero, ' +
            'and the classic media object (image plus text) where the text takes all remaining space.',
          requirements: [
            '`.site-header` is a row with `space-between` and a gap',
            '`.nav ul` is a horizontal, bullet-free, wrapped-safe list',
            '`.hero` centres its content on both axes with a minimum height',
            '`.media__body` takes the remaining width and can shrink',
            'Every flex item that holds text has `min-width: 0`',
          ],
          starter: ``,
          hints: [
            '`min-height` plus `align-items` and `justify-content` centres on both axes.',
            '`flex: 1` on the media body is what makes the text fill the leftover space.',
          ],
          solution: `.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
}

.brand {
  font-size: 1.25rem;
}

.nav ul {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-height: 50vh;
  text-align: center;
}

.media {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.media__img {
  flex: 0 0 auto;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  object-fit: cover;
}

.media__body {
  flex: 1 1 auto;
  min-width: 0;
}`,
          checks: [
            T.css('The header is a spread-out row', (c) => {
              const display = c.value('.site-header', 'display');
              const jc = c.value('.site-header', 'justify-content');
              if (display !== 'flex') return 'set `display: flex` on `.site-header`';
              return jc === 'space-between' || 'use `justify-content: space-between`';
            }),
            T.css('The nav list is a clean horizontal row', (c) => {
              const display = c.value('.nav ul', 'display');
              const ls = c.value('.nav ul', 'list-style') || c.value('.nav ul', 'list-style-type');
              if (display !== 'flex') return 'set `display: flex` on `.nav ul`';
              return ls === 'none' || 'remove the bullets with `list-style: none`';
            }),
            T.css('The hero centres on both axes', (c) => {
              const display = c.value('.hero', 'display');
              const ai = c.value('.hero', 'align-items');
              const jc = c.value('.hero', 'justify-content');
              const minH = c.numeric('.hero', 'min-height');
              const problems = [];
              if (display !== 'flex') problems.push('display: flex');
              if (!ai || !['center', 'centre'].includes(ai)) problems.push('align-items: center');
              if (jc !== 'center') problems.push('justify-content: center');
              if (minH === null) problems.push('a min-height so there is space to centre in');
              return problems.length === 0 || `missing: ${problems.join(', ')}`;
            }),
            T.css('The media body fills the leftovers and can shrink', (c) => {
              const flex = c.value('.media__body', 'flex');
              const minW = c.value('.media__body', 'min-width');
              if (!flex) return 'give `.media__body` `flex: 1`';
              return String(minW).startsWith('0') || 'add `min-width: 0` so long words cannot force overflow';
            }),
            T.css('The avatar is not squashed by flex', (c) => {
              const flex = c.value('.media__img', 'flex');
              const shrink = c.value('.media__img', 'flex-shrink');
              const w = c.value('.media__img', 'width');
              if (!w) return 'give the avatar a width';
              return /^0/.test(String(flex || '')) || shrink === '0' || 'set `flex: 0 0 auto` so flexbox cannot stretch the avatar';
            }),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'css-05',
      title: 'CSS Grid',
      minutes: 30,
      objectives: [
        'Build a two-dimensional layout with explicit tracks',
        'Use named areas so the CSS reads like the page',
        'Know when grid beats flex and vice versa',
      ],
      sections: [
        {
          heading: 'Grid is for two dimensions',
          body:
            'Flexbox distributes along one axis. Grid defines rows **and** columns up front, then places items into that structure. Reach for ' +
            'grid when you know the shape of the layout (a page shell, a gallery, a form) and flex when you only need distribution along one ' +
            'line.',
        },
        {
          heading: 'The four properties that do most of the work',
          body:
            '- `grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr))` - a responsive gallery with **zero media queries**\n' +
            '- `gap` - spacing that never collapses\n' +
            '- `grid-template-areas` - draw the layout as ASCII, then assign each child with `grid-area`\n' +
            '- `grid-column: span 2` - make one item wider than the rest\n\n' +
            '`auto-fit` collapses empty tracks; `auto-fill` keeps them. For a gallery you almost always want `auto-fit`.',
        },
        {
          heading: 'The page shell, drawn as text',
          body:
            'This is the most valuable grid pattern in existence: a full page layout you can read at a glance.',
          code: {
            lang: 'css',
            caption: 'grid shell',
            source: `.layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'header header'
    'sidebar main'
    'footer footer';
  gap: 1rem;
  min-height: 100dvh;
}

.layout > header  { grid-area: header; }
.layout > aside   { grid-area: sidebar; }
.layout > main    { grid-area: main; min-width: 0; }
.layout > footer  { grid-area: footer; }

@media (max-width: 720px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-areas:
      'header'
      'main'
      'sidebar'
      'footer';
  }
}`,
          },
        },
        {
          heading: 'Sample code: gallery, dashboard and a form grid',
          body: 'Three grid shapes, no media queries except where a genuine layout change happens.',
          code: {
            lang: 'css',
            caption: 'grid.css',
            source: `/* 1. Self-sizing gallery */
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 1rem;
}

/* 2. Dashboard with a wide feature cell */
.dashboard {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

.dashboard .feature {
  grid-column: span 2;
  grid-row: span 2;
}

/* 3. A form on a two-column grid that collapses below 640px */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 0.75rem 1rem;
  align-items: start;
}

.form-grid .full {
  grid-column: 1 / -1;
}`,
          },
        },
      ],
      pitfalls: [
        'Using `grid-template-columns: 1fr 1fr 1fr 1fr` and then fighting the four-column layout at every breakpoint',
        '`auto-fill` when you meant `auto-fit` (or vice versa)',
        'Grid children overflowing because `1fr` is `minmax(auto, 1fr)` - use `minmax(0, 1fr)` when you need real shrinking',
        'Using grid for a single-row, single-axis layout where flex is simpler',
      ],
      keyPoints: [
        'Grid = two dimensions, flex = one',
        '`repeat(auto-fit, minmax(18rem, 1fr))` for responsive cards with no media queries',
        '`grid-template-areas` makes layout CSS readable',
        '`1fr` will not shrink below its content unless you write `minmax(0, 1fr)`',
      ],
      resources: [
        { label: 'CSS Tricks: Complete guide to Grid', url: 'https://css-tricks.com/snippets/css/complete-guide-grid/' },
        { label: 'MDN: CSS grid layout', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout' },
        { label: 'Grid Garden (game)', url: 'https://cssgridgarden.com/' },
      ],
      challenges: [
        {
          id: 'fix-grid',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 12,
          lang: 'css',
          preview: true,
          previewHtml: `<div class="layout"><header>Header</header><aside>Sidebar</aside><main>Main content</main><footer>Footer</footer></div>`,
          prompt:
            'This page shell is broken in a way that will confuse you for an hour if you do not know grid: the areas do not match the children, ' +
            'the main content overflows a long word instead of wrapping, and the whole thing has a horizontal scrollbar on a phone. Fix it.',
          requirements: [
            '`grid-template-areas` matches the actual children (`header`, `aside`, `main`, `footer`)',
            'Each child is assigned with `grid-area`',
            'Below 720px the layout becomes a single column with `main` above `aside`',
            'Main content can shrink: use `minmax(0, 1fr)` or `min-width: 0`',
            'No horizontal overflow at any width',
          ],
          starter: `.layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'header header'
    'main sidebar'
    'footer footer';
  gap: 1rem;
}

.layout > header {
  grid-area: top;
}

.layout > main {
  grid-area: sidebar;
}

.layout > aside {
  grid-area: main;
}

.layout > footer {
  grid-area: bottom;
}`,
          hints: [
            'Every name used in `grid-area` must appear in `grid-template-areas`, or the item is auto-placed.',
            'You have swapped main and sidebar in the template - that is why the main content sits on the left on desktop.',
            'A long unbroken word will not shrink a `1fr` track unless you allow it: `minmax(0, 1fr)`.',
            'Add a media query that rewrites `grid-template-areas` to a single column.',
          ],
          solution: `.layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    'header header'
    'sidebar main'
    'footer footer';
  gap: 1rem;
  min-height: 100dvh;
}

.layout > header { grid-area: header; }
.layout > aside  { grid-area: sidebar; }
.layout > main   { grid-area: main; min-width: 0; overflow-wrap: break-word; }
.layout > footer { grid-area: footer; }

@media (max-width: 720px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'header'
      'main'
      'sidebar'
      'footer';
  }
}`,
          checks: [
            T.css('The layout is a grid', (c) => c.value('.layout', 'display') === 'grid' || 'set `display: grid` on `.layout`'),
            T.css('The area template lists the real children', (c) => {
              const areas = c.value('.layout', 'grid-template-areas');
              if (!areas) return 'declare `grid-template-areas`';
              const names = new Set(String(areas).replace(/["']/g, ' ').trim().split(/\s+/).filter(Boolean));
              const wanted = ['header', 'sidebar', 'main', 'footer'];
              const missing = wanted.filter((w) => !names.has(w));
              return missing.length === 0 || `missing area name(s): ${missing.join(', ')}`;
            }),
            T.css('Every child is placed with grid-area', (c) => {
              const wanted = ['header', 'aside', 'main', 'footer'];
              const missing = wanted.filter((tag) => !c.value(`.layout > ${tag}`, 'grid-area'));
              return missing.length === 0 || `no grid-area for: ${missing.join(', ')}`;
            }),
            T.css('Main and sidebar are the right way round', (c) => {
              const headerArea = c.value('.layout > header', 'grid-area');
              const mainArea = c.value('.layout > main', 'grid-area');
              const asideArea = c.value('.layout > aside', 'grid-area');
              if (!headerArea || !mainArea || !asideArea) return 'assign grid-area to header, main and aside';
              if (mainArea === asideArea) return 'main and aside claim the same area';
              const areas = String(c.value('.layout', 'grid-template-areas') || '').replace(/["']/g, ' ');
              const rows = areas.trim().split(/\s*\n\s*/).map((r) => r.trim().split(/\s+/));
              const find = (name) => {
                for (let r = 0; r < rows.length; r += 1) {
                  const i = rows[r].indexOf(name);
                  if (i !== -1) return { r, c: i };
                }
                return null;
              };
              const m = find(mainArea);
              const s = find(asideArea);
              if (!m || !s) return 'main and aside do not appear in the area template';
              return m.c >= s.c || 'main should sit to the right of the sidebar on desktop';
            }),
            T.css('Main content can shrink', (c) => {
              const cols = String(c.value('.layout', 'grid-template-columns') || '');
              const minW = c.value('.layout > main', 'min-width');
              const wrap = c.value('.layout > main', 'overflow-wrap') || c.value('.layout > main', 'word-break');
              if (minW && String(minW).startsWith('0')) return true;
              if (/minmax\(\s*0/.test(cols)) return true;
              if (wrap) return true;
              return 'use `minmax(0, 1fr)` for the content track, or `min-width: 0` on main';
            }),
            T.css('There is a mobile layout', (c) => {
              const mq = c.media('max-width');
              if (!mq.length) return 'add a `@media (max-width: 720px)` block';
              const single = mq.some((r) => /grid-template-columns|grid-template-areas/.test(r.decls.map((d) => d.prop).join(' ')));
              return single || 'the media query should rewrite the grid to a single column';
            }),
            T.css('Spacing uses gap', (c) => (c.numeric('.layout', 'gap') ?? 0) > 0 || 'use `gap` for the grid spacing'),
          ],
        },
        {
          id: 'write-grid-gallery',
          kind: 'write',
          difficulty: 'medium',
          minutes: 14,
          lang: 'css',
          preview: true,
          previewHtml: `<section class="gallery">${Array.from({ length: 7 }, (_, i) => `<figure class="tile"><img src="photo${i + 1}.jpg" alt="Photo ${i + 1}"><figcaption>Shot ${i + 1}</figcaption></figure>`).join('')}</section>`,
          prompt:
            'Build a responsive photo gallery where the browser decides how many columns fit - no media queries allowed. Make every tile the ' +
            'same shape regardless of the source image, and let one hero tile span two columns and two rows.',
          requirements: [
            '`.gallery` uses `repeat(auto-fit, minmax(...))` so the column count adapts on its own',
            'Tiles keep a consistent aspect ratio with `aspect-ratio` plus `object-fit: cover`',
            'A `.tile--hero` spans two columns and two rows',
            'Gap-based spacing, no margins between tiles',
          ],
          starter: ``,
          hints: [
            '`repeat(auto-fit, minmax(15rem, 1fr))` is the whole trick.',
            '`object-fit: cover` plus `aspect-ratio` on the `img` gives uniform tiles.',
            'Spanning needs `grid-column: span 2; grid-row: span 2`.',
          ],
          solution: `.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  grid-auto-rows: 1fr;
  gap: 1rem;
}

.tile {
  display: flex;
  flex-direction: column;
  margin: 0;
  min-width: 0;
  border-radius: 12px;
  overflow: hidden;
  background: #f1f1f5;
}

.tile img {
  display: block;
  width: 100%;
  height: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.tile figcaption {
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
}

.tile--hero {
  grid-column: span 2;
  grid-row: span 2;
}`,
          checks: [
            T.css('The gallery uses an auto-fitting grid', (c) => {
              if (c.value('.gallery', 'display') !== 'grid') return 'set `display: grid` on `.gallery`';
              const cols = String(c.value('.gallery', 'grid-template-columns') || '');
              if (!/repeat\(/.test(cols)) return 'use `repeat(auto-fit, minmax(...))` for the columns';
              return /auto-fit|auto-fill/.test(cols) || 'use `auto-fit` or `auto-fill` so the count adapts';
            }),
            T.css('No media queries are needed', (c) => c.media().length === 0 || 'a self-sizing grid should not need media queries'),
            T.css('Tiles have a consistent shape', (c) => {
              const ar = c.value('.tile img', 'aspect-ratio') || c.value('.tile', 'aspect-ratio');
              const fit = c.value('.tile img', 'object-fit');
              if (!ar) return 'set `aspect-ratio` so every tile is the same shape';
              return fit === 'cover' || 'add `object-fit: cover` so images are not stretched';
            }),
            T.css('The hero tile spans two by two', (c) => {
              const col = String(c.value('.tile--hero', 'grid-column') || c.value('.tile--hero', 'grid-column-end') || '');
              const row = String(c.value('.tile--hero', 'grid-row') || c.value('.tile--hero', 'grid-row-end') || '');
              return (col.includes('span 2') || col === 'span 2') && (row.includes('span 2') || row === 'span 2') ||
                `grid-column: ${col || 'unset'}, grid-row: ${row || 'unset'} - both should span 2`;
            }),
            T.css('Spacing comes from gap', (c) => (c.numeric('.gallery', 'gap') ?? 0) > 0 || 'use `gap` on the gallery'),
            T.css('Tiles cannot overflow their track', (c) => {
              const minW = c.value('.tile', 'min-width');
              const maxW = c.value('.tile img', 'max-width');
              return (minW && String(minW).startsWith('0')) || maxW === '100%' || 'add `min-width: 0` on the tile so grid tracks can shrink';
            }),
          ],
        },
      ],
    },

    // ---------------------------------------------------------------------
    {
      id: 'css-06',
      title: 'Responsive Design and Component Thinking',
      minutes: 30,
      objectives: [
        'Go mobile-first without a pile of breakpoints',
        'Use modern responsive tools: clamp, container queries, aspect-ratio',
        'Turn a design into a small set of reusable classes',
      ],
      sections: [
        {
          heading: 'Mobile-first is a habit, not a rule',
          body:
            'Write the single-column layout first with no media query at all, then add `@media (min-width: ...)` blocks that add complexity ' +
            'as space appears. The result is less CSS, and it fails safe: a device you did not test still gets the simple layout.\n\n' +
            'Two or three breakpoints is plenty: content should decide where they go, not an iPhone model number. Resize the window and watch ' +
            'until something looks wrong - that is your breakpoint.',
        },
        {
          heading: 'The modern responsive toolbox',
          body:
            '- `clamp(min, preferred, max)` - fluid type and spacing\n' +
            '- `min()`, `max()` - `width: min(100%, 60rem)`\n' +
            '- `aspect-ratio: 16 / 9` - reserve space, no padding hacks\n' +
            '- `container queries` - `@container (min-width: 30rem)` lets a component respond to **its own** box, which is what you actually want for cards in a sidebar\n' +
            '- `dvh` - `100dvh` handles mobile browser chrome correctly\n' +
            '- `prefers-reduced-motion` - respect the user',
        },
        {
          heading: 'Component thinking in CSS',
          body:
            'A component is a block (`.card`) plus elements that belong to it (`.card__title`) and variants (`.card--featured`). This is BEM, ' +
            'and it is boring on purpose: every class is one word, specificity stays flat, and you can find where a style lives by reading its name.\n\n' +
            'The rule that keeps it honest: **nobody outside `.card` should style `.card__title`**. If they need to, expose a variable instead.',
          code: {
            lang: 'css',
            caption: 'a themed component',
            source: `.card {
  --card-pad: 1.25rem;
  --card-bg: #fff;
  display: grid;
  gap: 0.5rem;
  padding: var(--card-pad);
  background: var(--card-bg);
  border-radius: 12px;
}

.card--compact {
  --card-pad: 0.75rem;
}

.card--featured {
  --card-bg: #f5f8ff;
}

/* Let the container decide, not the viewport. */
.card-wrap {
  container-type: inline-size;
}

@container (min-width: 28rem) {
  .card__title {
    font-size: 1.5rem;
  }
}`,
          },
        },
        {
          heading: 'Sample code: a full responsive page in one file',
          body:
            'Mobile-first, three breakpoints, fluid type, a self-sizing card grid and a nav that becomes a wrapping row on small screens. ' +
            'This is the shape of the capstone you are heading towards.',
          code: {
            lang: 'css',
            caption: 'page.css',
            source: `:root {
  --step-0: 1rem;
  --step-1: clamp(1.15rem, 1vw + 0.9rem, 1.4rem);
  --step-2: clamp(1.6rem, 3vw + 0.8rem, 2.6rem);
  --space: clamp(1rem, 2vw, 2rem);
  --ink: #1b1b1f;
  --paper: #fbfbfd;
  --accent: #1652f0;
}

:where(*) { box-sizing: border-box; margin: 0; }

body {
  font: var(--step-0) / 1.6 system-ui, sans-serif;
  color: var(--ink);
  background: var(--paper);
}

.wrap {
  width: min(100% - 2rem, 68rem);
  margin-inline: auto;
  padding-block: var(--space);
}

.site-header nav ul {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  padding: 0;
  list-style: none;
}

.hero h1 {
  font-size: var(--step-2);
  line-height: 1.1;
  text-wrap: balance;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: var(--space);
}

@media (min-width: 48rem) {
  .hero {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    align-items: center;
    gap: var(--space);
  }
}

@media (min-width: 64rem) {
  .wrap { padding-block: calc(var(--space) * 1.5); }
}

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}`,
          },
        },
      ],
      pitfalls: [
        'Desktop-first media queries, then discovering the phone layout was never designed',
        'A breakpoint for every device instead of where the content breaks',
        '`height: 100vh` on mobile (browser chrome makes it jump) - use `100dvh`',
        '`!important` inside `prefers-reduced-motion` blocks is the one place it is acceptable, and only for durations',
      ],
      keyPoints: [
        'Write the mobile layout first with no media query',
        '`clamp()`, `min()`, `aspect-ratio`, container queries, `dvh`',
        'BEM: block, block__element, block--variant',
        'Respect `prefers-reduced-motion`',
      ],
      resources: [
        { label: 'MDN: Container queries', url: 'https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_containment/Container_queries' },
        { label: 'MDN: Responsive design', url: 'https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design' },
        { label: 'Every Layout', url: 'https://every-layout.dev/' },
      ],
      challenges: [
        {
          id: 'fix-responsive',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 15,
          lang: 'css',
          preview: true,
          previewHtml: `<div class="wrap"><section class="hero"><h1>A headline long enough to wrap on a phone</h1><p>Supporting copy.</p></section><div class="card-grid"><article class="card">One</article><article class="card">Two</article><article class="card">Three</article></div></div>`,
          prompt:
            'This stylesheet was written desktop-first and behaves badly on a phone: a fixed 1200px wrapper, a two-column hero that never ' +
            'collapses, text that ignores the user\'s font size, a grid that overflows, and animations that ignore reduced-motion preferences. ' +
            'Fix it and keep the desktop layout.',
          requirements: [
            'Mobile-first: the base styles are usable at 320px with no media query',
            'The wrapper is fluid but capped (use `min()` or `max-width` with a percentage)',
            'The hero becomes two columns only at a `min-width` breakpoint',
            'Card text sizes use `clamp()` or `rem`',
            'The grid uses `minmax(min(100%, ...), 1fr)` so it never overflows',
            'A `prefers-reduced-motion` block exists',
          ],
          starter: `.wrap {
  width: 1200px;
  margin: 0 auto;
}

.hero {
  display: grid;
  grid-template-columns: 1.1fr 0.9fr;
}

.hero h1 {
  font-size: 48px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.card {
  transition: transform 0.4s ease;
}

.card:hover {
  transform: scale(1.06);
}

@media (max-width: 768px) {
  .wrap { width: 100%; }
}`,
          hints: [
            'Start from the phone: a fluid wrapper with a max width is one line.',
            'Replace `max-width` queries with `min-width` ones and make the base layout single-column.',
            '`minmax(280px, 1fr)` cannot shrink below 280px - `minmax(min(100%, 280px), 1fr)` can.',
            '`prefers-reduced-motion: reduce` should neutralise animation and transition durations.',
          ],
          solution: `.wrap {
  width: min(100% - 2rem, 68rem);
  margin-inline: auto;
}

.hero {
  display: grid;
  gap: clamp(1rem, 3vw, 2rem);
}

.hero h1 {
  font-size: clamp(1.6rem, 4vw + 0.8rem, 2.75rem);
  line-height: 1.1;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 17rem), 1fr));
  gap: 1rem;
}

.card {
  transition: transform 0.4s ease;
}

.card:hover {
  transform: scale(1.06);
}

@media (min-width: 48rem) {
  .hero {
    grid-template-columns: 1.1fr 0.9fr;
    align-items: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  .card,
  .card:hover {
    transition-duration: 0.01ms;
    transform: none;
  }
}`,
          checks: [
            T.css('The wrapper is fluid and capped', (c) => {
              const w = String(c.value('.wrap', 'width') || c.value('.wrap', 'max-width') || '');
              if (!w) return 'give `.wrap` a width or max-width';
              if (/^\d{4,}px$/.test(w)) return `${w} is a fixed desktop width - make it fluid`;
              return /min\(|max-width|%|ch|rem|vw/.test(w) || `${w} will not adapt to a phone`;
            }),
            T.css('The base hero is a single column', (c) => {
              const cols = String(c.value('.hero', 'grid-template-columns') || '');
              if (/repeat\(auto-fit|auto-fit/.test(cols)) return true;
              if (/1\.1fr/.test(cols)) {
                const inMedia = c.media('min-width').some((r) => r.selectors.some((s) => s.includes('.hero')) && String(r.decls.find((d) => d.prop === 'grid-template-columns')?.value || '').includes('1.1fr'));
                return inMedia || 'the two-column hero should be inside a `@media (min-width: ...)` block';
              }
              return cols === '' || /1fr|minmax/.test(cols) || 'the base layout should be a single column';
            }),
            T.css('Headings scale fluidly', (c) => {
              const v = String(c.value('.hero h1', 'font-size') || '');
              if (!v) return 'set a font-size on the hero heading';
              return /clamp\(|rem|em/.test(v) || `${v} is a fixed px size that ignores user settings`;
            }),
            T.css('The card grid can shrink below its ideal width', (c) => {
              const cols = String(c.value('.card-grid', 'grid-template-columns') || '');
              if (!cols) return 'define the grid columns';
              return /minmax\(\s*min\(/.test(cols) || 'wrap the min value: `minmax(min(100%, 17rem), 1fr)`';
            }),
            T.css('Breakpoints are mobile-first', (c) => {
              const maxWidth = c.media('max-width');
              const minWidth = c.media('min-width');
              if (maxWidth.length && !minWidth.length) return 'convert the `max-width` query to a `min-width` one and make the base layout mobile';
              return minWidth.length > 0 || 'add at least one `@media (min-width: ...)` block';
            }),
            T.css('Reduced motion is respected', (c) => {
              const block = c.rules.filter((r) => String(r.media || '').includes('prefers-reduced-motion'));
              return block.length > 0 || 'add a `@media (prefers-reduced-motion: reduce)` block';
            }),
            T.css('Spacing is gap-based, not margin-hacked', (c) => (c.numeric('.card-grid', 'gap') ?? 0) > 0 || 'use `gap` on the card grid'),
          ],
        },
        {
          id: 'write-component-library',
          kind: 'write',
          difficulty: 'hard',
          minutes: 20,
          lang: 'css',
          preview: true,
          previewHtml: `<div class="stack"><button class="btn btn--primary">Primary</button><button class="btn btn--ghost" disabled>Disabled</button><div class="alert alert--success">Saved.</div><div class="alert alert--error">Something went wrong.</div><article class="card card--featured"><h3 class="card__title">Card</h3><p class="card__body">Body.</p></article></div>`,
          prompt:
            'Build a small component library in one stylesheet: buttons (primary, ghost, disabled), alerts (success, error) and a card with a ' +
            'featured variant. Everything must be driven by custom properties so a consumer can retheme it without touching your file.',
          requirements: [
            'A `:root` token block (space, radius, colours) used throughout',
            '`.btn` base plus `--primary` and `--ghost` variants, and a `:disabled` state',
            '`.alert` base plus `--success` and `--error` variants',
            '`.card` with a `--featured` variant that only redefines variables',
            '`:focus-visible` styles for anything interactive',
            'Mobile-first with at least one `min-width` media query',
          ],
          starter: ``,
          hints: [
            'Define the component-level variables on the base class, then override only the variables in the variant.',
            'A `--ghost` button is a transparent background with a border and the accent colour as text.',
            '`:focus-visible` gives keyboard users an outline without upsetting mouse users.',
          ],
          solution: `:root {
  --space: 0.75rem;
  --radius: 10px;
  --ink: #1b1b1f;
  --paper: #fbfbfd;
  --accent: #1652f0;
  --accent-ink: #ffffff;
  --danger: #b3261e;
  --success: #0f7b3f;
}

:where(*) { box-sizing: border-box; margin: 0; }

.stack {
  display: grid;
  gap: 1rem;
  max-width: 48rem;
  margin-inline: auto;
  padding: 1rem;
}

.btn {
  --btn-bg: transparent;
  --btn-fg: var(--ink);
  --btn-border: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.6rem 1rem;
  border: 1px solid var(--btn-border);
  border-radius: var(--radius);
  background: var(--btn-bg);
  color: var(--btn-fg);
  font: inherit;
  cursor: pointer;
}

.btn--primary {
  --btn-bg: var(--accent);
  --btn-fg: var(--accent-ink);
  --btn-border: var(--accent);
}

.btn--ghost {
  --btn-fg: var(--accent);
  --btn-border: var(--accent);
}

.btn:disabled {
  --btn-bg: transparent;
  --btn-fg: #8a8a94;
  --btn-border: #d6d6de;
  cursor: not-allowed;
}

.btn:focus-visible,
a:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 2px;
}

.alert {
  --alert-fg: var(--ink);
  --alert-bg: #f1f1f5;
  padding: var(--space);
  border-radius: var(--radius);
  background: var(--alert-bg);
  color: var(--alert-fg);
}

.alert--success { --alert-bg: #e6f6ec; --alert-fg: var(--success); }
.alert--error   { --alert-bg: #fdecea; --alert-fg: var(--danger); }

.card {
  --card-pad: 1rem;
  --card-bg: #fff;
  padding: var(--card-pad);
  border: 1px solid #e0e0e8;
  border-radius: var(--radius);
  background: var(--card-bg);
}

.card--featured {
  --card-pad: 1.5rem;
  --card-bg: #f5f8ff;
}

.card__title { font-size: 1.2rem; }
.card__body { color: #55555e; }

@media (min-width: 40rem) {
  .stack { padding: 2rem; }
  .card--featured { --card-pad: 2rem; }
}`,
          checks: [
            T.css('A token block exists and is used', (c) => {
              const props = c.customProps();
              if (Object.keys(props).length < 4) return 'define at least four custom properties on `:root`';
              const usesVar = c.values('padding').concat(c.values('background'), c.values('border-radius')).some((v) => String(v).includes('var('));
              return usesVar || 'use the tokens with `var(--x)` in the component rules';
            }),
            T.css('Three button states are covered', (c) => {
              const missing = [];
              if (!c.value('.btn', 'padding')) missing.push('.btn base padding');
              if (!c.value('.btn--primary', 'background') && !c.value('.btn--primary', '--btn-bg')) missing.push('.btn--primary');
              if (!c.value('.btn--ghost', 'border') && !c.value('.btn--ghost', '--btn-fg') && !c.value('.btn--ghost', 'color')) missing.push('.btn--ghost');
              if (!c.rules.some((r) => r.selectors.some((s) => s.includes(':disabled')))) missing.push('.btn:disabled');
              return missing.length === 0 || `missing: ${missing.join(', ')}`;
            }),
            T.css('Alerts have both variants', (c) => {
              const missing = [];
              if (!c.value('.alert', 'padding')) missing.push('.alert base');
              if (!c.rulesFor('.alert--success').length) missing.push('.alert--success');
              if (!c.rulesFor('.alert--error').length) missing.push('.alert--error');
              return missing.length === 0 || `missing: ${missing.join(', ')}`;
            }),
            T.css('The featured card only redefines variables', (c) => {
              const rules = c.rulesFor('.card--featured');
              if (!rules.length) return 'add a `.card--featured` variant';
              const decls = rules.flatMap((r) => r.decls);
              if (!decls.length) return 'the variant is empty';
              const allVars = decls.every((d) => d.prop.startsWith('--'));
              return allVars || 'retheme by overriding custom properties, not by re-declaring padding/background';
            }),
            T.css('Interactive elements have focus styles', (c) => c.rules.some((r) => r.selectors.some((s) => s.includes(':focus-visible'))) || 'add `:focus-visible` styles'),
            T.css('There is a min-width breakpoint', (c) => c.media('min-width').length > 0 || 'add at least one `@media (min-width: ...)` block'),
            T.css('No !important', (c) => !c.rules.some((r) => r.decls.some((d) => d.important)) || 'remove the `!important`'),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'css-capstone',
    title: 'Capstone: style the personal site into something you would send a client',
    minutes: 180,
    brief:
      'Take the three HTML pages from the HTML capstone and give them a real design system. This is the module where "it works" becomes ' +
      '"it looks deliberate".\n\n' +
      'Work in `portfolio/css/styles.css`, linked from every page. Commit after each milestone so you can see the site evolve.',
    starter: `portfolio/
├── index.html
├── projects.html
├── contact.html
└── css/
    └── styles.css`,
    requirements: [
      'A `:root` token layer: type scale, colour set, spacing, radii, font stacks',
      'Global `border-box`, a zero-specificity reset, and no `!important` except inside `prefers-reduced-motion`',
      'A sticky header with a nav that works keyboard-only, including a visible `:focus-visible` state',
      'A hero section using fluid type with `clamp()` and a `min-height` that centres its content',
      'A card grid built with `repeat(auto-fit, minmax(min(100%, 17rem), 1fr))`',
      'A footer laid out with flexbox, wrapping gracefully below 640px',
      'At least one grid page shell with `grid-template-areas` (header / sidebar / main / footer)',
      'The contact page form styled with consistent spacing, real focus states and inline validation styling using `:user-invalid`',
      'Mobile-first: base styles work at 320px, then two `min-width` breakpoints add complexity',
      'A `prefers-reduced-motion` block',
      'Lighthouse accessibility score of 100 on all three pages',
    ],
    checks: [
      'Every colour in the stylesheet comes from a custom property',
      'No `#id` selectors anywhere in the stylesheet',
      'No `!important` outside a reduced-motion block',
      'Every rule\'s specificity is one class or lower',
      'The page renders without a horizontal scrollbar at 320px, 768px and 1440px',
      'Tab through the whole site: every focusable element shows a visible focus ring',
      'Text contrast passes WCAG AA (check the two darkest greys against the background)',
      'The card grid shows 1 / 2 / 3 columns as the window grows, with no media query doing it',
      'Reduced motion is honoured (check with DevTools rendering emulation)',
      'No layout shift on load: every image reserves its space',
    ],
    stretch: [
      'Add a dark theme driven by `[data-theme="dark"]` redefining the same variables',
      'Add a print stylesheet so the projects page prints cleanly',
      'Convert the type scale to a fluid `clamp()` scale with no breakpoints',
      'Run the whole stylesheet through a container-query refactor for the cards',
      'Add a `.card--featured` variant that only overrides custom properties',
    ],
  },
};
