import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import ASTParser from '../src/agents/ast-parser.js';
import ContextAwareAnalyzer from '../src/agents/context-aware-analyzer.js';
import SelfModifyingAnalyzer from '../src/agents/self-modifying-analyzer.js';
import VerificationLoop from '../src/agents/verification-loop.js';

test('AST Parser - Basic parsing', async () => {
  const parser = new ASTParser();
  const code = `
    const x = 10;
    function foo() {
      return x + 5;
    }
  `;

  const result = parser.parseCode(code, 'test.js');

  assert.strictEqual(result.success, true);
  assert.ok(result.ast);
  assert.strictEqual(result.errors.length, 0);
});

test('AST Parser - Detect var usage', async () => {
  const parser = new ASTParser();
  const code = `var oldStyle = 'bad';`;

  const result = parser.analyzeCode(code, 'test.js');

  assert.ok(result.issues.some(i => i.type === 'var-usage'));
  assert.strictEqual(result.metrics.errorCount, 1);
});

test('AST Parser - Detect console.log', async () => {
  const parser = new ASTParser();
  const code = `console.log('debug');`;

  const result = parser.analyzeCode(code, 'test.js');

  assert.ok(result.issues.some(i => i.type === 'console-log'));
  assert.ok(result.metrics.warningCount > 0);
});

test('AST Parser - Detect weak equality', async () => {
  const parser = new ASTParser();
  const code = `if (x == 5) { }`;

  const result = parser.analyzeCode(code, 'test.js');

  assert.ok(result.issues.some(i => i.type === 'weak-equality'));
});

test('AST Parser - Calculate complexity', async () => {
  const parser = new ASTParser();
  const code = `
    function complex() {
      if (a) {
        if (b) {
          while (c) {
            for (let i = 0; i < 10; i++) {
              // complexity: 5
            }
          }
        }
      }
    }
  `;

  const result = parser.analyzeCode(code, 'test.js');

  assert.ok(result.metrics.complexity > 1);
});

test('AST Parser - Extract structure', async () => {
  const parser = new ASTParser();
  const code = `
    export function myFunc(a, b) {
      return a + b;
    }

    export class MyClass {
      myMethod() {}
      static staticMethod() {}
    }
  `;

  const result = parser.extractStructure(code, 'test.js');

  assert.strictEqual(result.functions.length, 1);
  assert.strictEqual(result.functions[0].name, 'myFunc');
  assert.strictEqual(result.classes.length, 1);
  assert.strictEqual(result.classes[0].name, 'MyClass');
  assert.strictEqual(result.classes[0].methods.length, 2);
});

test('Context Aware Analyzer - Self-analysis detection', async () => {
  const analyzer = new ContextAwareAnalyzer();

  assert.strictEqual(analyzer.isAnalyzingSelf('src/agents/ast-parser.js'), true);
  assert.strictEqual(analyzer.isAnalyzingSelf('src/agents/code-analyzer-agent.js'), true);
  assert.strictEqual(analyzer.isAnalyzingSelf('src/some-other-file.js'), false);
});

test('Context Aware Analyzer - Analysis with context', async () => {
  const analyzer = new ContextAwareAnalyzer();
  const code = `const test = 'hello';`;

  const result = analyzer.analyzeWithContext(code, 'test.js', {
    source: 'test-suite'
  });

  assert.ok(result.context);
  assert.strictEqual(result.context.analyzer, 'ContextAwareAnalyzer');
  assert.strictEqual(result.context.requestSource, 'test-suite');
  assert.ok(result.context.timestamp);
});

test('Context Aware Analyzer - Self-improvement suggestions', async () => {
  const analyzer = new ContextAwareAnalyzer();
  const code = `
    var x = 1;
    console.log('test');
    // FIXME: refactor to use const instead of var
  `;

  const result = analyzer.analyzeWithContext(code, 'src/agents/ast-parser.js', {
    source: 'test'
  });

  assert.strictEqual(result.context.isSelfAnalysis, true);
  assert.ok(result.recommendations.some(r => r.type === 'self-improvement'));

  // Verify analyzer detects the FIXME comment
  assert.ok(result.issues.some(i => i.message.includes('TODO/FIXME comment found')));
});

test('Context Aware Analyzer - Get statistics', async () => {
  const analyzer = new ContextAwareAnalyzer();

  analyzer.analyzeWithContext('const x = 1;', 'test.js');
  analyzer.analyzeWithContext('const y = 2;', 'src/agents/ast-parser.js');

  const stats = analyzer.getAnalysisStats();

  assert.strictEqual(stats.totalAnalyses, 2);
  assert.strictEqual(stats.selfAnalyses, 1);
  assert.strictEqual(stats.externalAnalyses, 1);
  assert.strictEqual(stats.selfAnalysisRatio, 0.5);
});

