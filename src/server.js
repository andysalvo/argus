/**
 * Argus -- AI instruction file reviewer.
 *
 * GitHub App webhook server. Receives push and pull_request events,
 * scores AI instruction files, and posts review comments.
 */

import 'dotenv/config';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import express from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { App } from 'octokit';
import { createNodeMiddleware } from '@octokit/webhooks';
import { detectFiles } from './detector.js';
import { scoreFiles } from './scorer.js';
import { formatComment, findExistingComment } from './commenter.js';
import { loadConfig } from './config.js';

const PORT = parseInt(process.env.PORT || '3001');
const MAX_FILE_SIZE = 1024 * 1024; // 1MB

// --- GitHub App setup ---

const privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH, 'utf8');

const ghApp = new App({
  appId: process.env.APP_ID,
  privateKey,
  webhooks: { secret: process.env.WEBHOOK_SECRET },
});

// --- Webhook handlers ---

ghApp.webhooks.on(['pull_request.opened', 'pull_request.reopened', 'pull_request.synchronize'], async ({ octokit, payload }) => {
  const { repository, pull_request } = payload;
  const owner = repository.owner.login;
  const repo = repository.name;
  const prNumber = pull_request.number;
  const ref = pull_request.head.sha;

  console.log(`[PR] ${owner}/${repo}#${prNumber} (${payload.action})`);

  try {
    // Get changed files in the PR
    const { data: prFiles } = await octokit.rest.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 300,
    });

    const changedPaths = prFiles
      .filter(f => f.status !== 'removed')
      .map(f => f.filename);

    await reviewFiles(octokit, owner, repo, ref, changedPaths, { prNumber, headSha: ref });
  } catch (err) {
    console.error(`[PR] Error reviewing ${owner}/${repo}#${prNumber}:`, err.message);
  }
});

ghApp.webhooks.on('push', async ({ octokit, payload }) => {
  const { repository, head_commit, ref: pushRef } = payload;

  if (!head_commit) return; // Tag push or empty push

  const owner = repository.owner.login;
  const repo = repository.name;
  const branch = pushRef.replace('refs/heads/', '');
  const commitSha = head_commit.id;

  console.log(`[Push] ${owner}/${repo}@${branch} (${commitSha.slice(0, 7)})`);

  try {
    // Deduplication: skip if an open PR exists for this branch
    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state: 'open',
      per_page: 1,
    });

    if (prs.length > 0) {
      console.log(`[Push] Skipping -- open PR #${prs[0].number} exists for branch ${branch}`);
      return;
    }

    // Get changed files from the push commits
    const changedPaths = [];
    for (const commit of payload.commits) {
      changedPaths.push(...(commit.added || []), ...(commit.modified || []));
    }
    const uniquePaths = [...new Set(changedPaths)];

    await reviewFiles(octokit, owner, repo, commitSha, uniquePaths, { commitSha });
  } catch (err) {
    console.error(`[Push] Error reviewing ${owner}/${repo}@${commitSha.slice(0, 7)}:`, err.message);
  }
});

ghApp.webhooks.onError((error) => {
  console.error('[Webhook] Error:', error.message);
});

// --- Core review logic ---

async function reviewFiles(octokit, owner, repo, ref, changedPaths, target) {
  // Load config
  const { config, warning: configWarning } = await loadConfig(octokit, owner, repo, ref);

  // Detect instruction files
  const fileConfig = config.files.include ? { include: config.files.include, exclude: config.files.exclude } : { exclude: config.files.exclude };
  const matched = detectFiles(changedPaths, fileConfig);

  if (matched.length === 0) {
    console.log(`  No instruction files changed.`);
    return;
  }

  console.log(`  Found ${matched.length} instruction file(s): ${matched.join(', ')}`);

  // Fetch file contents
  const files = [];
  const skipped = [];

  for (const path of matched) {
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });

      if (data.type !== 'file') {
        skipped.push(path);
        continue;
      }

      if (data.size > MAX_FILE_SIZE) {
        skipped.push(path);
        console.log(`  Skipping ${path} -- exceeds 1MB limit (${data.size} bytes)`);
        continue;
      }

      const content = Buffer.from(data.content, 'base64').toString('utf8');
      files.push({ path, content });
    } catch (err) {
      if (err.status === 404) {
        skipped.push(path);
        console.log(`  Skipping ${path} -- file not found (possibly deleted)`);
      } else {
        console.error(`  Error fetching ${path}:`, err.message);
        skipped.push(path);
      }
    }
  }

  if (files.length === 0) {
    console.log(`  All matched files were skipped.`);
    return;
  }

  // Score files
  const result = scoreFiles(files);

  // Format comment
  let body = formatComment(result, config.threshold);

  // Add config warning if present
  if (configWarning) {
    body = body.replace(
      '<!-- argus-review -->',
      `<!-- argus-review -->\n> :warning: ${configWarning}\n`,
    );
  }

  // Add skipped files note
  if (skipped.length > 0) {
    const skippedNote = `\n> ${skipped.length} file${skipped.length === 1 ? '' : 's'} skipped (deleted, inaccessible, or over 1MB).`;
    body = body.replace(
      '\n---\n',
      `${skippedNote}\n\n---\n`,
    );
  }

  // Post or update comment
  if (target.prNumber) {
    await postPRComment(octokit, owner, repo, target.prNumber, body);
  } else if (target.commitSha) {
    await postCommitComment(octokit, owner, repo, target.commitSha, body);
  }

  // Post Check Run (PR events only)
  if (target.prNumber && target.headSha) {
    await postCheckRun(octokit, owner, repo, target.headSha, result, config.threshold);
  }

  console.log(`  Posted review: ${result.summary.grade} (${result.summary.score}/100)`);
}

