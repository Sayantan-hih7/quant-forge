import { python, root, run } from './runtime.js';
try { await run(python, ['-m', 'pytest', 'engine/tests', '-q'], root); }
catch (error) { console.error(error instanceof Error ? error.message : 'Engine tests failed.'); process.exitCode = 1; }
