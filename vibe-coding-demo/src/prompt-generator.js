#!/usr/bin/env node
/**
 * PROMPT TEMPLATE GENERATOR
 * Creates structured prompts for effective vibe coding
 */

class PromptGenerator {
  // Generate structured prompt with Intent, Constraints, Steps
  static structured(config) {
    const { intent, constraints = [], steps = [], context = '' } = config;

    return `
## Intent
${intent}

${
  constraints.length > 0
    ? `## Constraints
${constraints.map((c) => `- ${c}`).join('\n')}
`
    : ''
}

${
  context
    ? `## Context
${context}
`
    : ''
}

${
  steps.length > 0
    ? `## Implementation Steps
${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
`
    : ''
}

Please implement this feature following the constraints above.
`.trim();
  }

  // Generate UI-specific prompt
  static ui(config) {
    const { feature, vibe, references = [], constraints = [] } = config;

    return `
## Feature
${feature}

## Visual Style
${vibe}

${
  references.length > 0
    ? `## Design References
${references.map((r) => `- ${r}`).join('\n')}
`
    : ''
}

${
  constraints.length > 0
    ? `## Requirements
${constraints.map((c) => `- ${c}`).join('\n')}
`
    : ''
}

Implement this UI component with the specified vibe. Use the design references as inspiration.
After implementation, take a screenshot and verify it matches the design intent.
`.trim();
  }

  // Generate TDD prompt
  static tdd(config) {
    const { feature, acceptance = [], edgeCases = [] } = config;

    return `
## Feature to Implement
${feature}

## Acceptance Criteria
${acceptance.map((a) => `- ${a}`).join('\n')}

${
  edgeCases.length > 0
    ? `## Edge Cases to Handle
${edgeCases.map((e) => `- ${e}`).join('\n')}
`
    : ''
}

## TDD Workflow
1. First, write failing tests for all acceptance criteria
2. Run tests to confirm they fail
3. Implement the feature
4. Run tests to confirm they pass
5. Refactor if needed

Follow strict TDD. Write tests first, then implementation.
`.trim();
  }

  // Generate refactor prompt
  static refactor(config) {
    const { file, goals = [], keepBehavior = true } = config;

    return `
## File to Refactor
${file}

## Refactoring Goals
${goals.map((g) => `- ${g}`).join('\n')}

${
  keepBehavior
    ? `
## Critical Requirement
⚠️ Maintain existing behavior - do NOT change functionality.
All existing tests must continue to pass after refactoring.
`
    : ''
}

## Approach
1. Review current implementation
2. Write additional tests if coverage is lacking
3. Refactor incrementally
4. Run tests after each change
5. Verify no behavior changes

Refactor the code to achieve the goals while maintaining stability.
`.trim();
  }

  // Generate sub-agent delegation prompt
  static delegateToAgent(agentType, task) {
    const prompts = {
      'code-reviewer': `Use the code-reviewer sub-agent to review: ${task}\n\nAsk specifically: "Did the sub-agent identify any issues that you haven't mentioned?"`,
      'test-specialist': `Delegate to test-specialist sub-agent: ${task}\n\nEnsure comprehensive test coverage and TDD approach.`,
      'ui-designer': `Use ui-designer sub-agent for: ${task}\n\nRequest visual validation with screenshots.`,
      'security-specialist': `Delegate to security-specialist for: ${task}\n\nRequest full vulnerability assessment.`,
      debugger: `Use debugger sub-agent to systematically fix: ${task}\n\nRequest root cause analysis.`,
    };

    return prompts[agentType] || `Use ${agentType} sub-agent for: ${task}`;
  }

  // Generate iterative improvement prompt
  static iterative(iteration, feedback) {
    return `
## Iteration ${iteration}

### Previous Feedback
${feedback}

### Next Steps
Based on the feedback above, improve the implementation.

Run the same validation checks after changes to verify improvement.
`.trim();
  }

  // Generate production-ready checklist prompt
  static productionReady() {
    return `
## Production Readiness Check

Validate the following:

### Security
- [ ] No hardcoded secrets
- [ ] .env in .gitignore
- [ ] Dependencies audited (npm audit)
- [ ] Input validation implemented

### Testing
- [ ] Test suite exists and runs
- [ ] Coverage >= 90%
- [ ] Tests actually passing (run and verify)
- [ ] Edge cases covered

### Code Quality
- [ ] Linter configured and passing
- [ ] TypeScript strict mode (if applicable)
- [ ] No TODO/FIXME comments
- [ ] Code reviewed

### Documentation
- [ ] README with install/usage/test instructions
- [ ] API documentation
- [ ] Inline code comments for complex logic

### Build & Deploy
- [ ] Build script exists and succeeds
- [ ] Environment variables documented (.env.example)
- [ ] Dependencies locked (package-lock.json)

Run all checks and fix any failures. Report results.
`.trim();
  }
}

// CLI
if (require.main === module) {
  const type = process.argv[2];

  const examples = {
    structured: () =>
      console.log(
        PromptGenerator.structured({
          intent: 'Add user authentication with email/password',
          constraints: [
            'Use bcrypt for password hashing',
            'JWT for sessions',
            'Follow existing auth patterns',
          ],
          steps: [
            'Create User model',
            'Implement registration endpoint',
            'Implement login endpoint',
            'Add auth middleware',
          ],
          context: 'Express.js API with MongoDB',
        })
      ),
    ui: () =>
      console.log(
        PromptGenerator.ui({
          feature: 'Dashboard with analytics cards',
          vibe: 'Modern SaaS dashboard, minimalistic, flat design with subtle shadows',
          references: [
            'https://dribbble.com/tags/dashboard',
            'Stripe dashboard',
            'Vercel dashboard',
          ],
          constraints: ['Mobile responsive', 'Dark mode support', 'Accessible (WCAG AA)'],
        })
      ),
    tdd: () =>
      console.log(
        PromptGenerator.tdd({
          feature: 'Shopping cart functionality',
          acceptance: [
            'Add items to cart',
            'Remove items',
            'Update quantities',
            'Calculate total with tax',
          ],
          edgeCases: ['Empty cart', 'Negative quantities', 'Out of stock items'],
        })
      ),
    delegate: () =>
      console.log(
        PromptGenerator.delegateToAgent(
          'code-reviewer',
          'Review the authentication module for security issues'
        )
      ),
  };

  if (examples[type]) {
    examples[type]();
  } else {
    console.log('Usage: prompt-generator.js [structured|ui|tdd|delegate]');
    console.log('\nExample prompts for vibe coding workflows');
  }
}

module.exports = PromptGenerator;
