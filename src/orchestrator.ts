import { query } from '@anthropic-ai/claude-agent-sdk';
import { ReviewReport, ReviewReportSchema, ReviewReportJSONSchema } from './types/report-types.js';
import { codeQualityAnalyzer } from './agents/code-quality-analyzer.js';
import { testCoverageAnalyzer } from './agents/test-coverage-analyzer.js';
import { refactoringSuggester } from './agents/refactoring-suggester.js';
import { buildOrchestratorPrompt } from './prompts/orchestrator.prompt.js';
import { mcpServersConfig } from './config/mcp.config.js';
import { logger } from './utils/logger.js';

export interface OrchestratorOptions {}

export class CodeReviewOrchestrator {
  constructor(_options: OrchestratorOptions = {}) {}

  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startTime = Date.now();
    const prompt = buildOrchestratorPrompt(owner, repo, prNumber);

    logger.info(`Starting review: ${owner}/${repo}#${prNumber}`);

    let structuredOutput: unknown = null;

    for await (const message of query({
      prompt,
      options: {
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
        agents: {
          'code-quality-analyzer': codeQualityAnalyzer,
          'test-coverage-analyzer': testCoverageAnalyzer,
          'refactoring-suggester': refactoringSuggester,
        },
        allowedTools: [
          'Task',
          'mcp__github__get_pull_request',
          'mcp__github__get_pull_request_files',
          'mcp__github__list_pull_request_commits',
        ],
        mcpServers: mcpServersConfig,
        maxTurns: 50,
        permissionMode: 'bypassPermissions',
        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema,
        },
      },
    })) {
      if (message.type === 'result') {
        if ((message as any).structured_output) {
          structuredOutput = (message as any).structured_output;
        } else if ((message as any).result) {
          try {
            structuredOutput = JSON.parse((message as any).result);
          } catch {
            logger.warn('Could not parse result as JSON');
          }
        }
      }
    }

    const duration = Date.now() - startTime;
    logger.info(`Review complete in ${duration}ms`);

    const parsed = ReviewReportSchema.safeParse(structuredOutput);
    if (!parsed.success) {
      throw new Error(`Invalid report structure: ${parsed.error.message}`);
    }

    parsed.data.metadata.duration = duration;
    return parsed.data;
  }
}
