#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const normalize = (value) => value.replaceAll('\\', '/').replace(/(?::\d+)+$/, '');
const fileArgument = /\.(?:test|spec)\.[cm]?[jt]sx?(?::\d+)*$/;

// Exported so the failure policy can be checked locally without launching a DB suite.
export function evaluateReport(report, requestedFiles = []) {
  const errors = [];
  const counts = {
    passed: report?.numPassedTests,
    failed: report?.numFailedTests,
    pending: report?.numPendingTests,
    todo: report?.numTodoTests ?? 0,
  };
  if (Object.values(counts).some((n) => !Number.isSafeInteger(n) || n < 0)
      || !Array.isArray(report?.testResults)) {
    return { counts, files: [], errors: ['Missing or invalid Vitest JSON counts/testResults'] };
  }
  const files = requestedFiles.map((requested) => {
    const wanted = normalize(requested).replace(/^\.\//, '');
    const matching = report.testResults.filter((result) => {
      const name = normalize(result.name ?? '');
      return name === wanted || name.endsWith(`/${wanted}`);
    });
    const collected = matching.reduce((n, result) => n + (result.assertionResults?.length ?? 0), 0);
    if (collected === 0) errors.push(`Requested file not collected: ${requested}`);
    return { requested, collected };
  });
  if (counts.passed + counts.failed === 0) errors.push('No tests actually executed');
  // Check assertions too, including reporter versions which distinguish todo/skipped.
  const skippedAssertions = report.testResults.some((result) =>
    result.assertionResults?.some((test) => ['pending', 'skipped', 'todo', 'disabled'].includes(test.status)));
  if (counts.pending > 0 || counts.todo > 0 || skippedAssertions) errors.push('Skipped/pending tests remain unverified');
  if (counts.failed > 0 || report.success === false
      || (report.numFailedTestSuites ?? 0) > 0 || (report.numRuntimeErrorTestSuites ?? 0) > 0) {
    errors.push('Vitest reported a failure');
  }
  return { counts, files, errors };
}

export function parseReport(stdout) {
  // Other console output may precede the final JSON reporter document.
  for (const match of stdout.matchAll(/^\s*\{/gm)) {
    try {
      const report = JSON.parse(stdout.slice(match.index).trim());
      if (Array.isArray(report.testResults)) return report;
    } catch { /* Try the next object start. */ }
  }
  throw new Error('Vitest JSON report missing');
}

function main() {
  const args = process.argv.slice(2);
  const requested = args.filter((arg) => !arg.startsWith('-') && fileArgument.test(arg));
  const run = spawnSync(process.execPath, [
    path.join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...args,
    '--passWithNoTests=false', '--reporter=json',
  ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.stderr) process.stderr.write(run.stderr);
  try {
    const result = evaluateReport(parseReport(run.stdout ?? ''), requested);
    console.log(`passed=${result.counts.passed} failed=${result.counts.failed} pending=${result.counts.pending} todo=${result.counts.todo}`);
    for (const file of result.files) console.log(`${file.requested}: collected=${file.collected}`);
    if (requested.length === 0) console.log('Requested files: none explicitly named');
    if (run.error || run.status !== 0) result.errors.push(`Vitest process failed: ${run.error?.message ?? run.signal ?? run.status}`);
    for (const error of result.errors) console.error(error);
    process.exitCode = result.errors.length ? 1 : 0;
  } catch (error) {
    console.error(error.message);
    if (run.error) console.error(run.error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
