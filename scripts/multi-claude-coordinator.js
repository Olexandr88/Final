/**
 * Multi-Claude Coordinator
 * Assigns tasks and monitors progress of multiple Claude instances
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const workspaceDir = '.multi-claude';

// Task assignment
export function assignTask(instanceId, task) {
  const taskFile = join(workspaceDir, 'tasks', `${instanceId}-current-task.md`);
  const taskContent = `# Task Assignment for ${instanceId}

**Assigned:** ${new Date().toISOString()}

## Task Description
${task.description}

## Success Criteria
${task.criteria ? task.criteria.map(c => `- ${c}`).join('\n') : 'Complete the task successfully'}

## Dependencies
${task.dependencies ? task.dependencies.join(', ') : 'None'}

## Priority
${task.priority || 'medium'}

## Estimated Time
${task.estimatedTime || 'unknown'}

---
**Update your status when you start and complete this task!**
`;

  writeFileSync(taskFile, taskContent);
  console.log(`✅ Task assigned to ${instanceId}`);

  // Notify via status file
  const statusFile = join(workspaceDir, `status-${instanceId}.json`);
  if (existsSync(statusFile)) {
    const status = JSON.parse(readFileSync(statusFile, 'utf-8'));
    status.current_task = task.description;
    status.status = 'assigned';
    status.timestamp = new Date().toISOString();
    writeFileSync(statusFile, JSON.stringify(status, null, 2));
  }
}

// Get status of all instances
export function getStatuses() {
  const statusFiles = readdirSync(workspaceDir)
    .filter(f => f.startsWith('status-') && f.endsWith('.json'));

  return statusFiles.map(file => {
    const content = readFileSync(join(workspaceDir, file), 'utf-8');
    return JSON.parse(content);
  });
}

// Monitor progress
export function monitor() {
  console.clear();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('   MULTI-CLAUDE COORDINATION DASHBOARD');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  const statuses = getStatuses();

  statuses.forEach(status => {
    const statusIcon = {
      idle: '⏸️',
      assigned: '📋',
      working: '⚙️',
      blocked: '🚧',
      complete: '✅',
      error: '❌'
    }[status.status] || '❓';

    console.log(`${statusIcon} ${status.instance.toUpperCase()}`);
    console.log(`   Status: ${status.status}`);
    console.log(`   Task: ${status.current_task}`);
    console.log(`   Progress: ${status.progress}%`);
    if (status.blockers && status.blockers.length > 0) {
      console.log(`   Blockers: ${status.blockers.join(', ')}`);
    }
    if (status.waiting_for) {
      console.log(`   Waiting for: ${status.waiting_for}`);
    }
    console.log(`   Updated: ${new Date(status.timestamp).toLocaleTimeString()}`);
    console.log();
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Last update: ${new Date().toLocaleTimeString()}`);
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];

  if (command === 'monitor') {
    // Continuous monitoring
    monitor();
    setInterval(monitor, 5000);
  } else if (command === 'status') {
    // One-time status check
    monitor();
  } else if (command === 'assign') {
    // Assign task
    const instanceId = process.argv[3];
    const description = process.argv[4];

    if (!instanceId || !description) {
      console.error('Usage: node coordinator.js assign <instance-id> "<task description>"');
      process.exit(1);
    }

    assignTask(instanceId, { description });
  } else {
    console.log('Multi-Claude Coordinator');
    console.log('');
    console.log('Commands:');
    console.log('  monitor   - Live monitoring dashboard');
    console.log('  status    - One-time status check');
    console.log('  assign <instance> "<task>" - Assign task');
    console.log('');
    console.log('Example:');
    console.log('  node coordinator.js assign architect "Analyze the A2A architecture"');
  }
}
