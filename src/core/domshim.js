/**
 * A small DOM implementation for the challenge sandbox.
 *
 * It is not a browser - but it supports the parts beginners actually write:
 * `querySelector`, `classList`, `textContent`, `innerHTML`, `dataset`, `style`,
 * `addEventListener`, `createElement` and `append`. That means a DOM exercise
 * can be graded by *dispatching a real click* and reading the result, which is
 * exactly how you would test it by hand.
 *
 * Built directly on top of the parser in html.js so there is one tree model.
 */

import { parse, parseFragment, serialize, textContent, queryAll } from './html.js';

const WRAPPED = Symbol('fullstack.element');

/** The document currently being built. One sandbox runs one document at a time. */
let currentDocument = null;

function makeText(value) {
  return { tag: '#text', text: String(value), children: [], parent: null, attrs: {} };
}

class ClassList {
  constructor(element) {
    this.el = element;
  }

  get _list() {
    return String(this.el.getAttribute('class') || '')
      .split(/\s+/)
      .filter(Boolean);
  }

  _write(list) {
    this.el.setAttribute('class', list.join(' '));
  }

  add(...names) {
    const list = this._list;
    for (const n of names) if (!list.includes(n)) list.push(n);
    this._write(list);
  }

  remove(...names) {
    this._write(this._list.filter((c) => !names.includes(c)));
  }

  contains(name) {
    return this._list.includes(name);
  }

  toggle(name, force) {
    const has = this.contains(name);
    const shouldAdd = force === undefined ? !has : !!force;
    if (shouldAdd) this.add(name);
    else this.remove(name);
    return shouldAdd;
  }

  replace(from, to) {
    const list = this._list.map((c) => (c === from ? to : c));
    this._write(list);
    return true;
  }

  get length() {
    return this._list.length;
  }

  toString() {
    return this._list.join(' ');
  }

  item(i) {
    return this._list[i] || null;
  }
}

class Style {
  constructor(element) {
    this._element = element;
    return new Proxy(this, {
      get(target, prop) {
        if (prop === 'setProperty') {
          return (name, value) => {
            const map = target._map();
            map[name] = String(value);
            target._flush(map);
          };
        }
        if (prop === 'getPropertyValue') {
          return (name) => target._map()[name] || '';
        }
        if (prop === 'removeProperty') {
          return (name) => {
            const map = target._map();
            delete map[name];
            target._flush(map);
          };
        }
        if (typeof prop === 'string' && target._element) return target._map()[kebab(prop)] || '';
        return undefined;
      },
      set(target, prop, value) {
        if (typeof prop !== 'string') return true;
        const map = target._map();
        if (value === '' || value == null) delete map[kebab(prop)];
        else map[kebab(prop)] = String(value);
        target._flush(map);
        return true;
      },
      has(target, prop) {
        return typeof prop === 'string' && kebab(prop) in target._map();
      },
      ownKeys(target) {
        return Object.keys(target._map());
      },
      getOwnPropertyDescriptor(target, prop) {
        const map = target._map();
        const key = kebab(String(prop));
        if (key in map) return { value: map[key], enumerable: true, configurable: true, writable: true };
        return undefined;
      },
    });
  }

  _map() {
    const out = {};
    const raw = this._element.getAttribute('style') || '';
    for (const part of raw.split(';')) {
      const i = part.indexOf(':');
      if (i === -1) continue;
      out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
    }
    return out;
  }

  _flush(map) {
    const raw = Object.entries(map)
      .map(([k, v]) => `${k}: ${v}`)
      .join('; ');
    if (raw) this._element.setAttribute('style', raw);
    else this._element.removeAttribute('style');
  }
}

const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

const CUSTOM_PROPS = ['value', 'checked', 'disabled', 'href', 'src', 'type', 'name', 'id', 'for', 'placeholder'];

class DomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles !== false;
    this.cancelable = !!options.cancelable;
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    Object.assign(this, options);
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this._stopped = true;
  }
}