test('Self-Modifying Analyzer - Propose modifications', async () => {
  const analyzer = new SelfModifyingAnalyzer({ safeMode: false });
  const tmpFile = path.join(process.cwd(), '.tmp-test-file.js');

  const code = `var x = 1;\nif (x == 1) { console.log('test'); }`;
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    const proposal = await analyzer.proposeSelfModifications(tmpFile);

    assert.ok(proposal.proposedModifications.length > 0);
    assert.ok(proposal.proposedModifications.some(m => m.type === 'replace-var'));
    assert.ok(proposal.proposedModifications.some(m => m.type === 'fix-equality'));
    assert.ok(proposal.safetyStatus);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('Self-Modifying Analyzer - Apply safe modifications', async () => {
  const analyzer = new SelfModifyingAnalyzer({
    safeMode: false,
    backupEnabled: false
  });
  const tmpFile = path.join(process.cwd(), '.tmp-test-file.js');

  const code = `var x = 1;`;
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    const proposal = await analyzer.proposeSelfModifications(tmpFile);
    const result = await analyzer.applySelfModifications(
      tmpFile,
      proposal.proposedModifications
    );

    assert.strictEqual(result.success, true);
    assert.ok(result.applied.length > 0);

    const modifiedCode = fs.readFileSync(tmpFile, 'utf8');
    assert.ok(modifiedCode.includes('let x'));
    assert.ok(!modifiedCode.includes('var x'));
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('Self-Modifying Analyzer - Safety check prevents syntax errors', async () => {
  const analyzer = new SelfModifyingAnalyzer({
    safeMode: false,
    backupEnabled: true
  });
  const tmpFile = path.join(process.cwd(), '.tmp-test-file.js');

  const code = `const x = 1;`;
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    // Manually create a bad modification
    const badModification = {
      type: 'custom',
      safe: true,
      line: 1
    };

    // This should not break the file
    const result = await analyzer.applySelfModifications(tmpFile, [badModification]);

    // File should still be valid
    const finalCode = fs.readFileSync(tmpFile, 'utf8');
    assert.ok(finalCode.includes('const x'));
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('Verification Loop - Single iteration', async () => {
  const loop = new VerificationLoop({
    maxIterations: 1,
    runLinter: false,
    runTests: false,
    autoFix: false
  });

  const tmpFile = path.join(process.cwd(), '.tmp-test-file.js');
  const code = `const x = 1;\nconst y = 2;`;
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    const result = await loop.runVerificationLoop(tmpFile);

    assert.strictEqual(result.iterations, 1);
    assert.ok(result.results.length > 0);
    assert.ok(result.results[0].analysis);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('Verification Loop - Quality convergence', async () => {
  const loop = new VerificationLoop({
    maxIterations: 5,
    qualityThreshold: 9.0,
    runLinter: false,
    runTests: false,
    autoFix: true
  });

  const tmpFile = path.join(process.cwd(), '.tmp-test-file.js');
  const code = `const perfect = 'code';`;
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    const result = await loop.runVerificationLoop(tmpFile);

    assert.strictEqual(result.converged, true);
    assert.ok(result.finalQuality >= loop.verificationConfig.qualityThreshold);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('Verification Loop - Syntax verification', async () => {
  const loop = new VerificationLoop();

  const tmpFile = path.join(process.cwd(), '.tmp-test-file.js');
  const validCode = `const x = 1;`;
  fs.writeFileSync(tmpFile, validCode, 'utf8');

  try {
    const result = await loop.verifySyntax(tmpFile);
    assert.strictEqual(result.valid, true);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('Verification Loop - Invalid syntax detection', async () => {
  const loop = new VerificationLoop();

  const tmpFile = path.join(process.cwd(), '.tmp-test-file.js');
  const invalidCode = `const x = ;`;
  fs.writeFileSync(tmpFile, invalidCode, 'utf8');

  try {
    const result = await loop.verifySyntax(tmpFile);
    assert.strictEqual(result.valid, false);
    assert.ok(result.error);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});

test('Integration - Full workflow', async () => {
  const tmpFile = path.join(process.cwd(), '.tmp-test-file.js');
  const code = `var x = 1;\nif (x == 1) {\n  console.log('old');\n}`;
  fs.writeFileSync(tmpFile, code, 'utf8');

  try {
    // Step 1: Parse with AST
    const parser = new ASTParser();
    const parseResult = parser.analyzeCode(code, tmpFile);
    assert.ok(parseResult.issues.length > 0);

    // Step 2: Context-aware analysis
    const analyzer = new ContextAwareAnalyzer();
    const analysisResult = analyzer.analyzeWithContext(code, tmpFile);
    assert.ok(analysisResult.context);

    // Step 3: Self-modification
    const selfModifier = new SelfModifyingAnalyzer({
      safeMode: false,
      backupEnabled: false
    });
    const proposal = await selfModifier.proposeSelfModifications(tmpFile);
    assert.ok(proposal.proposedModifications.length > 0);

    const modResult = await selfModifier.applySelfModifications(
      tmpFile,
      proposal.proposedModifications
    );
    assert.strictEqual(modResult.success, true);

    // Step 4: Verify improvements
    const finalCode = fs.readFileSync(tmpFile, 'utf8');
    assert.ok(!finalCode.includes('var '));
    assert.ok(finalCode.includes('let '));
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
});
