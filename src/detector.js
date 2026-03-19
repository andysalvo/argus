/**
 * File detection -- matches changed files against AI instruction file patterns.
 * Uses picomatch for glob matching.
 */

import picomatch from 'picomatch';

const DEFAULT_PATTERNS = [
  // AGENTS.md (70,912 repos)
  'AGENTS.md',
  '**/AGENTS.md',
  // Copilot instructions (51,200 repos)
  '.github/copilot-instructions.md',
  // Cursor rules - new format (19,584 repos)
  '.cursor/rules/**/*.mdc',
  // CLAUDE.md (16,256 repos)
  'CLAUDE.md',
  '**/CLAUDE.md',
  // Cursor rules - legacy (11,536 repos)
  '.cursorrules',
  // GEMINI.md (6,872 repos)
  'GEMINI.md',
  '**/GEMINI.md',
  // Windsurf rules (2,112 repos)
  '.windsurfrules',
  // Agent config
  'agent.json',
  // System prompt files
  '**/system_prompt*',
  // Directory-based patterns
  'prompts/**/*.md',
  'agents/**/*.md',
  'instructions/**/*.md',
];

/**
 * Filter a list of changed file paths, returning only those that match
 * AI instruction file patterns.
 *
 * @param {string[]} changedFiles - List of file paths from webhook payload
 * @param {object} [config] - Optional config overrides from argus.yml
 * @param {string[]} [config.include] - Override include patterns
 * @param {string[]} [config.exclude] - Exclude patterns
 * @returns {string[]} Matched file paths
 */
export function detectFiles(changedFiles, config = {}) {
  const includePatterns = config.include || DEFAULT_PATTERNS;
  const excludePatterns = config.exclude || [];

  const isMatch = picomatch(includePatterns, { dot: true });
  const isExcluded = excludePatterns.length > 0
    ? picomatch(excludePatterns, { dot: true })
    : () => false;

  return changedFiles.filter(file => isMatch(file) && !isExcluded(file));
}

export { DEFAULT_PATTERNS };
