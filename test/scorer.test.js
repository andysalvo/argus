import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFile, stripMarkdown, detectDocType, CHECKS, TOTAL_RAW } from '../src/scorer.js';

describe('stripMarkdown', () => {
  it('removes headers but keeps text', () => {
    const result = stripMarkdown('## Hello World');
    assert.ok(result.includes('Hello World'));
    assert.ok(!result.includes('##'));
  });

  it('removes code blocks entirely', () => {
    const result = stripMarkdown('text before\n```js\nconst x = 1;\n```\ntext after');
    assert.ok(!result.includes('const x'));
    assert.ok(result.includes('text before'));
    assert.ok(result.includes('text after'));
  });

  it('removes inline code backticks but keeps content', () => {
    const result = stripMarkdown('Use `do not modify` here');
    assert.ok(result.includes('do not modify'));
    assert.ok(!result.includes('`'));
  });

  it('removes bold/italic markers', () => {
    const result = stripMarkdown('**bold** and *italic*');
    assert.ok(result.includes('bold'));
    assert.ok(result.includes('italic'));
  });

  it('removes link syntax but keeps text', () => {
    const result = stripMarkdown('[click here](https://example.com)');
    assert.ok(result.includes('click here'));
    assert.ok(!result.includes('https://example.com'));
  });
});

describe('detectDocType', () => {
  it('detects system prompt with "you are"', () => {
    assert.equal(detectDocType('You are a senior developer.'), 'system-prompt');
  });

  it('detects system prompt with "your role"', () => {
    assert.equal(detectDocType('Your role is to review code.'), 'system-prompt');
  });

  it('detects system prompt with "act as"', () => {
    assert.equal(detectDocType('Act as an expert in Node.js.'), 'system-prompt');
  });

  it('detects system prompt with "you will"', () => {
    assert.equal(detectDocType('You will help developers write better code.'), 'system-prompt');
  });

  it('detects system prompt with "your task"', () => {
    assert.equal(detectDocType('Your task is to analyze the codebase.'), 'system-prompt');
  });

  it('detects project doc when no behavioral language', () => {
    assert.equal(detectDocType('This project is a web application. Install with npm install.'), 'project-doc');
  });

  it('detects project doc for repo guides', () => {
    assert.equal(detectDocType('Repository structure: src/ contains source files. Run npm run build.'), 'project-doc');
  });
});

describe('CHECKS configuration', () => {
  it('has exactly 13 checks', () => {
    assert.equal(CHECKS.length, 13);
  });

  it('totals 140 raw points', () => {
    assert.equal(TOTAL_RAW, 140);
  });

  it('has 3 conditional project-doc checks', () => {
    const conditional = CHECKS.filter(c => c.conditional === 'project-doc');
    assert.equal(conditional.length, 3);
    assert.ok(conditional.find(c => c.name === 'Project Context'));
    assert.ok(conditional.find(c => c.name === 'Development Workflow'));
    assert.ok(conditional.find(c => c.name === 'Code Conventions'));
  });
});

describe('Silent Inference check', () => {
  it('passes when no bad patterns exist', () => {
    const result = scoreFile('You are an assistant. Follow instructions carefully.');
    const check = result.results.find(r => r.name === 'Silent Inference');
    assert.equal(check.status, 'pass');
    assert.equal(check.points, 15);
  });

  it('fails on auto-correct', () => {
    const result = scoreFile('You are a bot. Auto-correct any typos found.');
    const check = result.results.find(r => r.name === 'Silent Inference');
    assert.ok(check.points < 15);
  });

  it('fails on "silently"', () => {
    const result = scoreFile('You are a helper. Silently fix formatting issues.');
    const check = result.results.find(r => r.name === 'Silent Inference');
    assert.ok(check.points < 15);
  });

  it('flags "assume intent" but NOT bare "assume"', () => {
    const bareResult = scoreFile('You are a dev. You can assume the project uses Node.js.');
    const bareCheck = bareResult.results.find(r => r.name === 'Silent Inference');
    assert.equal(bareCheck.status, 'pass', 'Bare "assume" should not be flagged');

    const badResult = scoreFile('You are a dev. You should assume user intent from context.');
    const badCheck = badResult.results.find(r => r.name === 'Silent Inference');
    assert.ok(badCheck.points < 15, '"assume intent" should be flagged');
  });

  it('"do not assume" is a pass, not a fail', () => {
    const result = scoreFile('You are a reviewer. Do not assume user intent. Always ask for clarification.');
    const check = result.results.find(r => r.name === 'Silent Inference');
    assert.equal(check.status, 'pass');
    assert.equal(check.points, 15);
  });
});