async function postPRComment(octokit, owner, repo, prNumber, body) {
  const existingId = await findExistingComment(octokit, owner, repo, prNumber);

  if (existingId) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingId,
      body,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }
}

async function postCheckRun(octokit, owner, repo, headSha, result, threshold) {
  try {
    const { summary, files } = result;
    const conclusion = (threshold && summary.score < threshold) ? 'failure' : 'success';

    const fileLines = files.map(f => {
      const docLabel = f.docType === 'system-prompt' ? 'System Prompt' : 'Project Doc';
      return `${f.path}: ${f.grade} (${f.score}/100) · ${docLabel}`;
    }).join('\n');

    await octokit.rest.checks.create({
      owner,
      repo,
      name: 'Argus',
      head_sha: headSha,
      status: 'completed',
      conclusion,
      output: {
        title: `${summary.grade} (${summary.score}/100)`,
        summary: `Argus Governance Standard v1.1 — ${files.length} file(s) reviewed.\n\n${fileLines}`,
      },
    });
  } catch (err) {
    console.error(`  Check run failed: ${err.message}`);
  }
}

async function postCommitComment(octokit, owner, repo, commitSha, body) {
  await octokit.rest.repos.createCommitComment({
    owner,
    repo,
    commit_sha: commitSha,
    body,
  });
}

// --- Express app ---

const app = express();

// Webhook middleware FIRST (reads raw body, verifies signature)
app.use(createNodeMiddleware(ghApp.webhooks, { path: '/api/webhook' }));

// Then Express middleware for other routes
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'argus', version: '1.2.0' });
});

app.get('/', (req, res) => {
  const html = fs.readFileSync(join(__dirname, 'landing.html'), 'utf8');
  res.type('text/html').send(html);
});

// --- Badge endpoint ---

const BADGE_COLORS = {
  A: 'brightgreen',
  B: 'green',
  C: 'yellow',
  D: 'orange',
  F: 'red',
};

app.get('/badge/:owner/:repo', async (req, res) => {
  const { owner, repo } = req.params;
  const notReviewed = 'https://img.shields.io/badge/Argus-not%20reviewed-lightgrey';

  try {
    const installOctokit = await getInstallationOctokit(owner, repo);
    if (!installOctokit) {
      return res.redirect(302, notReviewed);
    }

    // Search open PR comments first
    const score = await findScoreInPRs(installOctokit, owner, repo)
      || await findScoreInCommits(installOctokit, owner, repo);

    if (!score) {
      return res.redirect(302, notReviewed);
    }

    const color = BADGE_COLORS[score.grade] || 'lightgrey';
    const label = encodeURIComponent(`${score.grade} (${score.score}/100)`);
    res.redirect(302, `https://img.shields.io/badge/Argus-${label}-${color}`);
  } catch (err) {
    console.error(`[Badge] Error for ${owner}/${repo}:`, err.message);
    res.redirect(302, notReviewed);
  }
});

async function getInstallationOctokit(owner, repo) {
  try {
    const { data: installation } = await ghApp.octokit.request(
      'GET /repos/{owner}/{repo}/installation',
      { owner, repo },
    );
    return await ghApp.getInstallationOctokit(installation.id);
  } catch {
    return null;
  }
}

function parseScore(body) {
  if (!body || !body.includes('<!-- argus-review -->')) return null;
  const match = body.match(/(\d+)\/100/);
  if (!match) return null;
  const score = parseInt(match[1], 10);
  let grade;
  if (score >= 85) grade = 'A';
  else if (score >= 70) grade = 'B';
  else if (score >= 55) grade = 'C';
  else if (score >= 40) grade = 'D';
  else grade = 'F';
  return { score, grade };
}

async function findScoreInPRs(octokit, owner, repo) {
  try {
    const { data: prs } = await octokit.rest.pulls.list({
      owner, repo, state: 'all', sort: 'updated', direction: 'desc', per_page: 5,
    });

    for (const pr of prs) {
      const { data: comments } = await octokit.rest.issues.listComments({
        owner, repo, issue_number: pr.number, per_page: 50,
      });

      for (const comment of comments) {
        const result = parseScore(comment.body);
        if (result) return result;
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function findScoreInCommits(octokit, owner, repo) {
  try {
    const { data: commits } = await octokit.rest.repos.listCommits({
      owner, repo, per_page: 10,
    });

    for (const commit of commits) {
      const { data: comments } = await octokit.rest.repos.listCommentsForCommit({
        owner, repo, commit_sha: commit.sha, per_page: 10,
      });

      for (const comment of comments) {
        const result = parseScore(comment.body);
        if (result) return result;
      }
    }
  } catch { /* ignore */ }
  return null;
}

app.listen(PORT, '0.0.0.0', async () => {
  const { data } = await ghApp.octokit.request('/app');
  console.log(`Argus v1.2.0 listening on port ${PORT}`);
  console.log(`Authenticated as "${data.name}"`);
  console.log(`Webhook: http://localhost:${PORT}/api/webhook`);
});
