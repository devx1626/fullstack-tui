#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { main } from '../src/index.js';

if (process.env.FULLSTACK_UI === 'next') {
  const dist = new URL('../dist/main.js', import.meta.url);
  if (!existsSync(dist)) {
    process.stdout.write('FULLSTACK_UI=next requires a build. Run: npm run build\n');
    process.exit(1);
  }
  const { main: nextMain } = await import(dist.href);
  nextMain();
} else {
  main();
}
