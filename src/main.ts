import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { CodeReviewOrchestrator } from './orchestrator.js';
import { ReportGenerator } from './utils/report-generator.js';

dotenv.config();

async function main() {
  const [owner, repo, prStr] = process.argv.slice(2);

  // Validate arguments
  if (!owner || !repo || !prStr) {
    console.error('Usage: npm run dev -- <owner> <repo> <pr-number>');
    process.exit(1);
  }
  const prNumber = parseInt(prStr, 10);
  if (isNaN(prNumber) || prNumber < 1) {
    console.error(`Invalid PR number: ${prStr}`);
    process.exit(1);
  }

  // Validate authentication
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const hasBedrock = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  if (hasBedrock) {
    if (!process.env.AWS_REGION) { console.error('AWS_REGION is required for Bedrock'); process.exit(1); }
    console.log('Using AWS Bedrock authentication');
  } else if (hasAnthropic) {
    console.log('Using Anthropic API authentication');
  } else {
    console.error('No authentication configured. Set ANTHROPIC_API_KEY or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY.');
    process.exit(1);
  }

  // Validate model
  if (!process.env.ANTHROPIC_MODEL) {
    console.error('ANTHROPIC_MODEL is required. Set it in .env (e.g. claude-sonnet-4-5-20250929)');
    process.exit(1);
  }

  try {
    const orchestrator = new CodeReviewOrchestrator();
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    const generator = new ReportGenerator();
    const reportsDir = 'reports';
    fs.mkdirSync(reportsDir, { recursive: true });

    const base = `${reportsDir}/${owner}-${repo}-pr${prNumber}`;
    fs.writeFileSync(`${base}.json`, generator.generateJSONReport(report));
    fs.writeFileSync(`${base}.md`,   generator.generateMarkdownReport(report));
    fs.writeFileSync(`${base}.html`, generator.generateHTMLReport(report));

    console.log(`Reports saved to ${base}.{json,md,html}`);
    console.log(`Overall score: ${report.summary.overallScore}/100`);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
