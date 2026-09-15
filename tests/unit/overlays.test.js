import test from 'node:test';
import assert from 'node:assert/strict';

const harnessReady = typeof process !== 'undefined';

test('modal and toast render and gate correctly', async (t) => {
  if (!harnessReady) t.skip('no harness');
  // The harness must be built before this suite runs (npm run test:unit does).
  let harness;
  let renderToText;
  try {
    harness = await import('../../dist/harness.js');
    ({ renderToText } = await import('../helpers/snapshot.js'));
  } catch {
    t.skip('harness not built');
    return;
  }
  const { el, Modal, Toast, render, Text } = harness;

  await t.test('Modal renders children only when open', async () => {
    const out = await renderToText(el(Modal, { title: 'Confirm', open: true }, el(Text, null, 'Save changes?')), { render });
    assert.ok(out.includes('Save changes?'), out);
    assert.ok(out.includes('Confirm'), out);
    const closed = await renderToText(el(Modal, { title: 'Confirm', open: false }, el(Text, null, 'hidden')), { render });
    assert.equal(closed.trim(), '');
  });

  await t.test('Toast renders by kind and hides when invisible', async () => {
    const ok = await renderToText(el(Toast, { message: 'Saved', kind: 'ok' }), { render });
    assert.ok(ok.includes('Saved'), ok);
    const hidden = await renderToText(el(Toast, { message: 'Saved', visible: false }), { render });
    assert.equal(hidden.trim(), '');
  });
});
