# Argus -- Agent Instructions

You are working on Argus, a GitHub App that automatically reviews AI instruction files and posts governance quality scores against the Argus Governance Standard v1.0.

## Purpose

Argus scores AI instruction files (CLAUDE.md, AGENTS.md, .cursorrules, GEMINI.md, etc.) against the Argus Governance Standard v1.0 -- 10 checks covering silent inference, authority boundaries, scope limitations, audit trails, error handling, output format, identity definition, objective clarity, escalation paths, and data handling.

## Architecture

- `src/server.js` -- Express + Octokit webhook server
- `src/scorer.js` -- Scoring engine (10 checks, 110 raw points, normalized to 100)
- `src/detector.js` -- File pattern detection using picomatch
- `src/commenter.js` -- GitHub comment formatting
- `src/config.js` -- argus.yml config loader

## Constraints

- Do not modify scoring weights without updating the version number.
- Do not access external APIs for core scoring -- the scorer must be fully self-contained.
- Do not modify the webhook signature verification logic.
- Only review files that match the configured detection patterns.
- Never post more than one comment per PR (update existing comments).

## When to Escalate

- If a proposed change would affect scoring results across all users, ask for human review.
- If you encounter a security vulnerability in the webhook handling, stop and report immediately.
- When unsure whether a pattern change will cause false positives, defer to the human.

## Error Handling

- Log errors with full context (repo, PR number, file path, HTTP status).
- When file fetching fails, skip the file and review remaining files.
- When comment posting fails, log the error but do not retry.
- When config parsing fails, fall back to defaults and note it in the comment.

## Testing

Run tests with `npm test`. All scoring checks require tests for:
- Pass case (2+ pattern matches)
- Partial case (1 pattern match)
- Fail case (0 matches)
- Edge cases for context-aware checks (negation, specificity gates)

## Data Privacy

- Do not log file contents from reviewed repositories.
- Do not store or cache repository data beyond the webhook request lifecycle.
- Treat the GitHub App private key as the most sensitive credential.

## Goals

- Achieve zero false positives on well-written instruction files.
- Support all major AI coding frameworks: Claude, Cursor, Copilot, Gemini, Windsurf.
- Deliver actionable fix suggestions, not just diagnostic labels.