describe('Authority Boundaries check', () => {
  it('passes with 2+ authority patterns', () => {
    const result = scoreFile('You are a bot. Ask the user for confirmation before deleting. Escalate critical issues.');
    const check = result.results.find(r => r.name === 'Authority Boundaries');
    assert.equal(check.status, 'pass');
    assert.equal(check.points, 15);
  });

  it('partial with 1 pattern', () => {
    const result = scoreFile('You are a bot. You should escalate critical issues.');
    const check = result.results.find(r => r.name === 'Authority Boundaries');
    assert.equal(check.status, 'partial');
    assert.equal(check.points, 7);
  });

  it('fails with no patterns', () => {
    const result = scoreFile('You are a bot. Do whatever you want.');
    const check = result.results.find(r => r.name === 'Authority Boundaries');
    assert.equal(check.status, 'fail');
    assert.equal(check.points, 0);
  });

  it('v1.1: matches review/checklist/before-commit patterns', () => {
    const result = scoreFile('Code review checklist. Run validation before committing.');
    const check = result.results.find(r => r.name === 'Authority Boundaries');
    assert.equal(check.status, 'pass', 'Review + before commit + checklist = pass');
  });
});

describe('Scope Limitations check', () => {
  it('does NOT match bare "do not" without boundary verb', () => {
    const result = scoreFile('You are a bot. Do not use emojis. Do not be rude.');
    const check = result.results.find(r => r.name === 'Scope Limitations');
    assert.equal(check.status, 'fail', 'Bare "do not" without boundary verb should not match');
  });

  it('matches "do not modify"', () => {
    const result = scoreFile('You are a bot. Do not modify files outside the src directory. Never delete production databases.');
    const check = result.results.find(r => r.name === 'Scope Limitations');
    assert.equal(check.status, 'pass');
  });

  it('v1.1: matches "will not accept" and "should not"', () => {
    const result = scoreFile('We will not accept harmful contributions. You should not submit without testing.');
    const check = result.results.find(r => r.name === 'Scope Limitations');
    assert.equal(check.status, 'pass', '"will not accept" + "should not" = pass');
  });
});

describe('Audit Trail check', () => {
  it('does NOT match "dialog" or "catalog"', () => {
    const result = scoreFile('You are a bot. Open a dialog box. Check the product catalog.');
    const check = result.results.find(r => r.name === 'Audit Trail');
    assert.equal(check.status, 'fail', '"dialog" and "catalog" should not match');
  });

  it('matches "log" as standalone word', () => {
    const result = scoreFile('You are a bot. Log all decisions. Maintain an audit trail.');
    const check = result.results.find(r => r.name === 'Audit Trail');
    assert.equal(check.status, 'pass');
  });

  it('v1.1: matches git workflow patterns', () => {
    const result = scoreFile('Create a commit for each change. Submit a pull request for review.');
    const check = result.results.find(r => r.name === 'Audit Trail');
    assert.equal(check.status, 'pass', '"commit" + "pull request" = pass');
  });
});

