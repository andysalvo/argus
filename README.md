# Argus

The only AI instruction reviewer that works across all major AI coding frameworks -- Claude, Cursor, Copilot, Gemini, and Windsurf.

Argus is a GitHub App that automatically reviews AI instruction files in your repository and posts a quality score as a PR comment.

[![Install Argus](https://img.shields.io/badge/Install-Argus-blue?style=flat-square)](https://github.com/apps/argusreview/installations/new)
[![Argus Grade](https://argus.asalvocreative.com/badge/andysalvo/argus)](https://github.com/andysalvo/argus)

## Badge

Show your repo's Argus grade in your README:

```markdown
[![Argus Grade](https://argus.asalvocreative.com/badge/OWNER/REPO)](https://github.com/andysalvo/argus)
```

Replace `OWNER/REPO` with your GitHub username and repository name. Clicking the badge takes people to the Argus repo. The badge updates automatically when Argus reviews your files.

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

Argus scores files against the **Argus Governance Standard v1.0** -- 10 checks with published, transparent weights.

### Checks

| # | Check | Points | What It Detects |
|---|-------|--------|-----------------|
| 1 | Silent Inference | 15 | Instructions that tell agents to assume, auto-correct, or silently infer without asking |
| 2 | Authority Boundaries | 15 | Whether agents must get human approval before irreversible actions |
| 3 | Scope Limitations | 12 | Whether agents are told what they cannot do |
| 4 | Audit Trail | 12 | Whether agents are instructed to log decisions and actions |
| 5 | Error Handling | 10 | What agents should do when something fails |
| 6 | Output Format | 10 | Whether response format is specified |
| 7 | Identity Definition | 10 | Whether the agent's role and purpose are defined |
| 8 | Vague Objectives | 10 | Whether goals are specific enough to evaluate |
| 9 | Escalation Path | 8 | Whether agents know when to stop and ask a human |
| 10 | Data Handling | 8 | Whether sensitive data handling rules exist |

**Total: 110 raw points, normalized to 100.**

### Scoring Mechanics

- **Pass** (2+ pattern matches): full points
- **Partial** (1 match): half points (rounded down)
- **Fail** (0 matches): 0 points
- **Critical failure:** If both Authority Boundaries and Scope Limitations score 0, the total is capped at D (54 max)

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
