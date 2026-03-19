# Changelog

## v1.2.0 (2026-03-19)

- **CLI:** `npx argus score` for local scoring without installing the GitHub App
  - `--json` for CI pipelines
  - `--min 70` to fail CI below threshold
  - `--badge` to print badge markdown with auto-detected owner/repo
- **Check Runs:** Argus now reports a GitHub Check status on PRs (pass/fail based on threshold)
- **Landing page:** Redesigned with "try locally" CTA and live badge
- **CHANGELOG:** Added
- **Dogfooding:** Added `.github/argus.yml` to the Argus repo itself

## v1.1.0 (2026-03-18)

- **Governance Standard v1.1:** 13 checks (up from 10), 140 raw points normalized to 100
- **Document type detection:** System Prompt vs Project Doc classification
- **3 new checks:** Project Context, Development Workflow, Code Conventions (auto-pass for System Prompts)
- **Broadened patterns:** Authority Boundaries, Scope Limitations, Audit Trail, Error Handling, Output Format, Identity Definition, Escalation Path, Safety & Data Handling all recognize project-level equivalents
- **Critical failure rule:** Only applies to System Prompt documents
- **Badge endpoint:** `GET /badge/:owner/:repo` redirects to shields.io

## v1.0.0 (2026-03-18)

- Initial release
- 10 governance checks, 110 raw points normalized to 100
- Supports CLAUDE.md, AGENTS.md, .cursorrules, GEMINI.md, .windsurfrules, copilot-instructions.md, and more
- GitHub App webhook server with PR comments and commit comments
- Context-aware pattern matching (zero false positives goal)
- Argus.yml configuration support
