#!/usr/bin/env node

/**
 * Argus CLI — score AI instruction files locally.
 *
 * Usage:
 *   npx argus score [files...]     Score specific files
 *   npx argus score                Score all instruction files in current dir
 *   npx argus score --json         Output as JSON
 *   npx argus score --min 70       Exit with code 1 if any file scores below 70
 *   npx argus score --badge        Print badge markdown for current repo
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { scoreFile, scoreFiles } from './scorer.js';
import { detectFiles, DEFAULT_PATTERNS } from './detector.js';

const VERSION = '1.2.0';

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

if (command === '--version' || command === '-v') {
  console.log(`argus ${VERSION}`);
  process.exit(0);
}

if (command !== 'score') {
  console.error(`Unknown command: ${command}\nRun "argus --help" for usage.`);
  process.exit(1);
}

// Parse flags
const flags = {
  json: args.includes('--json'),
  badge: args.includes('--badge'),
  min: null,
};

const minIdx = args.indexOf('--min');
if (minIdx !== -1 && args[minIdx + 1]) {
  flags.min = parseInt(args[minIdx + 1], 10);
  if (isNaN(flags.min)) {
    console.error('--min requires a number (e.g., --min 70)');
    process.exit(1);
  }
}

// Get file arguments (everything after "score" that isn't a flag or flag value)
const skipIndices = new Set();
const restArgs = args.slice(1);
for (let i = 0; i < restArgs.length; i++) {
  if (restArgs[i] === '--json' || restArgs[i] === '--badge') {
    skipIndices.add(i);
  } else if (restArgs[i] === '--min') {
    skipIndices.add(i);
    skipIndices.add(i + 1);
  }
}
const fileArgs = restArgs.filter((a, i) => !skipIndices.has(i) && !a.startsWith('--'));

// Handle --badge
if (flags.badge) {
  printBadge();
  process.exit(0);
}

// Find files to score
let filesToScore;

if (fileArgs.length > 0) {
  // Explicit files provided
  filesToScore = fileArgs.filter(f => {
    if (!fs.existsSync(f)) {
      console.error(`File not found: ${f}`);
      return false;
    }
    return true;
  });
} else {
  // Auto-detect instruction files in current directory
  filesToScore = findInstructionFiles('.');
}

if (filesToScore.length === 0) {
  console.error('No AI instruction files found.');
  console.error('Supported: CLAUDE.md, AGENTS.md, .cursorrules, GEMINI.md, .windsurfrules, and more.');
  process.exit(1);
}

// Score files
const files = filesToScore.map(f => ({
  path: f,
  content: fs.readFileSync(f, 'utf8'),
}));

const result = scoreFiles(files);

// Output
if (flags.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printResults(result);
}

// Exit code for CI
if (flags.min !== null) {
  const failing = result.files.filter(f => f.score < flags.min);
  if (failing.length > 0) {
    if (!flags.json) {
      console.log(`\n  ${failing.length} file(s) below threshold of ${flags.min}.`);
    }
    process.exit(1);
  }
}

// --- Functions ---

function printHelp() {
  console.log(`
  Argus v${VERSION} — AI instruction file reviewer
  Governance Standard v1.1 — 13 checks, 140pts normalized to 100

  Usage:
    argus score [files...]     Score specific files
    argus score                Score all instruction files in current dir
    argus score --json         Output as JSON
    argus score --min 70       Exit code 1 if any file scores below 70
    argus score --badge        Print badge markdown for current repo

  Examples:
    npx argus score CLAUDE.md
    npx argus score CLAUDE.md AGENTS.md .cursorrules
    npx argus score --min 85 --json

  Install the GitHub App for automatic PR reviews:
  https://github.com/apps/argusreview/installations/new
`);
}

function printResults(result) {
  console.log(`\n  Argus v${VERSION} · Governance Standard v1.1\n`);

  for (const file of result.files) {
    const docLabel = file.docType === 'system-prompt' ? 'System Prompt' : 'Project Doc';
    console.log(`  ${file.path} · ${docLabel} · ${file.grade} (${file.score}/100)\n`);

    for (const r of file.results) {
      const icon = r.status === 'pass' ? ' PASS' : r.status === 'partial' ? ' WARN' : ' FAIL';
      const auto = r.autoPass ? ' (auto)' : '';
      const points = `${r.points}/${r.maxPoints}`;
      console.log(`  ${icon}  ${r.name.padEnd(24)} ${points.padStart(6)}${auto}`);
    }

    if (file.issues.length > 0) {
      console.log(`\n  ${file.issues.length} issue(s):`);
      for (const issue of file.issues) {
        const icon = issue.status === 'fail' ? '  x' : '  !';
        console.log(`  ${icon} ${issue.name} (${issue.points}/${issue.maxPoints}) — ${issue.fix}`);
      }
    }

    console.log();
  }

  if (result.files.length > 1) {
    console.log(`  Summary: ${result.summary.grade} (${result.summary.score}/100)\n`);
  }

  console.log('  Install the GitHub App for automatic PR reviews:');
  console.log('  https://github.com/apps/argusreview/installations/new\n');
}

function printBadge() {
  const remote = getGitRemote();
  if (remote) {
    console.log(`[![Argus Grade](https://argus.asalvocreative.com/badge/${remote})](https://github.com/andysalvo/argus)`);
  } else {
    console.log('[![Argus Grade](https://argus.asalvocreative.com/badge/OWNER/REPO)](https://github.com/andysalvo/argus)');
    console.error('\nCould not detect GitHub remote. Replace OWNER/REPO with your repo.');
  }
}

function getGitRemote() {
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    // Parse github.com/owner/repo from SSH or HTTPS URL
    const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (match) return `${match[1]}/${match[2]}`;
  } catch {
    // Not a git repo or no remote
  }
  return null;
}

function findInstructionFiles(dir) {
  const allFiles = walkDir(dir);
  const relativePaths = allFiles.map(f => path.relative(dir, f));
  const matched = detectFiles(relativePaths);
  return matched.map(f => path.join(dir, f));
}

function walkDir(dir, results = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, results);
    } else {
      results.push(full);
    }
  }
  return results;
}
