/**
 * Argus -- AI instruction file reviewer.
 *
 * GitHub App webhook server. Receives push and pull_request events,
 * scores AI instruction files, and posts review comments.
 */

import 'dotenv/config';
import fs from 'fs';
import express from 'express';
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

ghApp.webhooks.on(['pull_request.opened', 'pull_request.synchronize'], async ({ octokit, payload }) => {
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

    await reviewFiles(octokit, owner, repo, ref, changedPaths, { prNumber });
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
  res.json({ status: 'ok', app: 'argus', version: '1.0.0' });
});

app.get('/', (req, res) => {
  res.type('text/html').send(LANDING_HTML);
});

app.listen(PORT, '0.0.0.0', async () => {
  const { data } = await ghApp.octokit.request('/app');
  console.log(`Argus v1.0.0 listening on port ${PORT}`);
  console.log(`Authenticated as "${data.name}"`);
  console.log(`Webhook: http://localhost:${PORT}/api/webhook`);
});

// --- Landing page ---

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Argus -- AI Instruction File Reviewer</title>
  <meta name="description" content="The only AI instruction reviewer that works across Claude, Cursor, Copilot, Gemini, and Windsurf. Install on your GitHub repos for automatic governance scoring.">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; color: #d0d0d0; font-family: 'Inter', -apple-system, sans-serif; line-height: 1.7; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .wrap { max-width: 640px; padding: 3rem 2rem; }
    h1 { color: #fff; font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; }
    .tagline { color: #888; font-size: 1rem; margin-bottom: 2rem; }
    h2 { color: #aaa; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; margin: 2rem 0 0.8rem; }
    p { color: #999; font-size: 0.9rem; margin: 0.5rem 0; }
    a { color: #5b9bd5; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .btn { display: inline-block; background: #5b9bd5; color: #000; padding: 0.6rem 1.5rem; border-radius: 6px; font-weight: 600; font-size: 0.9rem; margin: 1rem 0; }
    .btn:hover { background: #7bb3e0; text-decoration: none; }
    code { background: #151515; padding: 2px 6px; border-radius: 3px; font-size: 0.85rem; color: #5b9bd5; }
    ul { list-style: none; margin: 0.5rem 0; }
    ul li { color: #999; font-size: 0.85rem; padding: 0.2rem 0; }
    ul li::before { content: "\\2713 "; color: #5b9bd5; }
    .footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #1a1a1a; color: #444; font-size: 0.75rem; }
  </style>
</head>
<body>
<div class="wrap">
  <h1>Argus</h1>
  <p class="tagline">AI instruction file reviewer for GitHub.</p>
  <p>Automatically reviews <code>CLAUDE.md</code>, <code>AGENTS.md</code>, <code>.cursorrules</code>, and 9 more file patterns. Scores against the <strong>Argus Governance Standard v1.0</strong> -- 10 checks, transparent weights, zero false positives.</p>

  <a href="https://github.com/apps/argus/installations/new" class="btn">Install on GitHub</a>

  <h2>Supported frameworks</h2>
  <ul>
    <li>Claude Code (CLAUDE.md)</li>
    <li>AGENTS.md (open standard)</li>
    <li>GitHub Copilot (copilot-instructions.md)</li>
    <li>Cursor (.cursorrules, .cursor/rules/)</li>
    <li>Gemini CLI (GEMINI.md)</li>
    <li>Windsurf (.windsurfrules)</li>
  </ul>

  <h2>What it checks</h2>
  <ul>
    <li>Silent inference patterns</li>
    <li>Authority boundaries</li>
    <li>Scope limitations</li>
    <li>Audit trail instructions</li>
    <li>Error handling</li>
    <li>Output format specification</li>
    <li>Identity definition</li>
    <li>Objective clarity</li>
    <li>Escalation paths</li>
    <li>Data handling guidelines</li>
  </ul>

  <h2>Links</h2>
  <p><a href="https://github.com/andysalvo/argus">Source code &amp; documentation</a></p>
  <p><a href="https://github.com/andysalvo/argus#scoring">Scoring methodology</a></p>

  <div class="footer">
    <p>Argus v1.0.0 -- MIT License -- Built by <a href="https://github.com/andysalvo">Andy Salvo</a></p>
  </div>
</div>
</body>
</html>`;
