/**
 * Multi-Claude Coordinator Launcher
 * Spawns multiple Claude Code CLI sessions and coordinates them via AI Bridge
 *
 * Each Claude instance runs in its own terminal and communicates through the AI Bridge
 */

import { spawn } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Configuration
const config = {
  numClaudes: 3, // Number of Claude instances to spawn
  bridgePort: 65028,
  bridgeHttpPort: 65029,
  coordinatorPort: 65030,
  roles: [
    {
      id: 'architect',
      name: 'Architect Claude',
      color: 'cyan',
      prompt:
        'You are the Architect Claude. Your role is to analyze system design, create architecture plans, and coordinate with other Claude instances. Report your findings through the coordination system.',
    },
    {
      id: 'developer',
      name: 'Developer Claude',
      color: 'green',
      prompt:
        'You are the Developer Claude. Your role is to implement features, write code, and create tests based on architecture plans. Coordinate with the Architect Claude.',
    },
    {
      id: 'tester',
      name: 'Tester Claude',
      color: 'yellow',
      prompt:
        'You are the Tester Claude. Your role is to test code, find bugs, run integration tests, and report quality metrics. Coordinate with the Developer Claude.',
    },
  ],
};

// Create coordination workspace
const workspaceDir = path.join(projectRoot, '.multi-claude');
if (!existsSync(workspaceDir)) {
  mkdirSync(workspaceDir, { recursive: true });
}

// Create task files for each Claude instance
function createTaskFiles() {
  console.log('📝 Creating task files for each Claude instance...\n');

  config.roles.forEach((role, index) => {
    const taskFile = path.join(workspaceDir, `claude-${role.id}-task.md`);

    const taskContent = `# ${role.name} - Instance ${index + 1}

## Your Role
${role.prompt}

## Coordination Protocol

You are part of a multi-Claude system. Other Claude instances are running in parallel:
${config.roles.map((r) => `- ${r.name} (${r.id})`).join('\n')}

## Communication

To communicate with other Claude instances:
1. Write status updates to: \`.multi-claude/status-${role.id}.json\`
2. Read other instances' status from: \`.multi-claude/status-*.json\`
3. Write shared findings to: \`.multi-claude/shared/\`

## Status Updates Format

\`\`\`json
{
  "instance": "${role.id}",
  "timestamp": "ISO-8601",
  "status": "working|blocked|complete",
  "current_task": "description",
  "progress": "0-100",
  "findings": [],
  "blockers": [],
  "waiting_for": "other-instance-id or null"
}
\`\`\`

## Your Current Task

**WAIT FOR COORDINATOR TO ASSIGN TASK**

Check \`.multi-claude/tasks/${role.id}-current-task.md\` for your assigned task.

## Workflow

1. Read your current task from the task file
2. Execute the task autonomously
3. Update your status regularly
4. Check for messages from other instances
5. Write results to shared directory
6. Mark task as complete in your status

## Rules

- Be autonomous - don't ask for permission
- Update status every 2 minutes
- Check other instances' status before making decisions
- Coordinate dependencies explicitly
- Write detailed logs to \`.multi-claude/logs/${role.id}.log\`

## Startup Command

Run this now:
\`\`\`bash
# Create your status file
node -e "require('fs').writeFileSync('.multi-claude/status-${role.id}.json', JSON.stringify({instance:'${role.id}',timestamp:new Date().toISOString(),status:'idle',current_task:'waiting for task',progress:0,findings:[],blockers:[],waiting_for:null}, null, 2))"

# Watch for your task file
echo "👁️ Watching for task assignment..."
\`\`\`

---

**Instance ID:** ${role.id}
**Session Started:** $(date)
`;

    writeFileSync(taskFile, taskContent);
    console.log(`✓ Created: ${taskFile}`);
  });

  console.log('\n✅ Task files created!\n');
}

