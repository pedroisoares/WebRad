import process from 'node:process';
// Regenerates examples/sigat2 from scripts/sigat2 (bundled with esbuild, then run with Node).
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';

// Inside node_modules so the bundle resolves the installed dependencies.
const cache = path.join('node_modules', '.cache');
mkdirSync(cache, { recursive: true });
const directory = mkdtempSync(path.join(cache, 'sigat2-generator-'));
const outfile = path.join(directory, 'generate.mjs');
try {
  await build({
    entryPoints: ['scripts/sigat2/main.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile,
    // Bundle the TypeScript workspace packages; leave installed dependencies to Node.
    plugins: [
      {
        name: 'external-dependencies',
        setup(context) {
          context.onResolve({ filter: /^[^./]/ }, (args) =>
            args.path.startsWith('@webrad/') ? undefined : { path: args.path, external: true },
          );
        },
      },
    ],
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });
  const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
  if (result.status === 0) {
    // Keep the committed example in the repository's Prettier style.
    const args = process.argv.slice(2);
    const flag = args.indexOf('--build');
    if (flag >= 0) args.splice(flag, 2);
    const formatted = spawnSync(
      process.execPath,
      [
        'node_modules/prettier/bin/prettier.cjs',
        '--log-level',
        'warn',
        '--write',
        args[0] ?? 'examples/sigat2',
      ],
      { stdio: 'inherit' },
    );
    process.exitCode = formatted.status ?? 1;
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
