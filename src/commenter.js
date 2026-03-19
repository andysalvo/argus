/**
 * Comment formatting -- builds GitHub PR/commit comment markdown.
 */

const MARKER = '<!-- argus-review -->';

const ICONS = {
  pass: ':white_check_mark:',
  partial: ':warning:',
  fail: ':x:',
};

/**
 * Format a review comment for one or more files.
 * @param {object} result - Output from scoreFiles()
 * @param {number} [threshold] - Optional threshold from config
 * @returns {string} Markdown comment body
 */
export function formatComment(result, threshold) {
  const { summary, files } = result;
  const lines = [MARKER];

  if (files.length === 1) {
    lines.push(...formatSingleFile(files[0], threshold));
  } else {
    lines.push(...formatMultiFile(summary, files, threshold));
  }

  lines.push('');
  lines.push('---');
  lines.push('*[Argus](https://github.com/andysalvo/argus) reviews AI instruction files');
  lines.push('against the [Governance Standard v1.0](https://github.com/andysalvo/argus#scoring).');
  lines.push('[Install](https://github.com/apps/argusreview/installations/new)*');

  return lines.join('\n');
}

function formatSingleFile(file, threshold) {
  const lines = [];
  const thresholdWarning = threshold && file.score < threshold
    ? `\n> :warning: Below configured threshold of ${threshold}.`
    : '';

  lines.push(`## Argus Review -- ${file.grade} (${file.score}/100)`);
  if (thresholdWarning) lines.push(thresholdWarning);
  lines.push('');

  if (file.issues.length === 0) {
    lines.push(`**No issues found in \`${file.path}\`** ${ICONS.pass}`);
    lines.push('');
    lines.push('All 10 checks passed.');
  } else {
    lines.push(`**${file.issues.length} issue${file.issues.length === 1 ? '' : 's'} found in \`${file.path}\`**`);
    lines.push('');
    lines.push(...formatIssues(file.issues));
  }

  lines.push('');
  lines.push(...formatDetailsTable(file));

  return lines;
}

function formatMultiFile(summary, files, threshold) {
  const lines = [];
  const thresholdWarning = threshold && summary.score < threshold
    ? `\n> :warning: Below configured threshold of ${threshold}.`
    : '';

  lines.push(`## Argus Review -- ${summary.grade} (${summary.score}/100)`);
  if (thresholdWarning) lines.push(thresholdWarning);
  lines.push('');
  lines.push(`**Reviewed ${files.length} files**`);
  lines.push('');

  // Summary table
  lines.push('| File | Grade | Score |');
  lines.push('|------|-------|-------|');
  for (const file of files) {
    lines.push(`| \`${file.path}\` | ${file.grade} | ${file.score}/100 |`);
  }
  lines.push('');

  // Per-file details in collapsible sections
  for (const file of files) {
    const issueCount = file.issues.length;
    const issueText = issueCount === 0
      ? 'no issues'
      : `${issueCount} issue${issueCount === 1 ? '' : 's'}`;

    lines.push(`<details>`);
    lines.push(`<summary>${file.path} -- ${file.grade} (${file.score}/100) -- ${issueText}</summary>`);
    lines.push('');

    if (issueCount === 0) {
      lines.push(`${ICONS.pass} All checks passed.`);
    } else {
      lines.push(...formatIssues(file.issues));
      lines.push('');
      lines.push(...formatDetailsTable(file));
    }

    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  return lines;
}

function formatIssues(issues) {
  const lines = [];
  for (const issue of issues) {
    const icon = ICONS[issue.status];
    lines.push(`${icon} **${issue.name}** (${issue.points}/${issue.maxPoints}) -- ${issue.fix}`);
    lines.push('');
  }
  return lines;
}

function formatDetailsTable(file) {
  const lines = [];
  lines.push('<details>');
  lines.push('<summary>All 10 checks</summary>');
  lines.push('');
  lines.push('| Check | Score | Status |');
  lines.push('|-------|-------|--------|');
  for (const r of file.results) {
    lines.push(`| ${r.name} | ${r.points}/${r.maxPoints} | ${ICONS[r.status]} |`);
  }
  lines.push('');
  lines.push('</details>');
  return lines;
}

/**
 * Find existing Argus comment on a PR.
 * @param {import('octokit').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {number} issueNumber
 * @returns {Promise<number|null>} Comment ID if found
 */
export async function findExistingComment(octokit, owner, repo, issueNumber) {
  const comments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  const existing = comments.data.find(c => c.body && c.body.startsWith(MARKER));
  return existing ? existing.id : null;
}

export { MARKER };
