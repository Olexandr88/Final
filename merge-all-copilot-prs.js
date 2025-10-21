#!/usr/bin/env node
/**
 * Auto-merge all GitHub Copilot PRs
 * This script finds and merges all open Copilot PRs to the main branch
 */

import 'dotenv/config';
import { Octokit } from '@octokit/rest';

const owner = 'scarmonit';
const repo = 'Final';
const baseBranch = 'Scarmonit'; // Default branch

async function mergeAllCopilotPRs() {
  // Initialize Octokit - will use GITHUB_TOKEN from environment
  const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
  });

  console.log('🔍 Finding all open Pull Requests...\n');

  try {
    // Get all open PRs
    const { data: prs } = await octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });

    console.log(`Found ${prs.length} open PRs\n`);

    // Filter for Copilot PRs (branches starting with 'copilot/')
    const copilotPRs = prs.filter((pr) => pr.head.ref.startsWith('copilot/'));

    console.log(`🤖 Found ${copilotPRs.length} Copilot PRs:\n`);
    copilotPRs.forEach((pr) => {
      console.log(`  - PR #${pr.number}: ${pr.title}`);
      console.log(`    Branch: ${pr.head.ref} → ${pr.base.ref}`);
    });

    if (copilotPRs.length === 0) {
      console.log('\n✅ No Copilot PRs to merge!');
      return;
    }

    console.log(`\n🚀 Merging ${copilotPRs.length} Copilot PRs...\n`);

    for (const pr of copilotPRs) {
      try {
        // Check if PR is mergeable
        const { data: prDetails } = await octokit.pulls.get({
          owner,
          repo,
          pull_number: pr.number,
        });

        if (prDetails.mergeable === false) {
          console.log(`⚠️  PR #${pr.number} has conflicts - skipping`);
          continue;
        }

        // Check if all checks have passed
        const { data: checks } = await octokit.checks.listForRef({
          owner,
          repo,
          ref: pr.head.sha,
        });

        const allPassed = checks.check_runs.every(
          (check) => check.conclusion === 'success' || check.conclusion === null
        );

        if (!allPassed) {
          console.log(`⚠️  PR #${pr.number} - checks not passing - skipping`);
          continue;
        }

        // Merge the PR
        console.log(`✅ Merging PR #${pr.number}: ${pr.title}...`);

        await octokit.pulls.merge({
          owner,
          repo,
          pull_number: pr.number,
          merge_method: 'squash',
          commit_title: `${pr.title} (#${pr.number})`,
          commit_message: `🤖 Auto-merged by AI automation\n\n${pr.body || ''}`,
        });

        console.log(`   ✓ Merged successfully!\n`);
      } catch (error) {
        console.error(`   ✗ Failed to merge PR #${pr.number}: ${error.message}\n`);
      }
    }

    console.log('\n🎉 All Copilot PRs processed!');
    console.log('\n📊 Summary:');
    console.log(`   Total PRs found: ${prs.length}`);
    console.log(`   Copilot PRs: ${copilotPRs.length}`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
mergeAllCopilotPRs();
