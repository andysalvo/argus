/**
 * Config loader -- reads argus.yml from the repo.
 */

import yaml from 'js-yaml';

const DEFAULTS = {
  version: 1,
  files: {
    include: null, // null = use DEFAULT_PATTERNS from detector.js
    exclude: [],
  },
  threshold: null,
  premium: {
    enabled: false,
    endpoint: 'https://x402.asalvocreative.com/tools/health',
  },
};

/**
 * Load argus config from a repo. Tries .github/argus.yml first, then argus.yml.
 *
 * @param {import('octokit').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {string} ref - Branch or commit ref
 * @returns {Promise<{config: object, warning: string|null}>}
 */
export async function loadConfig(octokit, owner, repo, ref) {
  const paths = ['.github/argus.yml', 'argus.yml'];

  for (const path of paths) {
    try {
      const { data } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if (data.type !== 'file' || !data.content) continue;

      const content = Buffer.from(data.content, 'base64').toString('utf8');
      const parsed = yaml.load(content);

      if (!parsed || typeof parsed !== 'object') {
        return { config: DEFAULTS, warning: `Could not parse ${path}, using default configuration.` };
      }

      return {
        config: mergeConfig(parsed),
        warning: null,
      };
    } catch (err) {
      if (err.status === 404) continue;
      // Malformed YAML or other error
      return { config: DEFAULTS, warning: `Could not parse argus.yml, using default configuration.` };
    }
  }

  // No config file found, use defaults
  return { config: DEFAULTS, warning: null };
}

function mergeConfig(parsed) {
  return {
    version: parsed.version || DEFAULTS.version,
    files: {
      include: parsed.files?.include || DEFAULTS.files.include,
      exclude: parsed.files?.exclude || DEFAULTS.files.exclude,
    },
    threshold: typeof parsed.threshold === 'number' ? parsed.threshold : DEFAULTS.threshold,
    premium: {
      enabled: parsed.premium?.enabled || DEFAULTS.premium.enabled,
      endpoint: parsed.premium?.endpoint || DEFAULTS.premium.endpoint,
    },
  };
}

export { DEFAULTS };