class Element {
  constructor(node) {
    this[WRAPPED] = node;
    this.node = node;
    this.classList = new ClassList(this);
    this.style = new Style(this);
    this.dataset = new Proxy(
      {},
      {
        get: (_, prop) => (typeof prop === 'string' ? this.getAttribute('data-' + kebab(prop)) ?? undefined : undefined),
        set: (_, prop, value) => {
          this.setAttribute('data-' + kebab(String(prop)), value);
          return true;
        },
        has: (_, prop) => typeof prop === 'string' && this.hasAttribute('data-' + kebab(prop)),
        ownKeys: () => Object.keys(this.node.attrs).filter((k) => k.startsWith('data-')).map((k) => k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())),
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
      },
    );
  }

  // -- attributes ---------------------------------------------------------

  get tagName() {
    return this.node.tag.toUpperCase();
  }

  get nodeName() {
    return this.tagName;
  }

  getAttribute(name) {
    const key = String(name).toLowerCase();
    return key in this.node.attrs ? this.node.attrs[key] : null;
  }

  setAttribute(name, value) {
    this.node.attrs[String(name).toLowerCase()] = String(value);
  }

  removeAttribute(name) {
    delete this.node.attrs[String(name).toLowerCase()];
  }

  hasAttribute(name) {
    return String(name).toLowerCase() in this.node.attrs;
  }

  get className() {
    return this.getAttribute('class') || '';
  }

  set className(v) {
    this.setAttribute('class', v);
  }

  get id() {
    return this.getAttribute('id') || '';
  }

  set id(v) {
    this.setAttribute('id', v);
  }

  get value() {
    return this.getAttribute('value') ?? '';
  }

  set value(v) {
    this.setAttribute('value', String(v));
  }

  get checked() {
    return this.hasAttribute('checked');
  }

  set checked(v) {
    if (v) this.setAttribute('checked', '');
    else this.removeAttribute('checked');
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  set disabled(v) {
    if (v) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  get type() {
    return this.getAttribute('type') || 'text';
  }

  get textContent() {
    return textContent(this.node);
  }

  set textContent(value) {
    this.node.children = value === '' ? [] : [makeText(value)];
  }

  get innerHTML() {
    return serialize({ ...this.node, tag: '#root' });
  }

  set innerHTML(html) {
    const frag = parseFragment(String(html));
    this.node.children = frag ? frag.children : [];
  }

  get outerHTML() {
    return serialize(this.node);
  }

  // -- tree ---------------------------------------------------------------

  get children() {
    return (this.node.children || []).filter((n) => n.tag !== '#text').map(wrap);
  }

  get childNodes() {
    return (this.node.children || []).map(wrap);
  }

  get parentElement() {
    const p = this.node.parent;
    return p && p.tag !== '#root' ? wrap(p) : null;
  }

  get parentNode() {
    return this.parentElement;
  }

  get firstElementChild() {
    return this.children[0] || null;
  }

  get lastElementChild() {
    const c = this.children;
    return c[c.length - 1] || null;
  }

  get nextElementSibling() {
    const siblings = this.parentElement ? this.parentElement.children : [];
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  get previousElementSibling() {
    const siblings = this.parentElement ? this.parentElement.children : [];
    return siblings[siblings.indexOf(this) - 1] || null;
  }

  appendChild(child) {
    const node = child[WRAPPED] || child;
    node.parent = this.node;
    this.node.children.push(node);
    return child;
  }

  append(...items) {
    for (const item of items) this.appendChild(typeof item === 'string' ? wrap(makeText(item)) : item);
  }

  prepend(...items) {
    for (const item of items.reverse()) {
      const node = item[WRAPPED] || item;
      node.parent = this.node;
      this.node.children.unshift(node);
    }
  }

  removeChild(child) {
    const node = child[WRAPPED] || child;
    const i = this.node.children.indexOf(node);
    if (i !== -1) this.node.children.splice(i, 1);
    return child;
  }

  remove() {
    const p = this.node.parent;
    if (!p) return;
    const i = p.children.indexOf(this.node);
    if (i !== -1) p.children.splice(i, 1);
  }

  insertBefore(child, reference) {
    const node = child[WRAPPED] || child;
    const ref = reference ? reference[WRAPPED] || reference : null;
    const i = ref ? this.node.children.indexOf(ref) : -1;
    node.parent = this.node;
    if (i === -1) this.node.children.push(node);
    else this.node.children.splice(i, 0, node);
    return child;
  }

  insertAdjacentHTML(position, html) {
    const frag = parseFragment(String(html));
    const nodes = frag ? frag.children : [];
    if (position === 'beforeend') {
      for (const n of nodes) {
        n.parent = this.node;
        this.node.children.push(n);
      }
    } else if (position === 'afterbegin') {
      for (const n of nodes.reverse()) {
        n.parent = this.node;
        this.node.children.unshift(n);
      }
    } else if (position === 'beforebegin' && this.node.parent) {
      const p = this.node.parent;
      const idx = p.children.indexOf(this.node);
      for (const n of nodes) n.parent = p;
      p.children.splice(idx, 0, ...nodes);
    } else if (position === 'afterend' && this.node.parent) {
      const p = this.node.parent;
      const idx = p.children.indexOf(this.node) + 1;
      for (const n of nodes) n.parent = p;
      p.children.splice(idx, 0, ...nodes);
    }
  }

  // -- queries ------------------------------------------------------------

  querySelector(selector) {
    const found = queryWithin(this.node, selector);
    return found.length ? wrap(found[0]) : null;
  }

  querySelectorAll(selector) {
    return queryWithin(this.node, selector).map(wrap);
  }

  getElementsByClassName(cls) {
    return this.querySelectorAll('.' + cls);
  }

  getElementsByTagName(tag) {
    return this.querySelectorAll(tag);
  }

  closest(selector) {
    let current = this;
    while (current) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  matches(selector) {
    const candidates = this.node.parent ? queryWithin(this.node.parent, selector) : [];
    return candidates.includes(this.node);
  }

  focus() {
    this.ownerDocument().activeElement = this;
  }

  blur() {
    if (this.ownerDocument().activeElement === this) this.ownerDocument().activeElement = null;
  }

  ownerDocument() {
    return this._doc || currentDocument;
  }

  // -- events -------------------------------------------------------------

  addEventListener(type, handler, options = {}) {
    this.node.__listeners = this.node.__listeners || {};
    (this.node.__listeners[type] = this.node.__listeners[type] || []).push({ handler, once: !!options.once });
  }

  removeEventListener(type, handler) {
    const list = (this.node.__listeners || {})[type];
    if (!list) return;
    this.node.__listeners[type] = list.filter((l) => l.handler !== handler);
  }

  dispatchEvent(event) {
    const evt = typeof event === 'string' ? new DomEvent(event) : event;
    evt.target = evt.target || this;
    const chain = [];
    let current = this;
    while (current) {
      chain.push(current);
      current = evt.bubbles === false ? null : current.parentElement;
    }
    for (const el of chain) {
      evt.currentTarget = el;
      const list = ((el.node.__listeners || {})[evt.type] || []).slice();
      for (const entry of list) {
        if (typeof entry.handler === 'function') entry.handler.call(el, evt);
        else if (entry.handler && typeof entry.handler.handleEvent === 'function') entry.handler.handleEvent(evt);
        if (entry.once) el.removeEventListener(evt.type, entry.handler);
      }
      if (evt._stopped) break;
    }
    return !evt.defaultPrevented;
  }

  click() {
    return this.dispatchEvent(new DomEvent('click'));
  }
}

// -- internal helpers -------------------------------------------------------

function queryWithin(rawNode, selector) {
  return queryAll(rawNode, selector).filter((n) => n !== rawNode);
}

function wrap(node) {
  if (!node) return null;
  if (node.tag === '#text') return { node, textContent: node.text, nodeType: 3, tagName: '#text', toString: () => node.text };
  if (node[WRAPPED]) return node[WRAPPED];
  const el = new Element(node);
  node[WRAPPED] = el;
  return el;
}

class Document {
  constructor(html) {
    const parsed = parse(`<html><head></head><body>${html}</body></html>`);
    this.root = parsed;
    this._doc = this;
    this.activeElement = null;
    this.__listeners = {};
    this.documentElement = wrap(parsed.children.find((c) => c.tag === 'html'));
    this.head = wrap(this.documentElement.node.children.find((c) => c.tag === 'head'));
    this.body = wrap(this.documentElement.node.children.find((c) => c.tag === 'body'));
    currentDocument = this;
  }

  get title() {
    const t = this.querySelector('title');
    return t ? t.textContent : '';
  }

  set title(v) {
    let t = this.querySelector('title');
    if (!t) {
      t = this.createElement('title');
      this.head.appendChild(t);
    }
    t.textContent = v;
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }

  getElementsByClassName(cls) {
    return this.querySelectorAll('.' + cls);
  }

  getElementsByTagName(tag) {
    return this.querySelectorAll(tag);
  }

  createElement(tag) {
    return wrap({ tag: String(tag).toLowerCase(), attrs: {}, children: [], parent: null });
  }

  createTextNode(text) {
    return wrap(makeText(text));
  }

  addEventListener(type, handler, options = {}) {
    (this.__listeners[type] = this.__listeners[type] || []).push({ handler, once: !!options.once });
  }

  removeEventListener(type, handler) {
    const list = this.__listeners[type];
    if (list) this.__listeners[type] = list.filter((l) => l.handler !== handler);
  }

  dispatchEvent(event) {
    const evt = typeof event === 'string' ? new DomEvent(event) : event;
    for (const entry of (this.__listeners[evt.type] || []).slice()) {
      if (typeof entry.handler === 'function') entry.handler.call(this, evt);
      if (entry.once) this.removeEventListener(evt.type, entry.handler);
    }
    return !evt.defaultPrevented;
  }
}

/**
 * Build a document from an HTML fixture and return the globals to inject into
 * the sandbox plus helpers the tests can call.
 */
export function createDom(html) {
  const document = new Document(String(html ?? ''));
  const window = { document, addEventListener: (...a) => document.addEventListener(...a) };

  const fire = (target, type, options) => {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error(`no element matches "${target}"`);
    return el.dispatchEvent(new DomEvent(type, options));
  };

  return {
    document,
    window,
    Element,
    Event: DomEvent,
    __fire: (selector, type = 'click') => fire(selector, type),
    __click: (selector) => fire(selector, 'click'),
    __text: (selector) => {
      const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
      return el ? el.textContent.replace(/\s+/g, ' ').trim() : null;
    },
    __count: (selector) => document.querySelectorAll(selector).length,
    __has: (selector) => !!document.querySelector(selector),
    __value: (selector) => {
      const el = document.querySelector(selector);
      return el ? el.value : null;
    },
    __attr: (selector, name) => {
      const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
      return el ? el.getAttribute(name) : null;
    },
    __html: () => serialize(document.body.node),
  };
}
