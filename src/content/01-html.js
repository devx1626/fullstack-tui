import { T } from '../core/grade.js';

export default {
  id: 'html',
  title: 'HTML',
  badge: 'HT',
  color: 'accent',
  tagline: 'Structure and meaning - the skeleton every site is built on',
  hours: 4,
  why:
    'HTML is the only thing the browser, screen readers, search engines and your future teammates all agree on. ' +
    'Get the structure right and CSS becomes easy, accessibility comes almost free, and your pages survive every redesign.',
  source: {
    course: "Dave Gray - HTML Full Course for Beginners (4h)",
    url: 'https://www.youtube.com/watch?v=mJgBOIoGihA',
    roadmap: 'https://roadmap.sh/html',
    docs: 'https://developer.mozilla.org/en-US/docs/Web/HTML',
  },
  lessons: [
    {
      id: 'html-01',
      title: 'The Document Skeleton',
      minutes: 20,
      objectives: [
        'Write a valid HTML5 document from memory',
        'Explain what the doctype, <html>, <head> and <body> actually do',
        'Know why lang and charset matter before you write a single word',
      ],
      sections: [
        {
          heading: 'Every page is the same five lines',
          body:
            'Under all the noise, an HTML document is a declaration plus a tree. The declaration tells the browser to use standards mode; ' +
            'the tree has one root (<html>) with exactly two children: <head> for *information about* the page and <body> for the page itself.\n\n' +
            'The first line must be <!DOCTYPE html> with nothing - not even a space - before it. Get that wrong and browsers fall back to ' +
            '"quirks mode", an emulation of 1990s rendering that will make your CSS behave strangely and give you hours of debugging.',
        },
        {
          heading: 'The head is metadata, not content',
          body:
            'Nothing in <head> is visible on the page. It carries the things that describe the page:\n\n' +
            '- charset="UTF-8" so accented characters and emoji do not turn into mojibake\n' +
            '- viewport so phones do not pretend to be 980px-wide desktops\n' +
            '- <title> which is what the browser tab, bookmarks and Google result show\n' +
            '- <meta name="description"> which search engines often quote\n' +
            '- <link> and <script> to pull in CSS and JS\n\n' +
            'Put these first. The charset must appear within the first 1024 bytes of the document or the browser ignores it.',
        },
        {
          heading: 'lang is an accessibility feature',
          body:
            '<html lang="en"> is not decoration. Screen readers pick a pronunciation dictionary from it, browsers offer the right ' +
            'spell-check and translation prompt, and search engines use it for regional ranking. If part of a page is in another language, ' +
            'mark that part too: <blockquote lang="fr">.',
        },
        {
          heading: 'Sample code: a complete, correct starting point',
          body: 'Save this as index.html. It is the file you should be able to type from memory after this lesson.',
          code: {
            lang: 'html',
            caption: 'index.html',
            source: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Portfolio of an aspiring fullstack developer.">
  <title>Dev | Fullstack Developer</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <h1>Dev</h1>
  <p>I build things for the web, one small project at a time.</p>

  <script src="js/main.js"></script>
</body>
</html>`,
          },
        },
      ],
      pitfalls: [
        'Putting <title> inside <body> - it will render as text and be ignored by the browser chrome',
        'Forgetting lang and shipping a page that screen readers mispronounce',
        'Loading scripts in <head> without defer so the parser blocks before your HTML exists',
      ],
      keyPoints: [
        '<!DOCTYPE html> first, byte zero, standards mode',
        '<html> lang="..." -> <head> + <body>, and nothing else',
        'charset + viewport + title are the three non-negotiables',
      ],
      resources: [
        { label: 'MDN: What is in the head?', url: 'https://developer.mozilla.org/en-US/docs/Learn/HTML/Introduction_to_HTML/The_head_metadata_in_HTML' },
        { label: 'Roadmap: HTML basics', url: 'https://roadmap.sh/html' },
      ],
      challenges: [
        {
          id: 'fix-skeleton',
          kind: 'debug',
          difficulty: 'intro',
          minutes: 6,
          lang: 'html',
          prompt:
            'This file was meant to be a valid starting document but it is quietly broken in five ways. ' +
            'Browsers are forgiving, so it still *looks* fine - which is exactly why you should fix it now rather than learn the bad habit.',
          requirements: [
            'The first line is exactly <!DOCTYPE html>',
            '<html> declares lang="en"',
            'A UTF-8 charset meta tag exists',
            'A viewport meta tag sets width=device-width',
            '<title> lives inside <head>, not <body>',
          ],
          starter: `<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
<title>My First Page</title>
  <h1>Hello</h1>
</body>
</html>`,
          hints: [
            'Line 1 is missing the declaration that switches the browser into standards mode.',
            'The <html> tag has no attribute describing the language of the document.',
            'Look at where <title> is sitting - which section of the document should it be in?',
            'Add <meta charset="UTF-8"> as the very first thing inside <head>.',
          ],
          solution: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My First Page</title>
</head>
<body>
  <h1>Hello</h1>
</body>
</html>`,
          checks: [
            T.src('Doctype is the very first thing in the file', /^\s*<!doctype html>/i, 'Nothing may come before <!DOCTYPE html>.'),
            T.dom('<html> declares a language', (d) => (d.attr('html', 'lang') || '').trim().length > 0 || 'add lang="en" to the <html> tag'),
            T.dom('A UTF-8 charset is declared', (d) => d.query('meta').some((n) => String(n.attrs.charset || '').toUpperCase() === 'UTF-8') || 'add <meta charset="UTF-8"> inside <head>'),
            T.dom('A responsive viewport is declared', (d) => (d.attr('meta[name="viewport"]', 'content') || '').includes('width=device-width') || 'the viewport meta tag is missing or does not set width=device-width'),
            T.dom('<title> lives inside <head>', (d) => d.parentTag('title') === 'head' || `the <title> parent is <${d.parentTag('title') || 'nothing'}> - it belongs inside <head>`),
          ],
        },
        {
          id: 'write-skeleton',
          kind: 'write',
          difficulty: 'intro',
          minutes: 8,
          lang: 'html',
          prompt:
            'Write a complete document skeleton for a personal blog, from a blank file. Type it out rather than pasting - ' +
            'muscle memory is the whole point of this exercise.',
          requirements: [
            'Valid HTML5 declaration and lang="en"',
            'UTF-8 charset and responsive viewport',
            'A <title> of your choosing plus a <meta name="description">',
            'A single <h1> in the body with a short paragraph under it',
          ],
          starter: ``,
          hints: [
            'Start with the declaration, then the root element, then head, then body.',
            '<meta name="description" content="..."> goes in the head next to the charset.',
          ],
          solution: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Notes on learning fullstack web development.">
  <title>Dev Notes</title>
</head>
<body>
  <h1>Dev Notes</h1>
  <p>Short write-ups about building things for the web.</p>
</body>
</html>`,
          checks: [
            T.src('Starts with the HTML5 doctype', /^\s*<!doctype html>/i),
            T.dom('<html> lang="en"', (d) => d.attr('html', 'lang') === 'en' || 'lang should be exactly "en"'),
            T.dom('charset and viewport both present', (d) =>
              (d.query('meta').some((n) => String(n.attrs.charset || '').toUpperCase() === 'UTF-8') &&
                (d.attr('meta[name="viewport"]', 'content') || '').includes('width=device-width')) ||
              'you need both <meta charset="UTF-8"> and the viewport tag'),
            T.dom('A non-empty <title>', (d) => d.text('title').length > 2 || 'give the page a real title'),
            T.dom('A description meta tag', (d) => (d.attr('meta[name="description"]', 'content') || '').length > 5 || 'add <meta name="description" content="...">'),
            T.dom('Exactly one <h1> with text', (d) => (d.count('h1') === 1 && d.text('h1').length > 0) || `found ${d.count('h1')} <h1> elements - there should be exactly one, with content`),
            T.dom('A paragraph follows the heading', (d) => d.text('p').length > 10 || 'add a short paragraph introducing the page'),
          ],
        },
      ],
    },
    {
      id: 'html-02',
      title: 'Text, Headings and Lists',
      minutes: 25,
      objectives: [
        'Use headings to describe document outline instead of to make text big',
        'Choose between <strong>/<em> and <b>/<i> for the right reason',
        'Build nested lists without breaking the tree',
      ],
      sections: [
        {
          heading: 'Headings are a table of contents',
          body:
            'A screen reader user can jump heading to heading. That only works if your headings are a real outline: one <h1> per page, ' +
            '<h2> for major sections, <h3> inside those. Never skip a level to get a smaller font - that is CSS\'s job.\n\n' +
            'The browser never shows a broken outline. Neither does a search engine. The cost lands entirely on assistive technology users, ' +
            'which is why it is the mistake worth caring about.',
        },
        {
          heading: 'Semantic text: meaning, not looks',
          body:
            '<strong> means "this is important" and <em> means "stress this word". Browsers render them bold and italic, but that is a ' +
            'side effect. <b> and <i> are for cases where you want the visual offset without added meaning - a keyword in a product name, ' +
            'a foreign term, a ship name.\n\n' +
            'Also in the toolbox: <mark> (highlighted relevance), <small> (fine print), <code> (a fragment of code), <pre> ' +
            '(preformatted block, preserves whitespace), <blockquote cite="...">, <abbr title="...">, <time datetime="...">.',
        },
        {
          heading: 'Lists come in three flavours',
          body:
            '- <ul> unordered - order does not matter (a shopping list, a nav menu)\n' +
            '- <ol> ordered - sequence matters (steps, rankings, a recipe)\n' +
            '- <dl> description list - term/definition pairs (<dt> + <dd>), perfect for glossaries and specs\n\n' +
            'Lists nest by putting the inner list **inside** an <li>, never between <li>s. That single rule fixes 90% of broken menus.',
        },
        {
          heading: 'Sample code: a structured article',
          body: 'Notice how the outline reads like a table of contents if you only look at the tags.',
          code: {
            lang: 'html',
            caption: 'article.html',
            source: `<article>
  <h1>Learning CSS the practical way</h1>
  <p>
    <strong>Start with the box model.</strong> Everything else is easier once
    <em>every</em> element is a rectangle you can reason about.
  </p>

  <h2>What to build first</h2>
  <ol>
    <li>Style one article - headings, paragraphs, links</li>
    <li>Build a card component</li>
    <li>
      Build a page layout
      <ul>
        <li>header, nav, main, footer</li>
        <li>one flex row and one grid</li>
      </ul>
    </li>
  </ol>

  <h2>Vocabulary</h2>
  <dl>
    <dt>Inline</dt>
    <dd>Flows with the text and only respects horizontal padding.</dd>
    <dt>Block</dt>
    <dd>Takes the full line and stacks with its siblings.</dd>
  </dl>

  <blockquote cite="https://developer.mozilla.org/">
    <p>The box model describes the rectangular boxes generated for elements.</p>
  </blockquote>
</article>`,
          },
        },
      ],
      pitfalls: [
        'Skipping levels (h1 then h4) because it looked right',
        'Using <br><br> to fake paragraph spacing',
        'Nesting a <ul> as a direct child of <ul> instead of inside an <li>',
        'Using <b> to make a heading when the real fix is a heading tag',
      ],
      keyPoints: [
        'One <h1>; never skip a heading level',
        'strong/em carry meaning; b/i are styling shortcuts',
        'Nested lists live inside an <li>',
      ],
      resources: [
        { label: 'MDN: HTML text fundamentals', url: 'https://developer.mozilla.org/en-US/docs/Learn/HTML/Introduction_to_HTML/HTML_text_fundamentals' },
        { label: 'MDN: Lists', url: 'https://developer.mozilla.org/en-US/docs/Learn/HTML/Introduction_to_HTML/HTML_text_fundamentals#lists' },
      ],
      challenges: [
        {
          id: 'heading-outline',
          kind: 'debug',
          difficulty: 'easy',
          minutes: 8,
          lang: 'html',
          prompt:
            'A teammate pasted this "article" together. The outline is broken and the emphasis is faked with styling tags. ' +
            'Fix the structure so the document reads as a proper outline, and keep the visual emphasis while making it semantic.',
          requirements: [
            'One <h1> only, and it comes before any <h2>',
            'No heading level is skipped (h2 -> h4 is a bug)',
            'Emphasis uses <strong> and <em> rather than <b>/<i>',
          ],
          starter: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Outline</title></head>
<body>
  <h2>Why I am learning to code</h2>
  <p>It is <b>very important</b> to me that I <i>actually</i> finish projects.</p>

  <h4>What I will build</h4>
  <p>Small things, often.</p>

  <h1>My learning log</h1>
  <h2>Week one</h2>
</body>
</html>`,
          hints: [
            'Which heading is the title of the whole page? That one is the <h1>, and it should come first.',
            'h2 jumping to h4 skips a level - what should that heading be?',
            '<b> and <i> only change appearance. Which tags add emphasis meaning?',
          ],
          solution: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Outline</title></head>
<body>
  <h1>My learning log</h1>
  <h2>Why I am learning to code</h2>
  <p>It is <strong>very important</strong> to me that I <em>actually</em> finish projects.</p>

  <h3>What I will build</h3>
  <p>Small things, often.</p>

  <h2>Week one</h2>
</body>
</html>`,
          checks: [
            T.dom('Exactly one <h1>', (d) => d.count('h1') === 1 || `found ${d.count('h1')} <h1> elements`),
            T.dom('The <h1> comes before any <h2>', (d) => {
              const h1 = d.indexOf('h1');
              const h2 = d.indexOf('h2');
              if (h1 === -1 || h2 === -1) return 'you need both an <h1> and at least one <h2>';
              return h1 < h2 || 'the <h1> should appear before the first <h2>';
            }),
            T.dom('No heading level is skipped', (d) => {
              const levels = d.query('h1,h2,h3,h4,h5,h6').map((n) => Number(n.tag[1]));
              for (let i = 1; i < levels.length; i += 1) {
                if (levels[i] - levels[i - 1] > 1) return `jumped from h${levels[i - 1]} to h${levels[i]}`;
              }
              return true;
            }),
            T.dom('The nested section is an <h3>', (d) => d.exists('h3') || 'the "What I will build" section should be an <h3>'),
            T.dom('Emphasis uses <strong>, not <b>', (d) => (!d.exists('b') && d.exists('strong')) || 'replace <b> with <strong>'),
            T.dom('Emphasis uses <em>, not <i>', (d) => (!d.exists('i') && d.exists('em')) || 'replace <i> with <em>'),
            T.dom('The emphasis still wraps real words', (d) => d.text('strong').length > 3 && d.text('em').length > 3 || 'do not lose the emphasised text'),
          ],
        },
        {
          id: 'nested-list',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 10,
          lang: 'html',
          prompt:
            'This recipe list renders, but the nesting is invalid: the inner list is a sibling of the items rather than a child of one. ' +
            'Screen readers announce the wrong number of items. Restructure it properly and add the missing vocabulary list.',
          requirements: [
            'Steps are an <ol>; the toppings are a <ul> nested inside the step it belongs to',
            'Add a <dl> with at least two <dt>/<dd> pairs explaining "knead" and "proof"',
            'No <ul> or <ol> is a direct child of another <ul> or <ol>',
          ],
          starter: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Bread</title></head>
<body>
  <h1>No-knead bread</h1>
  <ol>
    <li>Mix the dough</li>
    <ul>
      <li>500g flour</li>
      <li>375g water</li>
    </ul>
    <li>Rest for 18 hours</li>
  </ol>
</body>
</html>`,
          hints: [
            'Move the <ul> inside the <li> for "Mix the dough" instead of leaving it between two items.',
            'A <dl> holds <dt> (the term) and <dd> (the definition) pairs, in that order.',
          ],
          solution: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Bread</title></head>
<body>
  <h1>No-knead bread</h1>
  <ol>
    <li>
      Mix the dough
      <ul>
        <li>500g flour</li>
        <li>375g water</li>
      </ul>
    </li>
    <li>Rest for 18 hours</li>
  </ol>

  <h2>Vocabulary</h2>
  <dl>
    <dt>Knead</dt>
    <dd>Working the dough to develop gluten.</dd>
    <dt>Proof</dt>
    <dd>Letting the dough rest so the yeast produces gas.</dd>
  </dl>
</body>
</html>`,
          checks: [
            T.dom('An ordered list of steps exists', (d) => d.count('ol') >= 1 || 'the steps should be an <ol>'),
            T.dom('A description list with two definitions', (d) => (d.count('dt') >= 2 && d.count('dd') >= 2) || `found ${d.count('dt')} <dt> and ${d.count('dd')} <dd>`),
            T.dom('A `dt` is always followed by its `dd`', (d) => {
              const dl = d.first('dl');
              if (!dl) return 'no <dl> found';
              const tags = dl.children.filter((n) => n.tag === 'dt' || n.tag === 'dd').map((n) => n.tag);
              for (let i = 0; i < tags.length; i += 2) {
                if (tags[i] !== 'dt' || tags[i + 1] !== 'dd') return 'each <dt> must be immediately followed by its <dd>';
              }
              return true;
            }),
            T.dom('No list is a direct child of another list', (d) => {
              for (const tag of ['ul', 'ol']) {
                const child = d.query(`${tag} > ${tag}`);
                if (child.length) return `found a <${tag}> directly inside another <${tag}> - nest it inside an <li> instead`;
              }
              return true;
            }),
            T.dom('The ingredients live inside the first step', (d) => {
              const ol = d.first('ol');
              const firstLi = ol ? ol.children.find((c) => c.tag !== '#text') : null;
              return (firstLi && firstLi.tag === 'li' && firstLi.children.some((c) => c.tag === 'ul')) || 'the <ul> should be inside the first <li>';
            }),
          ],
        },
      ],
    },
    {
      id: 'html-03',
      title: 'Structuring the Page',
      minutes: 30,
      objectives: [
        'Use semantic landmarks instead of <div> for everything',
        'Choose between <section> and <article> for the right reason',
        'Implement a basic layout with header, main, and footer',
      ],
      sections: [
        {
          heading: 'Divs are for styling, Semantics are for meaning',
          body:
            'A <div> is a generic container. It tells the browser and screen reader nothing about its contents. ' +
            'Semantic tags like <header>, <main>, and <footer> are landmarks. They allow users to jump directly to the content, ' +
            'bypassing the navigation menu. This is a fundamental requirement for a professional site.',
        },
        {
          heading: 'Section vs Article',
          body:
            'A <section> is a thematic grouping of content, typically with a heading. ' +
            'An <article> is a self-contained piece of content that could be distributed independently (like a blog post or a news story). ' +
            'If you can take the content and put it on another site and it still makes sense, it is an <article>.',
        },
        {
          heading: 'The a-symmetric layout',
          body: 'Most pages follow a simple pattern: <header> -> <main> -> <footer>. Inside <main>, you use <section> and <article> to build the hierarchy.',
        },
      ],
      pitfalls: [
        'Using <section> just to wrap a div for styling',
        'Putting more than one <main> on a page',
        'Forgetting a heading inside every <section>',
      ],
      keyPoints: [
        'Landmarks enable keyboard navigation',
        'Articles are self-contained; Sections are thematic',
        'One <main> per page',
      ],
      resources: [
        { label: 'MDN: HTML Semantic Elements', url: 'https://developer.mozilla.org/en-US/docs/Glossary/Semantics' },
      ],
      challenges: [
        {
          id: 'semantic-layout',
          kind: 'write',
          difficulty: 'easy',
          minutes: 10,
          lang: 'html',
          prompt: 'Build a basic page layout using semantic tags. Include a header with a nav, a main area with one section and one article, and a footer.',
          requirements: [
            'Use <header>, <nav>, <main>, <section>, <article>, and <footer>',
            'The <main> area must contain both a <section> and an <article>',
            'Include at least one heading in each semantic area',
          ],
          starter: ``,
          hints: ['Think of it as a nested tree: Header/Main/Footer as the top level.'],
          solution: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Layout</title></head>
<body>
  <header>
    <nav><ul><li><a href="#">Home</a></li></ul></nav>
  </header>
  <main>
    <section>
      <h2>About Me</h2>
      <p>Welcome to my site.</p>
    </section>
    <article>
      <h2>My First Project</h2>
      <p>This is a self-contained project description.</p>
    </article>
  </main>
  <footer>
    <p>&copy; 2026 Dev</p>
  </footer>
</body>
</html>`,
          checks: [
            T.dom('Contains <header>', (d) => d.exists('header') || 'add a <header>'),
            T.dom('Contains <nav>', (d) => d.exists('nav') || 'add a <nav>'),
            T.dom('Contains <main>', (d) => d.exists('main') || 'add a <main>'),
            T.dom('Main contains <section>', (d) => d.query('main section').length > 0 || 'the <main> must contain a <section>'),
            T.dom('Main contains <article>', (d) => d.query('main article').length > 0 || 'the <main> must contain an <article>'),
            T.dom('Contains <footer>', (d) => d.exists('footer') || 'add a <footer>'),
          ],
        },
      ],
    },
    {
      id: 'html-04',
      title: 'Hyperlinks and Media',
      minutes: 30,
      objectives: [
        'Create internal and external links with proper security attributes',
        'Implement images with accessible alt text and explicit dimensions',
        'Embed video and audio using native HTML5 tags',
      ],
      sections: [
        {
          heading: 'The Web is a Graph of Links',
          body:
            'The <a> tag is the most powerful element in HTML. Use the href attribute to link to pages. ' +
            'For external links that open in a new tab (target="_blank"), always add rel="noopener noreferrer" ' +
            'to prevent the new page from gaining access to your window object (a security vulnerability).',
        },
        {
          heading: 'Images and Accessibility',
          body:
            'The <img> tag is an empty element. It requires an alt attribute. ' +
            'If the image is purely decorative, use an empty alt (alt=""). If it conveys meaning, describe it. ' +
            'Always provide width and height to prevent "Layout Shift" as the page loads.',
        },
        {
          heading: 'Native Media',
          body: 'Use <video> and <audio> with <source> tags. Always provide a fallback text for old browsers and the controls attribute so users can actually play the media.',
        },
      ],
      pitfalls: [
        'Using an image as a link without alt text on the image or a label on the link',
        'Forgetting rel="noopener" on target="_blank" links',
        'Using an image without width/height, causing the page to jump on load',
      ],
      keyPoints: [
        'target="_blank" needs rel="noopener noreferrer"',
        'Alt text is for screen readers; don\'t start with "Image of..."',
        'Explicit dimensions prevent layout shift',
      ],
      resources: [
        { label: 'MDN: Images', url: 'https://developer.mozilla.org/en-US/docs/Learn/HTML/Multimedia_and_embedding/Images_and_graphics' },
      ],
      challenges: [
        {
          id: 'link-security',
          kind: 'debug',
          difficulty: 'easy',
          minutes: 8,
          lang: 'html',
          prompt: 'This link is insecure and the image is causing layout shift. Fix both.',
          requirements: [
            'Add rel="noopener noreferrer" to the external link',
            'Add width and height to the image',
            'Ensure the image has alt text',
          ],
          starter: `<a href="https://google.com" target="_blank">Google</a>
<img src="banner.png">`,
          hints: ['Check the rel attribute for links that open in new tabs.', 'Add width and height attributes to the img tag.'],
          solution: `<a href="https://google.com" target="_blank" rel="noopener noreferrer">Google</a>
<img src="banner.png" alt="Company Banner" width="1200" height="400">`,
          checks: [
            T.dom('Link has rel="noopener noreferrer"', (d) => d.attr('a', 'rel') === 'noopener noreferrer' || 'add rel="noopener noreferrer" to the link'),
            T.dom('Image has dimensions', (d) => (Boolean(d.attr('img', 'width')) && Boolean(d.attr('img', 'height'))) || 'add width and height attributes to the image'),
            T.dom('Image has alt text', (d) => Boolean(d.attr('img', 'alt')) || 'add an alt attribute to the image'),
          ],
        },
      ],
    },
    {
      id: 'html-05',
      title: 'Tables',
      minutes: 25,
      objectives: [
        'Build a structurally sound table with a caption',
        'Use thead, tbody, and tfoot for logical grouping',
        'Implement scope="col" and scope="row" for accessibility',
      ],
      sections: [
        {
          heading: 'Tables are for Data, not Layout',
          body:
            'Never use tables to design your page layout - use CSS Grid or Flexbox. ' +
            'Tables are strictly for tabular data. A correct table starts with a <caption>, ' +
            'then <thead> for headers, <tbody> for data, and <tfoot> for summaries.',
        },
        {
          heading: 'The scope attribute',
          body:
            'A screen reader needs to know if a header cell (<th>) refers to the column below it or the row next to it. ' +
            'Use scope="col" for column headers and scope="row" for row headers.',
        },
      ],
      pitfalls: [
        'Using <td> for headers instead of <th>',
        'Skipping <thead> and <tbody>',
        'Forgetting a <caption>',
      ],
      keyPoints: [
        'Tables = Tabular Data only',
        'scope="col" and scope="row" are mandatory for a11y',
        'Always include a <caption>',
      ],
      resources: [
        { label: 'MDN: Tables', url: 'https://developer.mozilla.org/en-US/docs/Learn/HTML/Tables/Basics' },
      ],
      challenges: [
        {
          id: 'accessible-table',
          kind: 'write',
          difficulty: 'medium',
          minutes: 12,
          lang: 'html',
          prompt: 'Build a study schedule table with a caption, a header row (Mon, Tue, Wed), and two data rows (Study, Practice).',
          requirements: [
            'Include a <caption>',
            'Use <thead>, <tbody>',
            'Use <th> with scope="col" for the days',
            'Use <th> with scope="row" for the activities',
          ],
          starter: ``,
          hints: ['The first cell of every data row should be a <th scope="row">.'],
          solution: `<table>
  <caption>Study Schedule</caption>
  <thead>
    <tr>
      <th scope="col">Activity</th>
      <th scope="col">Mon</th>
      <th scope="col">Tue</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <th scope="row">Study</th>
      <td>2h</td>
      <td>1h</td>
    </tr>
  </tbody>
</table>`,
          checks: [
            T.dom('Contains a <caption>', (d) => d.exists('caption') || 'add a <caption>'),
            T.dom('Uses <thead> and <tbody>', (d) => (d.exists('thead') && d.exists('tbody')) || 'use <thead> and <tbody>'),
            T.dom('Column headers have scope="col"', (d) => d.query('thead th').every(n => n.attrs.scope === 'col') || 'column headers need scope="col"'),
            T.dom('Row headers have scope="row"', (d) => d.query('tbody th').every(n => n.attrs.scope === 'row') || 'row headers need scope="row"'),
          ],
        },
      ],
    },
    {
      id: 'html-06',
      title: 'Forms',
      minutes: 40,
      objectives: [
        'Connect labels to inputs via for/id',
        'Use appropriate input types for validation and mobile keyboards',
        'Group related fields using fieldset and legend',
      ],
      sections: [
        {
          heading: 'Labels: The most forgotten rule',
          body:
            'An input without a label is a failure. Use <label for="my-id"> and <input id="my-id">. ' +
            'This ensures that clicking the label focuses the input, and screen readers know what the field is for.',
        },
        {
          heading: 'Input Types and Validation',
          body:
            'Use type="email", type="tel", and type="url". These trigger the correct keyboard on mobile ' +
            'and provide built-in browser validation. Combine them with the required attribute to prevent empty submissions.',
        },
        {
          heading: 'Grouping with Fieldsets',
          body:
            'When you have a group of related inputs (like an address or a set of radio buttons), wrap them in a <fieldset> ' +
            'and provide a <legend>. This gives context to the group for assistive technology.',
        },
      ],
      pitfalls: [
        'Using placeholders as labels',
        'Forgetting the name attribute (the server won\'t receive the data)',
        'Using type="text" for everything',
      ],
      keyPoints: [
        'Label every input via for/id',
        'Use semantic types (email, tel, url)',
        'Group related inputs with <fieldset> + <legend>',
      ],
      resources: [
        { label: 'MDN: Forms', url: 'https://developer.mozilla.org/en-US/docs/Learn/Forms' },
      ],
      challenges: [
        {
          id: 'fix-form',
          kind: 'debug',
          difficulty: 'medium',
          minutes: 15,
          lang: 'html',
          prompt: 'This form is broken. Labels are not connected, an input is missing a name, and the email field is wrong.',
          requirements: [
            'Connect labels via for/id',
            'Ensure all inputs have a name attribute',
            'Set the email field to type="email" and required',
          ],
          starter: `<form>
  <label>Email</label>
  <input type="text">
  <label>Name</label>
  <input id="name">
</form>`,
          hints: ['The for attribute on the label must match the id of the input.'],
          solution: `<form>
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required>
  <label for="name">Name</label>
  <input id="name" name="name">
</form>`,
          checks: [
            T.dom('Inputs have name attributes', (d) => d.query('input').every(n => n.attrs.name) || 'all inputs need a name'),
            T.dom('Labels are connected via for/id', (d) => d.query('label').every(l => l.attrs.for && d.exists(`#${l.attrs.for}`)) || 'connect labels to inputs'),
            T.dom('Email field is type="email"', (d) => d.query('input[type=email]').length > 0 || 'use type="email"'),
          ],
        },
      ],
    },
    {
      id: 'html-07',
      title: 'Audit, Validate, Ship',
      minutes: 20,
      objectives: [
        'Run a systematic accessibility audit on your own markup',
        'Read and act on W3C validator output',
        'Know the highest-value checks to do before every commit',
      ],
      sections: [
        {
          heading: 'A checklist you can actually finish',
          body:
            'Every project, in this order:\n\n' +
            '1. Outline - do headings form a table of contents with one <h1> and no skipped levels?\n' +
            '2. Landmarks - are there header, nav, main, footer so someone can jump around?\n' +
            '3. Images - does every <img> have an alt, and is it appropriate (empty for decorative)?\n' +
            '4. Links - is the link text meaningful out of context? Do new-tab links have rel?\n' +
            '5. Forms - is every control labelled, named and typed correctly?\n' +
            '6. Keyboard - can you Tab to everything and see where focus is?\n' +
            '7. Validate - run the W3C validator; fix errors, judge warnings.\n\n' +
            'Fixing these six takes minutes and removes most of the accessibility complaints a real user would file.',
        },
        {
          heading: 'Reading validator output',
          body:
            'The W3C validator reports errors and warnings. Errors are spec violations - nested <p>, duplicate ids, an unescaped &. ' +
            'Warnings are opinions, usually about style or browser support.',
        },
      ],
      pitfalls: [
        'Treating the validator as a score to game instead of a safety net',
        'Testing only in one browser',
        'Removing focus outlines because they look untidy',
      ],
      keyPoints: [
        'Outline, landmarks, images, links, forms, keyboard, validate',
        'Duplicate id is a silent, real bug',
        'A validator pass is necessary, not sufficient',
      ],
      resources: [
        { label: 'W3C Markup Validator', url: 'https://validator.w3.org/' },
      ],
      challenges: [
        {
          id: 'a11y-audit',
          kind: 'debug',
          difficulty: 'hard',
          minutes: 15,
          lang: 'html',
          prompt: 'This page fails on nearly every audit line. Fix the duplicate id, the unlabelled image, and the nested <p>.',
          requirements: [
            'No duplicate id values',
            'Every <img> has an alt attribute',
            'No <p> nested inside another <p>',
          ],
          starter: `<h1 id="main">Title</h1>
<img src="logo.png">
<p>Hello <p>World</p></p>
<section id="main">Content</section>`,
          hints: ['Check for duplicate ids using search.', 'The <img> tag needs an alt attribute.'],
          solution: `<h1 id="title">Title</h1>
<img src="logo.png" alt="Logo">
<p>Hello World</p>
<section id="main">Content</section>`,
          checks: [
            T.dom('All ids are unique', (d) => {
              const ids = d.nodes.map((n) => n.attrs.id).filter(Boolean);
              const seen = new Set();
              const dupes = new Set();
              for (const id of ids) {
                if (seen.has(id)) dupes.add(id);
                seen.add(id);
              }
              return dupes.size === 0 || `duplicate id(s): ${[...dupes].join(', ')}`;
            }),
            T.dom('Every image has alt text', (d) => d.query('img').every(n => n.attrs.alt !== undefined) || 'add alt text to images'),
            T.dom('No nested <p>', (d) => d.query('p p').length === 0 || 'remove nested <p> tags'),
          ],
        },
      ],
    },
    {
      id: 'html-boss',
      title: 'Synthesis: The Portfolio Landing Page',
      minutes: 45,
      objectives: [
        'Combine semantic structure, metadata and accessibility habits in one real page',
        'Lay out a header, main content area and footer that a stylesheet can take over later',
        'Check your own work the way a reviewer would',
      ],
      sections: [
        {
          heading: 'One page, every habit so far',
          body:
            'A landing page is the skeleton lesson, the head lesson and the accessibility lesson stapled together: a doctype and lang on the first line, ' +
            'a nav inside a header, one h1 in main, and a footer that says who you are. Build the structure first and let the CSS module make it pretty later.\n\n' +
            'Keep every element semantic: header/main/footer for landmarks, nav for the menu, alt text on images, and a single h1 for the page title.',
        },
        {
          heading: 'What "responsive" means in CSS',
          body:
            'A page is responsive when it reflows for small screens. The cheapest honest version is a @media query that stacks the nav on narrow viewports:\n\n' +
            '@media (max-width: 600px) { nav ul { flex-direction: column; } }\n\n' +
            'The grader only asks that at least one @media block exists - the habit matters more than the exact breakpoint.',
        },
      ],
      keyPoints: [
        'Landmarks first: header, main, footer, then fill them in',
        'One h1 per page; the title lives in main',
        'A media query is the smallest honest version of responsive',
      ],
      challenges: [
        {
          id: 'portfolio-landing',
          kind: 'write',
          difficulty: 'hard',
          minutes: 45,
          lang: 'html',
          preview: true,
          prompt: 'Build a professional landing page in a single file: semantic header/main/footer structure, a nav menu, and a stylesheet in a <style> block that styles the body and reflows on small screens.',
          requirements: [
            'A <header> containing a <nav> with at least one link',
            'A <main> with exactly one <h1> and some real content',
            'A <footer> with a copyright line',
            'CSS in a <style> block: a body rule plus one @media query',
            'Every <img> has alt text',
          ],
          starter: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Portfolio</title>
  <style>\n\n  </style>
</head>
<body>\n\n</body>
</html>`,
          hints: [
            'Start with the landmarks: <header>, <main> and <footer> directly inside <body>.',
            'Put <nav><ul><li><a> inside the header, and the page title as the single <h1> inside main.',
            'Write the @media query last - @media (max-width: 600px) is an easy first one.',
          ],
          solution: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Portfolio - Ada Lovelace</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; line-height: 1.6; color: #1b1b1f; }
    header { background: #1d1d2b; color: #fff; padding: 1rem; }
    nav ul { list-style: none; display: flex; gap: 1.5rem; margin: 0; padding: 0; }
    nav a { color: #fff; text-decoration: none; }
    main { max-width: 65ch; margin: 0 auto; padding: 2rem 1rem; }
    footer { padding: 1rem; text-align: center; color: #556; }
    @media (max-width: 600px) {
      nav ul { flex-direction: column; gap: .5rem; }
    }
  </style>
</head>
<body>
  <header>
    <nav>
      <ul>
        <li><a href="#work">Work</a></li>
        <li><a href="#contact">Contact</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <h1>Ada Lovelace builds for the web</h1>
    <p>Interactive engineer. I make fast, accessible sites that are a pleasure to maintain.</p>
  </main>
  <footer>
    <p>© 2026 Ada Lovelace</p>
  </footer>
</body>
</html>`,
          checks: [
            T.dom('A <header> with a <nav> menu', (d) =>
              (d.exists('header nav') && d.query('header nav a').length >= 1) || 'put a <nav> with at least one <a> inside your <header>'),
            T.dom('A <main> with exactly one <h1>', (d) =>
              (d.exists('main h1') && d.count('h1') === 1) || 'add one <h1> inside <main> (and only one on the page)'),
            T.dom('A <footer> with a copyright line', (d) =>
              /(^|[^\w])(©|&copy;|copyright|\(c\))/i.test(d.text('footer')) || 'add a copyright line (© or "copyright") to the <footer>'),
            T.dom('Every image has alt text', (d) =>
              d.query('img').every((n) => String(n.attrs.alt ?? '').trim() !== '') || 'give every <img> a non-empty alt attribute'),
            T.css('The body is styled', (c) => c.has('body') || 'add a body { ... } rule to the <style> block'),
            T.css('The page reflows on small screens', (c) => c.media().length >= 1 || 'add one @media query'),
          ],
        },
      ],
    },
  ],

  project: {
    id: 'html-capstone',
    title: 'Capstone: a complete multi-page personal site',
    minutes: 120,
    brief:
      'Build a real site you would actually send to someone: a home page, a projects page and a contact page, all sharing the same ' +
      'semantic skeleton and navigation. Structure only - no CSS yet. If it reads well with styles disabled, it is right.\n\n' +
      'This is the same page you will style in the CSS module and make interactive in the JavaScript module, so build it somewhere you ' +
      'will keep: create a folder `portfolio/` and put `index.html`, `projects.html` and `contact.html` in it.',
    starter: `portfolio/\n├── index.html\n├── projects.html\n└── contact.html`,
    requirements: [
      'Valid HTML5 in every file: doctype, lang, charset, viewport, description',
      'The identical accessible nav on all three pages, with aria-current on the active link',
      'index.html: hero with one h1, a capabilities section of three articles, a testimonial blockquote',
      'projects.html: a data table or card grid of at least three projects',
      'contact.html: a real form with labelled, named, correctly-typed fields and a fieldset + legend',
      'A skip link on every page pointing at that page\'s main id',
      'Every image has alt plus width/height; every link has meaningful text',
      'Zero duplicate ids across each document',
    ],
    checks: [
      'All three files exist and start with <!DOCTYPE html>',
      'Every page has exactly one <h1> and no skipped heading levels',
      'Every page has header, nav[aria-label], main#main and footer',
      'The nav marks the current page with aria-current="page"',
      'Every <img> has alt, width and height',
      'Every form control has a label and a name attribute',
      'The contact form uses type="email" and type="tel" where appropriate',
      'All external links that open a new tab include rel="noopener noreferrer"',
      'No duplicate id attributes in any single document',
      'The W3C validator reports zero errors on all three pages',
      'Tab through each page: focus is always visible, order is logical',
    ],
    stretch: [
      'Add a 404.html page with the same chrome',
      'Add an RSS-friendly blog index with <article> elements and <time datetime>',
      'Run axe DevTools in the browser and fix every reported issue',
      'Add a sitemap.html that links to every page on the site',
    ],
  },
};