describe('Vague Objectives check', () => {
  it('passes when "help the user" is followed by specifics', () => {
    const result = scoreFile('You are a dev. Help the user deploy their application to production.');
    const check = result.results.find(r => r.name === 'Vague Objectives');
    assert.equal(check.status, 'pass');
  });

  it('passes when vague phrase exists but specificity elsewhere', () => {
    const result = scoreFile('You are helpful. Assist with tasks. The goal is to complete the deployment with zero downtime.');
    const check = result.results.find(r => r.name === 'Vague Objectives');
    assert.equal(check.status, 'pass');
  });

  it('fails when "help the user" has no specificity anywhere', () => {
    const result = scoreFile('You are a bot. Help the user. Be helpful. Assist with things.');
    const check = result.results.find(r => r.name === 'Vague Objectives');
    assert.ok(check.points < 10);
  });
});

describe('Safety & Data Handling check (v1.1 renamed)', () => {
  it('passes with privacy patterns', () => {
    const result = scoreFile('You are a bot. Treat all user data as confidential. Never share sensitive information.');
    const check = result.results.find(r => r.name === 'Safety & Data Handling');
    assert.equal(check.status, 'pass');
  });

  it('v1.1: passes with security/safety patterns', () => {
    const result = scoreFile('Follow responsible AI principles. Ensure safe deployment practices.');
    const check = result.results.find(r => r.name === 'Safety & Data Handling');
    assert.equal(check.status, 'pass', '"responsible" + "safe" = pass');
  });
});

describe('v1.1 new checks', () => {
  it('Project Context passes with repo structure', () => {
    const result = scoreFile('The project contains a src directory. Repository structure includes folders for tests.');
    const check = result.results.find(r => r.name === 'Project Context');
    assert.equal(check.status, 'pass');
  });

  it('Development Workflow passes with build/test commands', () => {
    const result = scoreFile('Run npm install to set up. Run npm test to validate. Build with npm run build.');
    const check = result.results.find(r => r.name === 'Development Workflow');
    assert.equal(check.status, 'pass');
  });

  it('Code Conventions passes with style/naming', () => {
    const result = scoreFile('Follow the naming convention. Use lowercase with hyphens. See the style guideline.');
    const check = result.results.find(r => r.name === 'Code Conventions');
    assert.equal(check.status, 'pass');
  });
});

describe('Conditional checks: auto-pass for system prompts', () => {
  it('auto-passes Project Context for system prompts', () => {
    const result = scoreFile('You are a code reviewer. Review all pull requests.');
    const check = result.results.find(r => r.name === 'Project Context');
    assert.equal(check.points, 10, 'Project Context should auto-pass for system prompts');
    assert.equal(check.status, 'pass');
  });

  it('auto-passes Development Workflow for system prompts', () => {
    const result = scoreFile('You are a code reviewer. Review all pull requests.');
    const check = result.results.find(r => r.name === 'Development Workflow');
    assert.equal(check.points, 10, 'Development Workflow should auto-pass for system prompts');
  });

  it('auto-passes Code Conventions for system prompts', () => {
    const result = scoreFile('You are a code reviewer. Review all pull requests.');
    const check = result.results.find(r => r.name === 'Code Conventions');
    assert.equal(check.points, 10, 'Code Conventions should auto-pass for system prompts');
  });

  it('evaluates all 3 new checks normally for project docs', () => {
    const result = scoreFile('This project has no structure info. No build commands. No style rules.');
    assert.equal(result.docType, 'project-doc');
    const pc = result.results.find(r => r.name === 'Project Context');
    const dw = result.results.find(r => r.name === 'Development Workflow');
    const cc = result.results.find(r => r.name === 'Code Conventions');
    // "project" matches in Project Context, so it gets partial
    assert.ok(pc.points <= 10);
    assert.ok(dw.points <= 10);
    assert.ok(cc.points <= 10);
  });
});

describe('Document type in scoreFile result', () => {
  it('returns docType: system-prompt', () => {
    const result = scoreFile('You are a senior engineer.');
    assert.equal(result.docType, 'system-prompt');
  });

  it('returns docType: project-doc', () => {
    const result = scoreFile('This repository contains the source code.');
    assert.equal(result.docType, 'project-doc');
  });
});

