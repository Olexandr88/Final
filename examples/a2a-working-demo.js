#!/usr/bin/env node
/**
 * A2A Real Working Demo - Agents that actually do work
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

// Agent 1: Data Analyzer - receives data and analyzes it
class AnalyzerAgent {
  constructor() {
    this.ws = new WebSocket('ws://localhost:4567');
    this.id = 'analyzer-agent';

    this.ws.on('open', () => {
      console.log('🔬 Analyzer Agent: Connected');
      this.ws.send(JSON.stringify({
        type: 'register',
        clientId: 'analyzer-agent',
        role: 'analyzer',
        tools: ['data-analysis', 'statistics'],
        intents: ['analyze-data']
      }));
    });

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data);

      if (msg.type === 'registered') {
        console.log('✅ Analyzer Agent: Registered and ready');
      }

      if (msg[0] === 'env') {
        const envelope = msg[1];
        if (envelope.intent === 'analyze-data') {
          console.log(`\n🔬 Analyzer Agent: Received data to analyze`);
          console.log('   Data:', envelope.payload.data);

          // DO ACTUAL WORK
          const numbers = envelope.payload.data;
          const analysis = {
            count: numbers.length,
            sum: numbers.reduce((a, b) => a + b, 0),
            average: numbers.reduce((a, b) => a + b, 0) / numbers.length,
            max: Math.max(...numbers),
            min: Math.min(...numbers)
          };

          console.log('   Analysis result:', analysis);

          // Send results to summarizer
          this.ws.send(JSON.stringify({
            type: 'envelope',
            envelope: {
              from: this.id,
              to: 'summarizer-agent',
              intent: 'summarize-results',
              payload: {
                original_data: numbers,
                analysis: analysis
              }
            }
          }));
          console.log('✅ Analyzer Agent: Sent results to summarizer');
        }
      }
    });
  }
}

// Agent 2: Summarizer - receives analysis and creates summary
class SummarizerAgent {
  constructor() {
    this.ws = new WebSocket('ws://localhost:4567');
    this.id = 'summarizer-agent';

    this.ws.on('open', () => {
      console.log('📝 Summarizer Agent: Connected');
      this.ws.send(JSON.stringify({
        type: 'register',
        clientId: 'summarizer-agent',
        role: 'summarizer',
        tools: ['text-generation', 'reporting'],
        intents: ['summarize-results']
      }));
    });

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data);

      if (msg.type === 'registered') {
        console.log('✅ Summarizer Agent: Registered and ready');
      }

      if (msg[0] === 'env') {
        const envelope = msg[1];
        if (envelope.intent === 'summarize-results') {
          console.log(`\n📝 Summarizer Agent: Creating summary report`);

          // DO ACTUAL WORK
          const { original_data, analysis } = envelope.payload;
          const summary = `
DATA ANALYSIS REPORT
==================
Dataset: [${original_data.join(', ')}]
Total Values: ${analysis.count}
Sum: ${analysis.sum}
Average: ${analysis.average.toFixed(2)}
Range: ${analysis.min} to ${analysis.max}

CONCLUSION: Dataset shows ${analysis.average > 50 ? 'high' : 'low'} average values.
`;

          console.log(summary);

          // Send to reporter
          this.ws.send(JSON.stringify({
            type: 'envelope',
            envelope: {
              from: this.id,
              to: 'reporter-agent',
              intent: 'publish-report',
              payload: {
                report: summary,
                timestamp: new Date().toISOString()
              }
            }
          }));
          console.log('✅ Summarizer Agent: Sent report to publisher');
        }
      }
    });
  }
}

// Agent 3: Reporter - publishes final results
class ReporterAgent {
  constructor() {
    this.ws = new WebSocket('ws://localhost:4567');
    this.id = 'reporter-agent';

    this.ws.on('open', () => {
      console.log('📢 Reporter Agent: Connected');
      this.ws.send(JSON.stringify({
        type: 'register',
        clientId: 'reporter-agent',
        role: 'reporter',
        tools: ['publishing', 'notifications'],
        intents: ['publish-report']
      }));
    });

    this.ws.on('message', (data) => {
      const msg = JSON.parse(data);

      if (msg.type === 'registered') {
        console.log('✅ Reporter Agent: Registered and ready');
      }

      if (msg[0] === 'env') {
        const envelope = msg[1];
        if (envelope.intent === 'publish-report') {
          console.log(`\n📢 Reporter Agent: Publishing final report`);

          // DO ACTUAL WORK - publish results
          console.log('╔════════════════════════════════════════════╗');
          console.log('║        FINAL PUBLISHED REPORT              ║');
          console.log('╚════════════════════════════════════════════╝');
          console.log(envelope.payload.report);
          console.log(`Published at: ${envelope.payload.timestamp}`);

          // Broadcast completion to all agents
          this.ws.send(JSON.stringify({
            type: 'envelope',
            envelope: {
              from: this.id,
              intent: 'workflow.complete',
              payload: {
                status: 'completed',
                message: '✅ Analysis pipeline completed successfully!'
              }
            }
          }));

          console.log('\n✅ WORKFLOW COMPLETE - All agents finished their work!\n');

          setTimeout(() => process.exit(0), 1000);
        }
      }
    });
  }
}

// Coordinator - triggers the workflow
async function startWorkflow() {
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for agents to connect

  console.log('\n🚀 COORDINATOR: Starting A2A workflow...\n');

  // Send data to first agent via HTTP
  await fetch('http://localhost:3001/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'coordinator',
      to: 'analyzer-agent',
      payload: {
        data: [45, 67, 23, 89, 34, 56, 78, 90, 12, 67]
      }
    })
  });

  // Also trigger via WebSocket bridge
  const ws = new WebSocket('ws://localhost:4567');
  ws.on('open', () => {
    ws.send(JSON.stringify({
      type: 'register',
      clientId: 'coordinator',
      role: 'coordinator'
    }));

    setTimeout(() => {
      ws.send(JSON.stringify({
        type: 'envelope',
        envelope: {
          from: 'coordinator',
          to: 'analyzer-agent',
          intent: 'analyze-data',
          payload: {
            data: [45, 67, 23, 89, 34, 56, 78, 90, 12, 67]
          }
        }
      }));
      console.log('📨 COORDINATOR: Sent data to analyzer agent\n');
    }, 500);
  });
}

// Start all agents
console.log('🚀 Starting A2A Multi-Agent System\n');
console.log('This demo shows 3 agents working together:\n');
console.log('  1. 🔬 Analyzer Agent - Analyzes data');
console.log('  2. 📝 Summarizer Agent - Creates summary');
console.log('  3. 📢 Reporter Agent - Publishes results\n');

new AnalyzerAgent();
new SummarizerAgent();
new ReporterAgent();

startWorkflow();
