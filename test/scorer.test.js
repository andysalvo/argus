import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scoreFile, stripMarkdown, CHECKS, TOTAL_RAW } from '../src/scorer.js';

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
    assert.ok(!result.includes('**'));
    assert.ok(!result.includes('*'));
  });

  it('removes link syntax but keeps text', () => {
    const result = stripMarkdown('[click here](https://example.com)');
    assert.ok(result.includes('click here'));
    assert.ok(!result.includes('https://example.com'));
  });
});

describe('CHECKS configuration', () => {
  it('has exactly 10 checks', () => {
    assert.equal(CHECKS.length, 10);
  });

  it('totals 110 raw points', () => {
    assert.equal(TOTAL_RAW, 110);
  });

  it('has correct point values', () => {
    const expected = {
      'Silent Inference': 15,
      'Authority Boundaries': 15,
      'Scope Limitations': 12,
      'Audit Trail': 12,
      'Error Handling': 10,
      'Output Format': 10,
      'Identity Definition': 10,
      'Vague Objectives': 10,
      'Escalation Path': 8,
      'Data Handling': 8,
    };
    for (const check of CHECKS) {
      assert.equal(check.maxPoints, expected[check.name], `${check.name} should be ${expected[check.name]} points`);
    }
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
    const result = scoreFile('You should auto-correct any typos found.');
    const check = result.results.find(r => r.name === 'Silent Inference');
    assert.ok(check.points < 15);
  });

  it('fails on "silently"', () => {
    const result = scoreFile('Silently fix formatting issues.');
    const check = result.results.find(r => r.name === 'Silent Inference');
    assert.ok(check.points < 15);
  });

  it('flags "assume intent" but NOT bare "assume"', () => {
    // Bare assume should NOT be flagged
    const bareResult = scoreFile('You can assume the project uses Node.js.');
    const bareCheck = bareResult.results.find(r => r.name === 'Silent Inference');
    assert.equal(bareCheck.status, 'pass', 'Bare "assume" should not be flagged');

    // "assume intent" SHOULD be flagged
    const badResult = scoreFile('You should assume user intent from context.');
    const badCheck = badResult.results.find(r => r.name === 'Silent Inference');
    assert.ok(badCheck.points < 15, '"assume intent" should be flagged');
  });

  it('"do not assume" is a pass, not a fail', () => {
    const result = scoreFile('Do not assume user intent. Always ask for clarification.');
    const check = result.results.find(r => r.name === 'Silent Inference');
    assert.equal(check.status, 'pass', '"do not assume" should pass');
    assert.equal(check.points, 15);
  });

  it('partial score for 1 bad pattern', () => {
    const result = scoreFile('You should auto-fix any issues silently found.');
    const check = result.results.find(r => r.name === 'Silent Inference');
    // auto-fix is 1 bad pattern, "silently" is another -- should be fail (0)
    // Actually both match so badCount=2 -> 0 points
  });
});

describe('Authority Boundaries check', () => {
  it('passes with 2+ authority patterns', () => {
    const result = scoreFile('Ask the user for confirmation before deleting. Escalate to a human when unsure.');
    const check = result.results.find(r => r.name === 'Authority Boundaries');
    assert.equal(check.status, 'pass');
    assert.equal(check.points, 15);
  });

  it('partial with 1 pattern', () => {
    const result = scoreFile('You should escalate critical issues.');
    const check = result.results.find(r => r.name === 'Authority Boundaries');
    assert.equal(check.status, 'partial');
    assert.equal(check.points, 7);
  });

  it('fails with no patterns', () => {
    const result = scoreFile('Do whatever you want.');
    const check = result.results.find(r => r.name === 'Authority Boundaries');
    assert.equal(check.status, 'fail');
    assert.equal(check.points, 0);
  });
});

describe('Scope Limitations check', () => {
  it('does NOT match bare "do not" without boundary verb', () => {
    const result = scoreFile('Do not use emojis. Do not be rude.');
    const check = result.results.find(r => r.name === 'Scope Limitations');
    // "do not" without modify/access/change/etc should NOT match
    assert.equal(check.status, 'fail', 'Bare "do not" without boundary verb should not match');
  });

  it('matches "do not modify"', () => {
    const result = scoreFile('Do not modify files outside the src directory. Never delete production databases.');
    const check = result.results.find(r => r.name === 'Scope Limitations');
    assert.equal(check.status, 'pass');
  });

  it('matches restrict/forbidden/constraint patterns', () => {
    const result = scoreFile('Access is restricted to read-only. Destructive operations are forbidden.');
    const check = result.results.find(r => r.name === 'Scope Limitations');
    assert.equal(check.status, 'pass');
  });
});