describe('Critical failure rule', () => {
  it('caps score at 54 for system prompts when both Authority Boundaries and Scope Limitations fail', () => {
    const prompt = [
      'You are a code assistant. Your role is to write code.',
      'Log all actions. Track every change in the audit history.',
      'When an error occurs, fail gracefully with a retry.',
      'Respond in structured JSON format with clear schema.',
      'The goal is to deliver working code with specific outcomes.',
      'When unsure, ask the human for guidance and defer to them.',
      'All user data is confidential and private. Do not share PII.',
    ].join('\n');

    const result = scoreFile(prompt);
    assert.equal(result.docType, 'system-prompt');
    assert.ok(result.score <= 54, `Score should be capped at 54, got ${result.score}`);
    assert.ok(result.criticalFailure);
  });

  it('does NOT apply critical failure cap to project docs', () => {
    // Project doc with no authority/scope patterns but good on other checks
    const doc = [
      'This project is a web application.',
      'The repository structure includes src/ and test/ directories.',
      'Run npm install to set up. Run npm test to validate.',
      'Follow the naming convention. Use the style guideline.',
      'Log all changes. Track every commit and pull request.',
      'Ensure validation passes. Verify before submitting.',
      'Use JSON format for configuration. YAML for front matter.',
      'The goal is to deliver a working build.',
      'Follow responsible AI principles. Keep data safe and secure.',
    ].join('\n');

    const result = scoreFile(doc);
    assert.equal(result.docType, 'project-doc');
    assert.equal(result.criticalFailure, false, 'Critical failure should not apply to project docs');
    assert.ok(result.score > 54, `Project doc should not be capped, got ${result.score}`);
  });
});

describe('Normalization', () => {
  it('normalizes 140 raw points to 100', () => {
    const prompt = [
      'You are a senior code reviewer. Your role is to ensure code quality.',
      'Always ask the user before making changes. Require confirmation for deployments. Escalate critical issues.',
      'Do not modify files outside the src directory. Access is restricted. Direct database writes are forbidden.',
      'Log all actions taken. Maintain an audit trail. Track every decision.',
      'When an error occurs, fail gracefully. Use fallback strategies. Retry transient failures.',
      'Respond in JSON format. Use structured output. Follow the schema.',
      'When unsure, defer to the user. Request human review for ambiguous cases.',
      'All data is confidential and sensitive. Do not share credentials.',
      'The goal is to achieve 100% test coverage. Success means zero regressions. Deliver the outcome within the sprint.',
    ].join('\n');

    const result = scoreFile(prompt);
    assert.equal(result.docType, 'system-prompt');
    assert.ok(result.score >= 85, `Perfect system prompt should score 85+, got ${result.score}`);
    assert.equal(result.grade, 'A');
  });
});

describe('v1.1 broadened patterns on existing checks', () => {
  it('Error Handling: matches validate/verify/ensure', () => {
    const result = scoreFile('Validate your input. Ensure all tests pass. Verify the output.');
    const check = result.results.find(r => r.name === 'Error Handling');
    assert.equal(check.status, 'pass');
  });

  it('Output Format: matches front matter/yaml/config', () => {
    const result = scoreFile('Include YAML front matter. Use proper configuration format.');
    const check = result.results.find(r => r.name === 'Output Format');
    assert.equal(check.status, 'pass');
  });

  it('Identity Definition: matches project/repository', () => {
    const result = scoreFile('This project is a CLI tool. The repository contains source code.');
    const check = result.results.find(r => r.name === 'Identity Definition');
    assert.equal(check.status, 'pass');
  });

  it('Escalation Path: matches doc references', () => {
    const result = scoreFile('See the contributing guidelines for details. Report any security concerns.');
    const check = result.results.find(r => r.name === 'Escalation Path');
    assert.equal(check.status, 'pass');
  });
});
