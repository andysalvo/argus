import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatComment, MARKER } from '../src/commenter.js';

describe('formatComment', () => {
  it('starts with the HTML marker', () => {
    const result = {
      summary: { score: 85, grade: 'A', label: 'Excellent' },
      files: [{
        path: 'CLAUDE.md',
        score: 85,
        grade: 'A',
        label: 'Excellent',
        criticalFailure: false,
        issues: [],
        results: [
          { name: 'Silent Inference', maxPoints: 15, points: 15, status: 'pass', fix: '' },
          { name: 'Authority Boundaries', maxPoints: 15, points: 15, status: 'pass', fix: '' },
          { name: 'Scope Limitations', maxPoints: 12, points: 12, status: 'pass', fix: '' },
          { name: 'Audit Trail', maxPoints: 12, points: 12, status: 'pass', fix: '' },
          { name: 'Error Handling', maxPoints: 10, points: 10, status: 'pass', fix: '' },
          { name: 'Output Format', maxPoints: 10, points: 10, status: 'pass', fix: '' },
          { name: 'Identity Definition', maxPoints: 10, points: 10, status: 'pass', fix: '' },
          { name: 'Vague Objectives', maxPoints: 10, points: 10, status: 'pass', fix: '' },
          { name: 'Escalation Path', maxPoints: 8, points: 8, status: 'pass', fix: '' },
          { name: 'Data Handling', maxPoints: 8, points: 8, status: 'pass', fix: '' },
        ],
      }],
    };

    const comment = formatComment(result);
    assert.ok(comment.startsWith(MARKER));
  });

  it('includes grade and score in header', () => {
    const result = {
      summary: { score: 75, grade: 'B', label: 'Good' },
      files: [{
        path: 'CLAUDE.md',
        score: 75,
        grade: 'B',
        label: 'Good',
        criticalFailure: false,
        issues: [
          { name: 'Authority Boundaries', maxPoints: 15, points: 0, status: 'fail', fix: 'Add approval.' },
        ],
        results: [
          { name: 'Silent Inference', maxPoints: 15, points: 15, status: 'pass', fix: '' },
          { name: 'Authority Boundaries', maxPoints: 15, points: 0, status: 'fail', fix: 'Add approval.' },
          { name: 'Scope Limitations', maxPoints: 12, points: 12, status: 'pass', fix: '' },
          { name: 'Audit Trail', maxPoints: 12, points: 12, status: 'pass', fix: '' },
          { name: 'Error Handling', maxPoints: 10, points: 10, status: 'pass', fix: '' },
          { name: 'Output Format', maxPoints: 10, points: 10, status: 'pass', fix: '' },
          { name: 'Identity Definition', maxPoints: 10, points: 10, status: 'pass', fix: '' },
          { name: 'Vague Objectives', maxPoints: 10, points: 10, status: 'pass', fix: '' },
          { name: 'Escalation Path', maxPoints: 8, points: 8, status: 'pass', fix: '' },
          { name: 'Data Handling', maxPoints: 8, points: 8, status: 'pass', fix: '' },
        ],
      }],
    };

    const comment = formatComment(result);
    assert.ok(comment.includes('## Argus Review -- B (75/100)'));
  });

  it('shows issues for failing checks', () => {
    const result = {
      summary: { score: 60, grade: 'C', label: 'Fair' },
      files: [{
        path: 'AGENTS.md',
        score: 60,
        grade: 'C',
        label: 'Fair',
        criticalFailure: false,
        issues: [
          { name: 'Authority Boundaries', maxPoints: 15, points: 0, status: 'fail', fix: 'Add approval.' },
          { name: 'Vague Objectives', maxPoints: 10, points: 5, status: 'partial', fix: 'Add specifics.' },
        ],
        results: [],
      }],
    };

    const comment = formatComment(result);
    assert.ok(comment.includes(':x: **Authority Boundaries**'));
    assert.ok(comment.includes(':warning: **Vague Objectives**'));
  });

  it('includes install link to /installations/new', () => {
    const result = {
      summary: { score: 90, grade: 'A', label: 'Excellent' },
      files: [{
        path: 'CLAUDE.md',
        score: 90,
        grade: 'A',
        label: 'Excellent',
        criticalFailure: false,
        issues: [],
        results: [],
      }],
    };

    const comment = formatComment(result);
    assert.ok(comment.includes('https://github.com/apps/argus/installations/new'));
  });

  it('shows threshold warning when score is below threshold', () => {
    const result = {
      summary: { score: 60, grade: 'C', label: 'Fair' },
      files: [{
        path: 'CLAUDE.md',
        score: 60,
        grade: 'C',
        label: 'Fair',
        criticalFailure: false,
        issues: [],
        results: [],
      }],
    };

    const comment = formatComment(result, 70);
    assert.ok(comment.includes('Below configured threshold of 70'));
  });

  it('uses multi-file format for multiple files', () => {
    const result = {
      summary: { score: 75, grade: 'B', label: 'Good' },
      files: [
        { path: 'CLAUDE.md', score: 80, grade: 'B', label: 'Good', criticalFailure: false, issues: [], results: [] },
        { path: 'AGENTS.md', score: 70, grade: 'B', label: 'Good', criticalFailure: false, issues: [], results: [] },
      ],
    };

    const comment = formatComment(result);
    assert.ok(comment.includes('**Reviewed 2 files**'));
    assert.ok(comment.includes('| `CLAUDE.md` | B | 80/100 |'));
    assert.ok(comment.includes('| `AGENTS.md` | B | 70/100 |'));
  });
});
