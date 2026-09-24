/**
 * Runner-proofing for every test that renders through ink (spec P0-1).
 *
 * Import this STATICALLY (it is also pulled in by tests/helpers/snapshot.js).
 * Static imports evaluate before any dynamic `import('dist/harness.js')` in
 * the module body, so the env fixup below is guaranteed to run before ink's
 * module graph initializes.
 *
 * Why: ink decides AT MODULE LOAD (via the is-in-ci package) whether to stream
 * frames to stdout or buffer them until exit. With a CI variable set, ink
 * never writes intermediate frames — so every test waiting for painted
 * content waits forever. A larger timeout cannot outlast a write that never
 * happens; this, not machine speed, is what kept every cloud run red. The
 * suite fakes the terminal completely, and the app's OWN CI policy
 * (deterministic static frames) is pinned separately via the animationAllowed
 * unit tests — so the suite needs ink's streaming mode regardless of the
 * runner's CI variable. Deleting the variable here, mirroring is-in-ci's
 * truthiness rule, makes runner behavior identical to laptop behavior — which
 * is what snapshot stability and the green-CI acceptance actually require.
 */
for (const key of ['CI', 'CONTINUOUS_INTEGRATION']) {
  const v = process.env[key];
  if (v !== undefined && v !== '0' && v !== 'false') delete process.env[key];
}