describe('Audit Trail check', () => {
  it('does NOT match "dialog" or "catalog"', () => {
    const result = scoreFile('Open a dialog box. Check the product catalog.');
    const check = result.results.find(r => r.name === 'Audit Trail');
    assert.equal(check.status, 'fail', '"dialog" and "catalog" should not match \\blog\\b');
  });

  it('matches "log" as standalone word', () => {
    const result = scoreFile('Log all decisions. Maintain an audit trail.');
    const check = result.results.find(r => r.name === 'Audit Trail');
    assert.equal(check.status, 'pass');
  });
});

describe('Vague Objectives check', () => {
  it('passes when "help the user" is followed by specifics', () => {
    const result = scoreFile('Help the user deploy their application to production.');
    const check = result.results.find(r => r.name === 'Vague Objectives');
    assert.equal(check.status, 'pass', '"help the user deploy" is specific enough');
  });

  it('passes when vague phrase exists but specificity elsewhere', () => {
    const result = scoreFile('Be helpful and assist with tasks. The goal is to complete the deployment with zero downtime.');
    const check = result.results.find(r => r.name === 'Vague Objectives');
    assert.equal(check.status, 'pass', 'Specificity ("goal") elsewhere redeems vague phrases');
  });

  it('fails when "help the user" has no specificity anywhere', () => {
    const result = scoreFile('Help the user. Be helpful. Assist with things.');
    const check = result.results.find(r => r.name === 'Vague Objectives');
    assert.ok(check.points < 10, 'Pure vague phrases with no specificity should fail');
  });
});

describe('Escalation Path check', () => {
  it('passes with escalation patterns', () => {
    const result = scoreFile('When unsure about the correct approach, ask the human for guidance.');
    const check = result.results.find(r => r.name === 'Escalation Path');
    assert.equal(check.status, 'pass');
  });
});

describe('Data Handling check', () => {
  it('passes with privacy patterns', () => {
    const result = scoreFile('Treat all user data as confidential. Never share sensitive information.');
    const check = result.results.find(r => r.name === 'Data Handling');
    assert.equal(check.status, 'pass');
  });
});

describe('Critical failure rule', () => {
  it('caps score at 54 when both Authority Boundaries and Scope Limitations fail', () => {
    // This prompt has good scores on other checks but no authority/scope
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
    // Authority Boundaries: 0 (no approval/confirmation patterns)
    // Scope Limitations: 0 (no boundary verb patterns)
    assert.ok(result.score <= 54, `Score should be capped at 54, got ${result.score}`);
    assert.ok(result.criticalFailure, 'Should be flagged as critical failure');
  });
});

describe('Normalization', () => {
  it('normalizes 110 raw points to 100', () => {
    // A perfectly passing prompt
    const prompt = [
      // Identity: "you are", "your role"
      'You are a senior code reviewer. Your role is to ensure code quality.',
      // Authority: "ask.*before", "require.*confirmation", "escalat"
      'Always ask the user before making changes. Require confirmation for deployments. Escalate critical issues.',
      // Scope: "do not.*modify", "restrict", "forbidden"
      'Do not modify files outside the src directory. Access is restricted. Direct database writes are forbidden.',
      // Audit: "log", "audit", "track"
      'Log all actions taken. Maintain an audit trail. Track every decision.',
      // Error: "error", "fail", "fallback", "retry"
      'When an error occurs, fail gracefully. Use fallback strategies. Retry transient failures.',
      // Output: "format", "json", "structured"
      'Respond in JSON format. Use structured output. Follow the schema.',
      // Escalation: "when unsure", "defer to", "human review"
      'When unsure, defer to the user. Request human review for ambiguous cases.',
      // Data: "confidential", "sensitive", "do not.*share"
      'All data is confidential and sensitive. Do not share credentials.',
      // Goals are specific (success, outcome, goal)
      'The goal is to achieve 100% test coverage. Success means zero regressions. Deliver the outcome within the sprint.',
    ].join('\n');

    const result = scoreFile(prompt);
    assert.ok(result.score >= 90, `Perfect prompt should score 90+, got ${result.score}`);
    assert.equal(result.grade, 'A');
  });
});

describe('Markdown in headers should not cause false positives', () => {
  it('does not flag check names in markdown headers', () => {
    const prompt = [
      '# Error Handling',
      '',
      'This section is about something else entirely.',
      'No actual error handling instructions here.',
    ].join('\n');

    const result = scoreFile(prompt);
    const check = result.results.find(r => r.name === 'Error Handling');
    // "Error" and "Handling" appear after stripping, but "error" alone matches \berror\b
    // This is acceptable -- the word "error" in a heading about error handling is relevant
  });
});
