/**
 * Argus Governance Standard v1.1
 *
 * 13 checks, 140 raw points, normalized to 0-100.
 * Document type detection: System Prompt vs Project Doc.
 * Transparent, versioned scoring. Published weights in README.
 */

// --- Markdown stripping ---

function stripMarkdown(text) {
  return text
    // Remove code blocks (``` ... ```) entirely
    .replace(/```[\s\S]*?```/g, '')
    // Remove inline code backticks but keep content
    .replace(/`([^`]+)`/g, '$1')
    // Remove headers markers, keep text
    .replace(/^#{1,6}\s+/gm, '')
    // Remove bold/italic markers, keep text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    // Remove link syntax, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove image syntax
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove HTML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove horizontal rules
    .replace(/^---+$/gm, '')
    // Remove blockquote markers
    .replace(/^>\s?/gm, '')
    // Remove list markers
    .replace(/^[\s]*[-*+]\s/gm, '')
    .replace(/^[\s]*\d+\.\s/gm, '');
}

// --- Document type detection ---

const BEHAVIORAL_PATTERNS = [
  /\byou are\b/i,
  /\byour role\b/i,
  /\byou act as\b/i,
  /\byour purpose\b/i,
  /\byour task\b/i,
  /\bact as\b/i,
  /\byou will\b/i,
];

function detectDocType(text) {
  for (const pattern of BEHAVIORAL_PATTERNS) {
    if (pattern.test(text)) return 'system-prompt';
  }
  return 'project-doc';
}

// --- Check definitions ---

const CHECKS = [
  {
    name: 'Silent Inference',
    maxPoints: 15,
    type: 'inverted',
    run: checkSilentInference,
    fix: 'Add explicit instructions like: "Never assume user intent. Always ask for clarification when the request is ambiguous."',
  },
  {
    name: 'Authority Boundaries',
    maxPoints: 15,
    type: 'positive',
    run: checkAuthorityBoundaries,
    fix: 'Add: "Ask for confirmation before deleting files, pushing to production, or taking any irreversible action."',
  },
  {
    name: 'Scope Limitations',
    maxPoints: 12,
    type: 'positive',
    run: checkScopeLimitations,
    fix: 'Add: "Do not modify files outside the project directory. Never access external APIs without explicit permission."',
  },
  {
    name: 'Audit Trail',
    maxPoints: 12,
    type: 'positive',
    run: checkAuditTrail,
    fix: 'Add: "Log all decisions and actions taken. Maintain a traceable record of changes."',
  },
  {
    name: 'Error Handling',
    maxPoints: 10,
    type: 'positive',
    run: checkErrorHandling,
    fix: 'Add: "When an error occurs, report it clearly. If a task fails, explain what went wrong and suggest alternatives."',
  },
  {
    name: 'Output Format',
    maxPoints: 10,
    type: 'positive',
    run: checkOutputFormat,
    fix: 'Add: "Respond in structured format. Use markdown for documentation, JSON for data."',
  },
  {
    name: 'Identity Definition',
    maxPoints: 10,
    type: 'positive',
    run: checkIdentityDefinition,
    fix: 'Add: "You are [specific role]. Your purpose is [specific purpose]."',
  },
  {
    name: 'Vague Objectives',
    maxPoints: 10,
    type: 'inverted',
    run: checkVagueObjectives,
    fix: 'Replace vague goals like "help the user" with specific outcomes: "Help the user deploy their application with zero downtime."',
  },
  {
    name: 'Escalation Path',
    maxPoints: 8,
    type: 'positive',
    run: checkEscalationPath,
    fix: 'Add: "When unsure about the correct approach, stop and ask the user before proceeding."',
  },
  {
    name: 'Safety & Data Handling',
    maxPoints: 8,
    type: 'positive',
    run: checkDataHandling,
    fix: 'Add: "Do not log or expose sensitive information such as API keys, passwords, or PII."',
  },
  // --- v1.1 new checks ---
  {
    name: 'Project Context',
    maxPoints: 10,
    type: 'positive',
    conditional: 'project-doc',
    run: checkProjectContext,
    fix: 'Add a project overview describing the repository structure, purpose, and key directories.',
  },
  {
    name: 'Development Workflow',
    maxPoints: 10,
    type: 'positive',
    conditional: 'project-doc',
    run: checkDevelopmentWorkflow,
    fix: 'Add setup, build, and test commands so agents know how to work in the codebase.',
  },
  {
    name: 'Code Conventions',
    maxPoints: 10,
    type: 'positive',
    conditional: 'project-doc',
    run: checkCodeConventions,
    fix: 'Add coding standards: naming conventions, file organization, style guidelines.',
  },
];

const TOTAL_RAW = CHECKS.reduce((sum, c) => sum + c.maxPoints, 0); // 140

// --- Individual check implementations ---

function checkSilentInference(text) {
  const badPatterns = [
    /auto[- ]?correct/i,
    /auto[- ]?fix/i,
    /\bsilently\b/i,
    /auto[- ]?resolve/i,
    /default\s.{0,30}action\s.{0,30}without/i,
    /implicit(?:ly)?\s.{0,20}infer/i,
    /infer\s.{0,20}meaning/i,
  ];

  const assumeBadPattern = /\bassume\s+(?:\w+\s+){0,4}(?:intent|meaning|context)\b/i;
  const assumeNegated = /(?:do not|don't|never|must not|should not)\s+assume/i;

  let badCount = 0;
  for (const pattern of badPatterns) {
    if (pattern.test(text)) badCount++;
  }
  if (assumeBadPattern.test(text) && !assumeNegated.test(text)) {
    badCount++;
  }

  return { badCount };
}

function checkAuthorityBoundaries(text) {
  const patterns = [
    // v1.0 patterns
    /(?:user|human)\s.{0,20}(?:approv|confirm|authoriz|decide)/i,
    /(?:ask|check|verify)\s.{0,20}(?:before|permission|consent)/i,
    /\bescalat/i,
    /human[- ]?in[- ]?the[- ]?loop/i,
    /require\s.{0,15}confirmation/i,
    /(?:do not|don't|never)\s.{0,20}without\s.{0,20}permission/i,
    // v1.1 broadened: project-level review/verification
    /\breview\b/i,
    /\bbefore\s.{0,20}(?:commit|submit|merge)/i,
    /\bchecklist\b/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

function checkScopeLimitations(text) {
  const patterns = [
    // v1.0 patterns
    /(?:do not|don't)\s.{0,20}(?:modify|access|change|touch|delete|create|push|deploy)/i,
    /\bnever\s.{0,20}(?:modify|access|change|delete)/i,
    /\bmust not\b/i,
    /\bonly\s.{0,20}(?:within|inside|under|from)\b/i,
    /\brestrict/i,
    /\bforbidden\b/i,
    /\bprohibited\b/i,
    /\bboundary\b/i,
    /\bconstraint/i,
    // v1.1 broadened: project-level constraints
    /will not\s.{0,20}accept/i,
    /\bare not accepted\b/i,
    /\bdo not include\b/i,
    /\bshould not\b/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

function checkAuditTrail(text) {
  const patterns = [
    // v1.0 patterns
    /\blog\b/i,
    /\baudit\b/i,
    /\brecord\b/i,
    /\btrack\b/i,
    /\btrace\b/i,
    /decision\s.{0,10}log/i,
    /\bhistory\b/i,
    /\bchangelog\b/i,
    // v1.1 broadened: version control as audit trail
    /\bcommit\b/i,
    /\bpull request\b/i,
    /\bPR\b/,
    /\bversion\b/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

function checkErrorHandling(text) {
  const patterns = [
    // v1.0 patterns
    /\berror\b/i,
    /\bfail/i,
    /\bfallback\b/i,
    /\bretry\b/i,
    /\btimeout\b/i,
    /\bgraceful/i,
    /\bexception\b/i,
    // v1.1 broadened: validation/verification
    /\bvalidat/i,
    /\bverif/i,
    /\bensure\b/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

function checkOutputFormat(text) {
  const patterns = [
    // v1.0 patterns
    /\bformat\b/i,
    /\bstructured\b/i,
    /\bjson\b/i,
    /\bmarkdown\b/i,
    /\btemplate\b/i,
    /\bschema\b/i,
    /(?:respond|reply|output|return)\s.{0,15}(?:format|structure)/i,
    // v1.1 broadened: config/schema specs
    /\bfront.?matter\b/i,
    /\byaml\b/i,
    /\bconfigur/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

function checkIdentityDefinition(text) {
  const patterns = [
    // v1.0 patterns
    /\byou are\b/i,
    /\byour role\b/i,
    /\byou act as\b/i,
    /\byour purpose\b/i,
    /\bagent\b/i,
    /\bpersona\b/i,
    // v1.1 broadened: project identity
    /\bproject\b/i,
    /\brepository\b/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

function checkVagueObjectives(text) {
  const vaguePatterns = [
    /\bhelp the user\b/i,
    /\bassist with\b/i,
    /\bbe helpful\b/i,
    /\bsupport the user\b/i,
  ];

  const specificityPatterns = [
    /\bsuccess\b/i,
    /\bgoal\b/i,
    /\bmetric\b/i,
    /\bdeliver\b/i,
    /\boutcome\b/i,
    /\bcomplete when\b/i,
    /\bdone when\b/i,
  ];

  let vagueCount = 0;
  for (const pattern of vaguePatterns) {
    const match = text.match(pattern);
    if (match) {
      const afterMatch = text.slice(match.index + match[0].length, match.index + match[0].length + 100);
      const actionVerbs = /(?:deploy|build|create|implement|configure|set up|install|debug|fix|test|write|design|develop|run|execute|manage|monitor|review|analyze|generate|migrate|refactor|maintain|update|optimize)/i;
      const hasFollowingContext = actionVerbs.test(afterMatch.split(/\s+/).slice(0, 10).join(' '));
      if (!hasFollowingContext) {
        vagueCount++;
      }
    }
  }

  if (vagueCount > 0) {
    const hasSpecificity = specificityPatterns.some(p => p.test(text));
    if (hasSpecificity) {
      vagueCount = 0;
    }
  }

  return { badCount: vagueCount };
}

function checkEscalationPath(text) {
  const patterns = [
    // v1.0 patterns
    /\bescalat/i,
    /\bask\s.{0,15}human/i,
    /\bstop\s.{0,15}ask/i,
    /\bdefer to\b/i,
    /\bhand off\b/i,
    /\bhuman review\b/i,
    /\bwhen unsure\b/i,
    // v1.1 broadened: doc references as escalation
    /\bsee\s.{0,50}(?:contributing|guideline|documentation|docs)\b/i,
    /\breport\s.{0,20}(?:issue|bug|security|concern)\b/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

function checkDataHandling(text) {
  const patterns = [
    // v1.0 patterns
    /\bprivacy\b/i,
    /\bconfidential/i,
    /\bsensitive\b/i,
    /\bpii\b/i,
    /(?:do not|don't|never)\s.{0,15}(?:share|expose)/i,
    /(?:do not|don't|never)\s.{0,15}(?:store|log)\s.{0,15}(?:secret|password|key|credential|token)/i,
    // v1.1 broadened: security/safety
    /\bsecur/i,
    /\bharmful\b/i,
    /\bresponsible\b/i,
    /\bsafe\b/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

// --- v1.1 new checks ---

function checkProjectContext(text) {
  const patterns = [
    /\bproject\b/i,
    /\brepository\b/i,
    /\bcodebase\b/i,
    /\barchitecture\b/i,
    /\bstructure\b/i,
    /\bdirectory\b/i,
    /\bfolder\b/i,
    /\boverview\b/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

function checkDevelopmentWorkflow(text) {
  const patterns = [
    /\bbuild\b/i,
    /\btest\b/i,
    /\binstall\b/i,
    /\bsetup\b/i,
    /\bworkflow\b/i,
    /\bcontribut/i,
    /\bnpm\b/i,
    /\bconfigure\b/i,
    /\bcommand\b/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

function checkCodeConventions(text) {
  const patterns = [
    /\bconvention\b/i,
    /\bstyle\b/i,
    /\bnaming\b/i,
    /\blint\b/i,
    /\bstandard\b/i,
    /\bguideline\b/i,
    /\bbest practice/i,
  ];
  return { matchCount: countMatches(text, patterns) };
}

// --- Scoring logic ---

function countMatches(text, patterns) {
  let count = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) count++;
  }
  return count;
}

function scoreCheck(check, result) {
  const { maxPoints, type } = check;
  const half = Math.floor(maxPoints / 2);

  if (type === 'inverted') {
    const { badCount } = result;
    if (badCount === 0) return maxPoints;
    if (badCount === 1) return half;
    return 0;
  }

  const { matchCount } = result;
  if (matchCount >= 2) return maxPoints;
  if (matchCount === 1) return half;
  return 0;
}

function getGrade(score) {
  if (score >= 85) return { grade: 'A', label: 'Excellent' };
  if (score >= 70) return { grade: 'B', label: 'Good' };
  if (score >= 55) return { grade: 'C', label: 'Fair' };
  if (score >= 40) return { grade: 'D', label: 'Needs Work' };
  return { grade: 'F', label: 'Critical' };
}

function getStatusIcon(points, maxPoints) {
  if (points === maxPoints) return 'pass';
  if (points === 0) return 'fail';
  return 'partial';
}

// --- Main scoring function ---

export function scoreFile(rawContent) {
  const text = stripMarkdown(rawContent);
  const docType = detectDocType(text);

  const results = CHECKS.map(check => {
    // Conditional checks: auto-pass for system prompts
    if (check.conditional === 'project-doc' && docType === 'system-prompt') {
      return {
        name: check.name,
        maxPoints: check.maxPoints,
        points: check.maxPoints,
        status: 'pass',
        fix: check.fix,
        autoPass: true,
      };
    }

    const result = check.run(text);
    const points = scoreCheck(check, result);
    const status = getStatusIcon(points, check.maxPoints);
    return {
      name: check.name,
      maxPoints: check.maxPoints,
      points,
      status,
      fix: check.fix,
    };
  });

  let rawScore = results.reduce((sum, r) => sum + r.points, 0);
  let normalized = Math.round((rawScore / TOTAL_RAW) * 100);

  // Critical failure rule: only applies to system prompts
  const authorityResult = results.find(r => r.name === 'Authority Boundaries');
  const scopeResult = results.find(r => r.name === 'Scope Limitations');
  const criticalFailure = docType === 'system-prompt'
    && authorityResult.points === 0
    && scopeResult.points === 0;

  if (criticalFailure && normalized > 54) {
    normalized = 54;
  }

  const { grade, label } = getGrade(normalized);
  const issues = results.filter(r => r.status !== 'pass');

  return {
    score: normalized,
    grade,
    label,
    docType,
    criticalFailure,
    results,
    issues,
  };
}

export function scoreFiles(files) {
  const scored = files.map(({ path, content }) => ({
    path,
    ...scoreFile(content),
  }));

  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((sum, f) => sum + f.score, 0) / scored.length)
    : 0;

  const { grade, label } = getGrade(avgScore);

  return {
    summary: { score: avgScore, grade, label },
    files: scored,
  };
}

export { CHECKS, TOTAL_RAW, stripMarkdown, detectDocType, BEHAVIORAL_PATTERNS };
