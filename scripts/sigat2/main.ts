import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { compileProject } from '@webrad/compiler';
import { defaultUserSources, saveProjectFiles } from '../../apps/ide/main/project-files';
import { buildSigat2Project } from './build-project.js';

/**
 * Model IDs come from crypto.randomUUID(). Seeding them from a counter keeps
 * every regeneration byte-identical, so diffs show only real changes.
 */
function seedStableIds(): void {
  let next = 0;
  const randomUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
    const hex = createHash('sha256')
      .update(`sigat2:${String(next++)}`)
      .digest('hex');
    const variant = ((Number.parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  };
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: randomUUID, configurable: true });
}

/** Compiles the generated project (TypeScript + model validation), then writes it. */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const buildFlag = args.indexOf('--build');
  // Optional: also write a deployable browser build, e.g. for a local smoke test against HexAPI.
  const deployDirectory = buildFlag >= 0 ? args.splice(buildFlag, 2)[1] : undefined;
  const output = path.resolve(args[0] ?? 'examples/sigat2');
  seedStableIds();
  const { project, userSources } = buildSigat2Project();
  const sources = { ...defaultUserSources(project), ...userSources };
  const build = await fs.mkdtemp(path.join(os.tmpdir(), 'sigat2-build-'));
  try {
    const result = await compileProject(project, {
      outputDirectory: build,
      userSources: sources,
      write: false,
    });
    const problems = result.diagnostics.filter((d) => d.category === 'error');
    for (const d of result.diagnostics)
      process.stderr.write(
        `[${d.category}] ${d.source} ${d.file ?? ''}:${d.line ?? ''} ${d.message}\n`,
      );
    if (!result.success || problems.length > 0)
      throw new Error(`SIGAT2 does not compile (${problems.length} errors).`);
  } finally {
    await fs.rm(build, { recursive: true, force: true });
  }
  if (deployDirectory !== undefined) {
    const deployed = await compileProject(project, {
      outputDirectory: path.resolve(deployDirectory),
      userSources: sources,
      target: 'deploy',
    });
    if (!deployed.success) throw new Error('SIGAT2 deploy build failed.');
    process.stdout.write(`SIGAT2 build written to ${deployed.outputDirectory}.\n`);
  }
  await fs.rm(output, { recursive: true, force: true });
  await fs.mkdir(output, { recursive: true });
  await saveProjectFiles({ rootPath: output, project, userSources: sources });
  await fs.copyFile(path.join('scripts', 'sigat2', 'README.md'), path.join(output, 'README.md'));
  process.stdout.write(`SIGAT2 written to ${output} (${project.pages.length} pages).\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    (error instanceof Error ? (error.stack ?? error.message) : String(error)) + '\n',
  );
  process.exitCode = 1;
});