// Create coordination directories
function setupWorkspace() {
  console.log('📁 Setting up coordination workspace...\n');

  const dirs = [
    '.multi-claude/tasks',
    '.multi-claude/shared',
    '.multi-claude/logs',
    '.multi-claude/status',
  ];

  dirs.forEach((dir) => {
    const fullPath = path.join(projectRoot, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      console.log(`✓ Created: ${dir}`);
    }
  });

  console.log('\n✅ Workspace ready!\n');
}

// Create launcher scripts for each Claude instance
function createLauncherScripts() {
  console.log('🚀 Creating launcher scripts...\n');

  config.roles.forEach((role, index) => {
    // PowerShell script for Windows Terminal
    const psScript = `
# ${role.name} Launcher
$host.ui.RawUI.WindowTitle = "${role.name} - Claude Code CLI"

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor ${role.color}
Write-Host "  ${role.name.toUpperCase()}" -ForegroundColor ${role.color}
Write-Host "  Instance ID: ${role.id}" -ForegroundColor ${role.color}
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor ${role.color}
Write-Host ""

# Initialize status
$status = @{
    instance = "${role.id}"
    timestamp = (Get-Date).ToString("o")
    status = "initializing"
    current_task = "starting up"
    progress = 0
    findings = @()
    blockers = @()
    waiting_for = $null
} | ConvertTo-Json

$status | Out-File -FilePath ".multi-claude/status-${role.id}.json" -Encoding utf8

Write-Host "✓ Status initialized" -ForegroundColor Green
Write-Host "✓ Workspace ready" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Task file: .multi-claude/claude-${role.id}-task.md" -ForegroundColor Cyan
Write-Host "📊 Status file: .multi-claude/status-${role.id}.json" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting Claude Code CLI..." -ForegroundColor Yellow
Write-Host ""

# Start Claude with task file
Get-Content ".multi-claude/claude-${role.id}-task.md" | claude

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor ${role.color}
Write-Host "  ${role.name} session ended" -ForegroundColor ${role.color}
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor ${role.color}

# Wait before closing
Read-Host "Press Enter to close"
`;

    const scriptPath = path.join(workspaceDir, `launch-${role.id}.ps1`);
    writeFileSync(scriptPath, psScript);
    console.log(`✓ Created: launch-${role.id}.ps1`);
  });

  console.log('\n✅ Launcher scripts created!\n');
}

// Create master launcher using Windows Terminal
function createMasterLauncher() {
  console.log('🎯 Creating master launcher...\n');

  // Windows Terminal launcher (multiple tabs)
  const wtCommand = config.roles
    .map((role, index) => {
      const scriptPath = path.join(workspaceDir, `launch-${role.id}.ps1`).replace(/\\/g, '/');
      return `new-tab --title "${role.name}" PowerShell -NoExit -File "${scriptPath}"`;
    })
    .join(' ; ');

  const wtLauncher = `@echo off
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo   MULTI-CLAUDE COORDINATOR
echo   Launching ${config.numClaudes} Claude Code CLI instances
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 📍 Project: ${projectRoot}
echo 📁 Workspace: .multi-claude/
echo.
echo Starting instances:
${config.roles.map((r) => `echo   - ${r.name} (${r.id})`).join('\n')}
echo.
echo ⏳ Launching Windows Terminal...
timeout /t 2 /nobreak > nul

wt ${wtCommand}

echo.
echo ✅ All instances launched!
echo.
echo 📊 Monitor: npm run monitor:multi-claude
echo 📝 Assign tasks: node scripts/assign-claude-tasks.js
echo.
pause
`;

  writeFileSync(path.join(projectRoot, 'launch-multi-claude.bat'), wtLauncher);
  console.log('✓ Created: launch-multi-claude.bat\n');

  // Alternative: Separate windows launcher
  const separateWindowsLauncher = `@echo off
echo Launching ${config.numClaudes} Claude instances in separate windows...
echo.
${config.roles
  .map((role) => {
    const scriptPath = path.join(workspaceDir, `launch-${role.id}.ps1`).replace(/\\/g, '/');
    return `start "${role.name}" PowerShell -NoExit -File "${scriptPath}"`;
  })
  .join('\n')}
echo.
echo ✅ All instances launched!
pause
`;

  writeFileSync(path.join(projectRoot, 'launch-multi-claude-windows.bat'), separateWindowsLauncher);
  console.log('✓ Created: launch-multi-claude-windows.bat (fallback)\n');

  console.log('✅ Master launchers created!\n');
}

