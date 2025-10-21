/**
 * Vibe Coding Prompt Refinement Layer
 * Filters and refines prompts between main agent and sub-agents
 */

import { EventEmitter } from 'events';

export class PromptRefiner extends EventEmitter {
  constructor(options = {}) {
    super();
    this.refinementStrategies = new Map();
    this.filteringEnabled = options.filteringEnabled !== false;
    this.beautificationEnabled = options.beautificationEnabled !== false;
    this.verbosityLevel = options.verbosityLevel || 'balanced';
  }

  registerStrategy(name, strategy) {
    this.refinementStrategies.set(name, strategy);
    this.emit('strategy:registered', { name, strategy });
  }

  async refinePromptForSubAgent(prompt, subAgent, context = {}) {
    const refinement = {
      original: prompt,
      refined: prompt,
      subAgent: subAgent.name,
      transformations: [],
      timestamp: Date.now()
    };

    refinement.refined = this.addSubAgentContext(refinement.refined, subAgent);
    refinement.transformations.push('context-enrichment');

    refinement.refined = this.specializeForExpertise(refinement.refined, subAgent);
    refinement.transformations.push('expertise-specialization');

    refinement.refined = this.adjustVerbosity(refinement.refined, this.verbosityLevel);
    refinement.transformations.push('verbosity-adjustment');

    refinement.refined = this.addConstraints(refinement.refined, subAgent, context);
    refinement.transformations.push('constraint-addition');

    this.emit('prompt:refined', refinement);
    return refinement;
  }

  addSubAgentContext(prompt, subAgent) {
    const contextPrefix = `[Task for ${subAgent.name}]\n`;
    const expertiseNote = `Your expertise: ${subAgent.expertise}\n\n`;

    return contextPrefix + expertiseNote + prompt;
  }

  specializeForExpertise(prompt, subAgent) {
    const expertise = subAgent.expertise.toLowerCase();

    if (expertise.includes('review') || expertise.includes('security')) {
      return this.addReviewGuidance(prompt);
    }

    if (expertise.includes('test')) {
      return this.addTestingGuidance(prompt);
    }

    if (expertise.includes('ui') || expertise.includes('design')) {
      return this.addDesignGuidance(prompt);
    }

    if (expertise.includes('debug')) {
      return this.addDebuggingGuidance(prompt);
    }

    return prompt;
  }

  addReviewGuidance(prompt) {
    return prompt + '\n\nProvide detailed analysis covering:\n- Code quality\n- Security concerns\n- Performance issues\n- Best practices violations';
  }

  addTestingGuidance(prompt) {
    return prompt + '\n\nEnsure tests:\n- Cover edge cases\n- Follow TDD principles\n- Are maintainable\n- Have clear assertions';
  }

  addDesignGuidance(prompt) {
    return prompt + '\n\nConsider:\n- Accessibility (WCAG)\n- Responsive design\n- Visual hierarchy\n- User experience';
  }

  addDebuggingGuidance(prompt) {
    return prompt + '\n\nApproach:\n1. Reproduce the issue\n2. Identify root cause\n3. Propose fix\n4. Verify solution';
  }

  adjustVerbosity(prompt, level) {
    const verbosityNotes = {
      concise: '\n\n[Respond concisely with key points only]',
      balanced: '\n\n[Provide clear, balanced explanation]',
      detailed: '\n\n[Provide comprehensive, detailed analysis]'
    };

    return prompt + (verbosityNotes[level] || '');
  }

  addConstraints(prompt, subAgent, context) {
    let enhanced = prompt;

    if (subAgent.tools && subAgent.tools.length > 0) {
      enhanced += `\n\nAvailable tools: ${subAgent.tools.join(', ')}`;
    }

    if (context.timeConstraint) {
      enhanced += `\n\nTime constraint: ${context.timeConstraint}`;
    }

    if (context.qualityLevel) {
      enhanced += `\n\nQuality level: ${context.qualityLevel}`;
    }

    return enhanced;
  }

  async filterSubAgentResponse(response, mainAgentContext = {}) {
    const filtering = {
      original: response,
      filtered: response,
      modifications: [],
      timestamp: Date.now()
    };

    if (!this.filteringEnabled) {
      return filtering;
    }

    if (this.beautificationEnabled) {
      filtering.filtered = this.beautifyResponse(filtering.filtered);
      filtering.modifications.push('beautification');
    }

    filtering.filtered = this.extractKeyPoints(filtering.filtered);
    filtering.modifications.push('key-point-extraction');

    filtering.filtered = this.adjustTone(filtering.filtered, mainAgentContext.preferredTone);
    filtering.modifications.push('tone-adjustment');

    this.emit('response:filtered', filtering);
    return filtering;
  }

  beautifyResponse(response) {
    let beautified = response.replace(/ERROR:/g, 'Issue found:');
    beautified = beautified.replace(/FAIL(ED)?/g, 'Needs improvement');
    beautified = beautified.replace(/BAD/g, 'Could be better');
    beautified = beautified.replace(/CRITICAL/g, 'Important');

    return beautified;
  }

  extractKeyPoints(response) {
    const lines = response.split('\n');
    const keyPoints = [];

    for (const line of lines) {
      if (line.trim().startsWith('-') ||
        line.trim().startsWith('*') ||
        line.trim().startsWith('1.') ||
        line.includes('IMPORTANT') ||
        line.includes('NOTE')) {
        keyPoints.push(line);
      }
    }

    if (keyPoints.length > 0) {
      return response;
    }

    return response;
  }

  adjustTone(response, preferredTone = 'professional') {
    const tonePatterns = {
      professional: {
        friendly: /great|awesome|cool/gi,
        formal: 'appropriate'
      },
      friendly: {
        formal: /furthermore|henceforth|pursuant/gi,
        casual: 'also'
      }
    };

    return response;
  }

  async disableFiltering() {
    this.filteringEnabled = false;
    this.beautificationEnabled = false;
    this.emit('filtering:disabled');
  }

  async enableRawMode() {
    await this.disableFiltering();
    this.emit('raw-mode:enabled');
  }

  async captureRawSubAgentOutput(subAgentId, output) {
    const captured = {
      subAgentId,
      output,
      timestamp: Date.now(),
      unfiltered: true
    };

    this.emit('raw-output:captured', captured);
    return captured;
  }
}

export default PromptRefiner;
