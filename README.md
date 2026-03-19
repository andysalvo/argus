# Argus

The only AI instruction reviewer that works across all major AI coding frameworks -- Claude, Cursor, Copilot, Gemini, and Windsurf.

Argus is a GitHub App that automatically reviews AI instruction files in your repository and posts a quality score as a PR comment.

[![Install Argus](https://img.shields.io/badge/Install-Argus-blue?style=flat-square)](https://github.com/apps/argusreview/installations/new)
[![Argus Grade](https://argus.asalvocreative.com/badge/andysalvo/argus)](https://github.com/andysalvo/argus)

## Try It Locally

```bash
npx argus score CLAUDE.md
```

No install required. Scores any AI instruction file against the Governance Standard v1.1.

## Badge

Show your repo's Argus grade in your README:

```markdown
[![Argus Grade](https://argus.asalvocreative.com/badge/OWNER/REPO)](https://github.com/andysalvo/argus)
```

Or auto-detect from your git remote:

```bash
npx argus score --badge
```

## What It Does

When you push a commit or open a PR that touches any AI instruction file, Argus posts a comment with:

- A score out of 100
- A letter grade (A through F)
- Specific issues found
- Concrete fixes for each issue

### Supported Files

| File | Framework | Repos on GitHub |
|------|-----------|----------------|
| `AGENTS.md` | Open standard | 70,912 |
| `.github/copilot-instructions.md` | GitHub Copilot | 51,200 |
| `.cursor/rules/*.mdc` | Cursor | 19,584 |
| `CLAUDE.md` | Claude Code | 16,256 |
| `.cursorrules` | Cursor (legacy) | 11,536 |
| `GEMINI.md` | Gemini CLI | 6,872 |
| `.windsurfrules` | Windsurf | 2,112 |
| `agent.json` | General | -- |
| `system_prompt.*` | General | -- |
| `prompts/**/*.md` | General | -- |
| `agents/**/*.md` | General | -- |
| `instructions/**/*.md` | General | -- |

## Install

1. Go to [github.com/apps/argus/installations/new](https://github.com/apps/argusreview/installations/new)
2. Select your repositories
3. Done. Argus will review AI instruction files on every PR.

No configuration required. All file patterns are enabled by default.

## Scoring

Argus scores files against the **Argus Governance Standard v1.1** -- 13 checks with published, transparent weights and document-type-aware scoring.

### Document Type Detection

Argus automatically classifies each file as a **System Prompt** or **Project Doc**:

- **System Prompt** -- contains behavioral language like "you are", "your role", "act as". The 3 project-context checks auto-pass.
- **Project Doc** -- repository guides, contribution docs, codebase instructions. All 13 checks apply normally.

### Checks

| # | Check | Points | What It Detects |
|---|-------|--------|-----------------|
| 1 | Silent Inference | 15 | Instructions that tell agents to assume, auto-correct, or silently infer without asking |
| 2 | Authority Boundaries | 15 | Human approval requirements, code review gates, pre-commit verification |
| 3 | Scope Limitations | 12 | What agents/contributors cannot do, project constraints |
| 4 | Audit Trail | 12 | Logging, decision records, git workflow, version tracking |
| 5 | Error Handling | 10 | Error recovery, validation, verification, fallback instructions |
| 6 | Output Format | 10 | Format specs: JSON, YAML, markdown, front matter, config schemas |
| 7 | Identity Definition | 10 | Agent role/purpose, or project/repository identity |
| 8 | Vague Objectives | 10 | Whether goals are specific enough to evaluate |
| 9 | Escalation Path | 8 | When to stop and ask, documentation references, issue reporting |
| 10 | Safety & Data Handling | 8 | Privacy, security policies, responsible AI, sensitive data rules |
| 11 | Project Context | 10 | Project overview, repo structure, directory layout *(auto-pass for System Prompts)* |
| 12 | Development Workflow | 10 | Build, test, install, setup commands *(auto-pass for System Prompts)* |
| 13 | Code Conventions | 10 | Naming conventions, style guides, coding standards *(auto-pass for System Prompts)* |

**Total: 140 raw points, normalized to 100.**

### Scoring Mechanics

- **Pass** (2+ pattern matches): full points
- **Partial** (1 match): half points (rounded down)
- **Fail** (0 matches): 0 points
- **Critical failure:** If both Authority Boundaries and Scope Limitations score 0 in a System Prompt, the total is capped at D (54 max). Does not apply to Project Docs.

### Grades

| Grade | Range |
|-------|-------|
| A | 85-100 |
| B | 70-84 |
| C | 55-69 |
| D | 40-54 |
| F | 0-39 |

### Zero False Positives

Argus uses context-aware pattern matching to avoid false positives:

- `assume` is only flagged when followed by `intent`/`meaning`/`context` within 5 words
- `do not assume` is a pass, not a fail
- `help the user` only fails if no specificity exists anywhere in the document
- Markdown formatting is stripped before analysis
- All patterns are case-insensitive
- Document type detection prevents governance checks from penalizing project docs

It's better to miss a real issue than to flag something good.

## Configuration

Add `.github/argus.yml` or `argus.yml` to your repo root:

```yaml
version: 1

# Override which files to check
files:
  include:
    - "CLAUDE.md"
    - "AGENTS.md"
  exclude:
    - "examples/**"

# Score threshold (informational warning)
threshold: 70

# Optional premium scoring via x402
# See https://x402.asalvocreative.com/tools/health
premium:
  enabled: false
  endpoint: "https://x402.asalvocreative.com/tools/health"
```

## CLI

Score files locally without the GitHub App:

```bash
# Score a single file
npx argus score CLAUDE.md

# Score all instruction files in current directory
npx argus score

# JSON output for CI pipelines
npx argus score --json

# Fail CI if any file scores below 70
npx argus score --min 70

# Print badge markdown (auto-detects GitHub remote)
npx argus score --badge
```

Exit codes: `0` = all files pass, `1` = at least one file below `--min` threshold.

## Self-Hosting

Argus is open source and can be self-hosted.

### Requirements

- Node.js 20+
- A GitHub App (create one at github.com/settings/apps)

### Setup

```bash
git clone https://github.com/andysalvo/argus.git
cd argus
npm install
cp .env.example .env
# Edit .env with your GitHub App credentials
npm start
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `APP_ID` | GitHub App ID |
| `PRIVATE_KEY_PATH` | Path to the `.pem` private key file |
| `WEBHOOK_SECRET` | Webhook secret (must match GitHub App settings) |
| `PORT` | Server port (default: 3001) |

### GitHub App Permissions

| Permission | Access |
|------------|--------|
| Contents | Read |
| Pull requests | Read & Write |
| Issues | Read & Write |
| Metadata | Read |

Subscribe to events: **Push**, **Pull request**

## Comment Format

### Single File

```
## Argus Review -- B (75/100)

3 issues found in CLAUDE.md

x Authority Boundaries (0/15) -- No instruction requiring human approval...
! Vague Objectives (5/10) -- "Help the user" without measurable criteria...
v Scope Limitations (12/12) -- Clear boundaries defined.
```

### Multiple Files

```
## Argus Review -- B (78/100)

Reviewed 3 files

| File       | Grade | Score   |
|------------|-------|---------|
| CLAUDE.md  | B     | 78/100  |
| AGENTS.md  | C     | 65/100  |
| .cursorrules | A   | 91/100  |
```

## License

MIT

## Author

[Andy Salvo](https://github.com/andysalvo)