// Create coordinator script
function createCoordinator() {
  const coordinatorScript = `/**
 * Multi-Claude Coordinator
 * Assigns tasks and monitors progress of multiple Claude instances
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const workspaceDir = '.multi-claude';

// Task assignment
export function assignTask(instanceId, task) {
  const taskFile = join(workspaceDir, 'tasks', \`\${instanceId}-current-task.md\`);
  const taskContent = \`# Task Assignment for \${instanceId}

**Assigned:** \${new Date().toISOString()}

## Task Description
\${task.description}

## Success Criteria
\${task.criteria ? task.criteria.map(c => \`- \${c}\`).join('\\n') : 'Complete the task successfully'}

## Dependencies
\${task.dependencies ? task.dependencies.join(', ') : 'None'}

## Priority
\${task.priority || 'medium'}

## Estimated Time
\${task.estimatedTime || 'unknown'}

---
**Update your status when you start and complete this task!**
\`;

  writeFileSync(taskFile, taskContent);
  console.log(\`✅ Task assigned to \${instanceId}\`);

  // Notify via status file
  const statusFile = join(workspaceDir, \`status-\${instanceId}.json\`);
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

    console.log(\`\${statusIcon} \${status.instance.toUpperCase()}\`);
    console.log(\`   Status: \${status.status}\`);
    console.log(\`   Task: \${status.current_task}\`);
    console.log(\`   Progress: \${status.progress}%\`);
    if (status.blockers && status.blockers.length > 0) {
      console.log(\`   Blockers: \${status.blockers.join(', ')}\`);
    }
    if (status.waiting_for) {
      console.log(\`   Waiting for: \${status.waiting_for}\`);
    }
    console.log(\`   Updated: \${new Date(status.timestamp).toLocaleTimeString()}\`);
    console.log();
  });

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(\`Last update: \${new Date().toLocaleTimeString()}\`);
}

// CLI interface
if (import.meta.url === \`file://\${process.argv[1]}\`) {
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
`;

  writeFileSync(
    path.join(projectRoot, 'scripts', 'multi-claude-coordinator.js'),
    coordinatorScript
  );
  console.log('✓ Created: scripts/multi-claude-coordinator.js\n');
}

// Main execution
async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         MULTI-CLAUDE COORDINATOR - SYSTEM SETUP               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  setupWorkspace();
  createTaskFiles();
  createLauncherScripts();
  createMasterLauncher();
  createCoordinator();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ SETUP COMPLETE!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n');
  console.log('📋 Next Steps:\n');
  console.log('1. Launch all Claude instances:');
  console.log('   > launch-multi-claude.bat');
  console.log('   (or use launch-multi-claude-windows.bat for separate windows)\n');
  console.log('2. Monitor the instances:');
  console.log('   > node scripts/multi-claude-coordinator.js monitor\n');
  console.log('3. Assign tasks:');
  console.log(
    '   > node scripts/multi-claude-coordinator.js assign architect "Design the system"\n'
  );
  console.log('');
  console.log('📁 Workspace: .multi-claude/');
  console.log('📊 Status files: .multi-claude/status-*.json');
  console.log('📝 Task files: .multi-claude/tasks/');
  console.log('📄 Logs: .multi-claude/logs/');
  console.log('\n');
  console.log('🚀 Ready to coordinate multiple Claude instances!');
  console.log('\n');
}

main().catch(console.error);
