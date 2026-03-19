import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectFiles, DEFAULT_PATTERNS } from '../src/detector.js';

describe('detectFiles', () => {
  it('detects CLAUDE.md at root', () => {
    const result = detectFiles(['CLAUDE.md', 'src/index.js']);
    assert.deepEqual(result, ['CLAUDE.md']);
  });

  it('detects AGENTS.md at root', () => {
    const result = detectFiles(['AGENTS.md']);
    assert.deepEqual(result, ['AGENTS.md']);
  });

  it('detects nested CLAUDE.md', () => {
    const result = detectFiles(['packages/api/CLAUDE.md']);
    assert.deepEqual(result, ['packages/api/CLAUDE.md']);
  });

  it('detects nested AGENTS.md', () => {
    const result = detectFiles(['packages/core/AGENTS.md']);
    assert.deepEqual(result, ['packages/core/AGENTS.md']);
  });

  it('detects .github/copilot-instructions.md', () => {
    const result = detectFiles(['.github/copilot-instructions.md']);
    assert.deepEqual(result, ['.github/copilot-instructions.md']);
  });

  it('detects .cursor/rules/*.mdc', () => {
    const result = detectFiles(['.cursor/rules/coding-style.mdc']);
    assert.deepEqual(result, ['.cursor/rules/coding-style.mdc']);
  });

  it('detects .cursorrules', () => {
    const result = detectFiles(['.cursorrules']);
    assert.deepEqual(result, ['.cursorrules']);
  });

  it('detects GEMINI.md', () => {
    const result = detectFiles(['GEMINI.md']);
    assert.deepEqual(result, ['GEMINI.md']);
  });

  it('detects .windsurfrules', () => {
    const result = detectFiles(['.windsurfrules']);
    assert.deepEqual(result, ['.windsurfrules']);
  });

  it('detects agent.json', () => {
    const result = detectFiles(['agent.json']);
    assert.deepEqual(result, ['agent.json']);
  });

  it('detects system_prompt files', () => {
    const result = detectFiles(['config/system_prompt.txt', 'system_prompt.md']);
    assert.equal(result.length, 2);
  });

  it('detects files in prompts/ directory', () => {
    const result = detectFiles(['prompts/coding.md']);
    assert.deepEqual(result, ['prompts/coding.md']);
  });

  it('detects files in agents/ directory', () => {
    const result = detectFiles(['agents/reviewer.md']);
    assert.deepEqual(result, ['agents/reviewer.md']);
  });

  it('detects files in instructions/ directory', () => {
    const result = detectFiles(['instructions/setup.md']);
    assert.deepEqual(result, ['instructions/setup.md']);
  });

  it('ignores non-matching files', () => {
    const result = detectFiles(['src/index.js', 'README.md', 'package.json']);
    assert.deepEqual(result, []);
  });

  it('detects multiple files at once', () => {
    const result = detectFiles([
      'CLAUDE.md',
      'AGENTS.md',
      '.cursorrules',
      'src/index.js',
      'GEMINI.md',
    ]);
    assert.equal(result.length, 4);
  });

  it('respects custom include patterns', () => {
    const result = detectFiles(['CLAUDE.md', 'AGENTS.md', '.cursorrules'], {
      include: ['CLAUDE.md'],
    });
    assert.deepEqual(result, ['CLAUDE.md']);
  });

  it('respects exclude patterns', () => {
    const result = detectFiles(['CLAUDE.md', 'examples/CLAUDE.md'], {
      exclude: ['examples/**'],
    });
    assert.deepEqual(result, ['CLAUDE.md']);
  });
});

describe('DEFAULT_PATTERNS', () => {
  it('has all expected patterns', () => {
    assert.ok(DEFAULT_PATTERNS.includes('CLAUDE.md'));
    assert.ok(DEFAULT_PATTERNS.includes('AGENTS.md'));
    assert.ok(DEFAULT_PATTERNS.includes('.github/copilot-instructions.md'));
    assert.ok(DEFAULT_PATTERNS.includes('.cursor/rules/**/*.mdc'));
    assert.ok(DEFAULT_PATTERNS.includes('.cursorrules'));
    assert.ok(DEFAULT_PATTERNS.includes('GEMINI.md'));
    assert.ok(DEFAULT_PATTERNS.includes('.windsurfrules'));
    assert.ok(DEFAULT_PATTERNS.includes('agent.json'));
  });
});
