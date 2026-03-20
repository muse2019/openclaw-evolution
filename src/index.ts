/**
 * OpenClaw Evolution Plugin
 *
 * A self-evolution plugin for OpenClaw that enables:
 * - Error-driven learning and improvement
 * - Periodic framework analysis
 * - Manual evolution triggers
 * - Risk-based approval workflow (🟢🟡🔴)
 *
 * Commands:
 *   /evolve              - Run manual evolution
 *   /evolve --report     - Generate report only
 *   /evolve --target X   - Focus on specific target
 *   /evolve --full       - Run full analysis
 *   /evolution_status    - Check engine status
 *   /evolution_history   - View past evolutions
 *   /evolution_rollback <id> <reason> - Rollback a change
 */

import type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
  PluginCommandContext,
  ReplyPayload,
} from 'openclaw';
import { EvolutionEngine } from './engine.js';
import type { EvolutionConfig, ErrorContext } from './types.js';
import { AskExecutor } from './executors/ask.js';
import { EvolutionLog } from './storage/index.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Plugin metadata
const PLUGIN_ID = 'openclaw-evolution';
const PLUGIN_NAME = 'OpenClaw Evolution';
const PLUGIN_VERSION = '0.2.0';

// Global engine instance
let engine: EvolutionEngine | null = null;

/**
 * Parse command arguments from the command body
 */
function parseArgs(commandBody: string): Record<string, string | boolean | string[]> {
  const result: Record<string, string | boolean | string[]> = {};
  for (const part of commandBody.trim().split(/\s+/)) {
    if (part.startsWith('--')) {
      result[part.slice(2)] = true;
    } else if (part.startsWith('-')) {
      result[part.slice(1)] = true;
    } else if (!result['_']) {
      result['_'] = part;
    } else {
      if (!Array.isArray(result['_args'])) result['_args'] = [];
      (result['_args'] as string[]).push(part);
    }
  }
  return result;
}

/**
 * Build a ReplyPayload with markdown text
 */
function reply(text: string): ReplyPayload {
  return { text };
}

/**
 * Plugin definition for OpenClaw
 */
const plugin: OpenClawPluginDefinition = {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  description: 'Self-evolution plugin for OpenClaw - learns from errors and improves itself',

  async register(api: OpenClawPluginApi): Promise<void> {
    // Determine directories
    const homeDir = os.homedir();
    const openclawDir = path.join(homeDir, '.openclaw');
    const dataDir = path.join(openclawDir, 'evolution-data');
    const workspaceDir = path.join(openclawDir, 'workspace');

    // Get config from plugin settings
    const cfg = api.pluginConfig as Record<string, unknown> | undefined;
    const evolutionEnabled = cfg?.evolutionEnabled ?? true;
    const errorThreshold = cfg?.errorThreshold ?? 3;
    const cooldownMinutes = cfg?.cooldownMinutes ?? 30;

    if (!evolutionEnabled) {
      api.logger.info(`[${PLUGIN_NAME}] Disabled by config`);
      return;
    }

    const config: EvolutionConfig = {
      enabled: true,
      errorThreshold: errorThreshold as number,
      cooldownMinutes: cooldownMinutes as number,
      triggers: {
        error: { enabled: true, threshold: errorThreshold as number, cooldownMinutes: cooldownMinutes as number },
        timer: { enabled: true, intervalHours: 24 },
        manual: { enabled: true },
      },
      limits: {
        auto: { perHour: 10, perDay: 50 },
        ask: { perHour: 5, perDay: 20 },
        forbid: { perHour: 20, perDay: 100 },
      },
      paths: {
        allowlist: [
          path.join(workspaceDir, 'skills', '**'),
          path.join(openclawDir, 'config', 'preferences.json'),
          path.join(workspaceDir, 'memory', '**'),
        ],
        blocklist: [
          path.join(openclawDir, 'auth', '**'),
          path.join(openclawDir, 'secrets', '**'),
          '**/.env',
          '**/*key*',
          '**/*secret*',
        ],
      },
      autoRollback: {
        enabled: true,
        errorIncreaseThreshold: 50,
      },
    };

    // Initialize the engine
    engine = new EvolutionEngine(
      { logger: api.logger },
      { dataDir, openclawDir, workspaceDir, config },
    );

    // Register /evolve command
    api.registerCommand({
      name: 'evolve',
      description: 'Trigger evolution cycle for self-improvement',
      acceptsArgs: true,
      handler: async (ctx: PluginCommandContext): Promise<ReplyPayload> => {
        if (!engine) return reply('❌ Evolution engine not initialized');

        const args = parseArgs(ctx.commandBody);

        const results = await engine.runEvolution({
          reportOnly: !!(args.report || (args['report-only'])),
          target: Array.isArray(args._args) ? (args._args as string[]).join(' ') : undefined,
          fullAnalysis: !!(args.full || args['full-analysis']),
        });

        const lines = [`## Evolution Complete`, '', `Processed **${results.length}** proposals:`, ''];
        for (const r of results) {
          const icon = r.success ? '✅' : r.action === 'forbidden' ? '🚫' : '❌';
          lines.push(`${icon} [${r.action}] ${r.message}`);
        }
        return reply(lines.join('\n'));
      },
    });

    // Register /evolution_status command
    api.registerCommand({
      name: 'evolution_status',
      description: 'Get evolution engine status and statistics',
      acceptsArgs: false,
      handler: async (): Promise<ReplyPayload> => {
        if (!engine) return reply('❌ Evolution engine not initialized');
        const s = engine.getStatus();
        return reply([
          '## Evolution Engine Status',
          `- **Running**: ${s.running ? '✅' : '❌'}`,
          `- **Last run**: ${s.lastRun ? new Date(s.lastRun).toLocaleString() : 'Never'}`,
          `- **Proposals generated**: ${s.proposalsGenerated}`,
          `- **Proposals executed**: ${s.proposalsExecuted}`,
          `- **Recent errors (24h)**: ${s.recentErrors}`,
          '',
          'Use `/evolve --report` to generate a report without executing changes.',
        ].join('\n'));
      },
    });

    // Register /evolution_history command
    api.registerCommand({
      name: 'evolution_history',
      description: 'Get evolution history',
      acceptsArgs: true,
      handler: async (ctx: PluginCommandContext): Promise<ReplyPayload> => {
        if (!engine) return reply('❌ Evolution engine not initialized');
        const count = parseInt(ctx.commandBody.trim()) || 20;
        const history = engine.getHistory(count);
        if (history.length === 0) return reply('📭 No evolution history yet.');
        const lines = ['## Evolution History', ''];
        for (const h of history.slice(0, count)) {
          const date = new Date(h.timestamp).toLocaleString();
          const icon = h.status === 'active' ? '✅' : '↩️';
          lines.push(`${icon} **${h.id}** (${date})`);
          lines.push(`   ${h.proposal.change} — ${h.proposal.riskLevel}`);
          lines.push('');
        }
        return reply(lines.join('\n'));
      },
    });

    // Register /evolution_rollback command
    api.registerCommand({
      name: 'evolution_rollback',
      description: 'Rollback a previous evolution',
      acceptsArgs: true,
      handler: async (ctx: PluginCommandContext): Promise<ReplyPayload> => {
        if (!engine) return reply('❌ Evolution engine not initialized');
        const parts = ctx.commandBody.trim().split(/\s+/);
        if (parts.length < 2) return reply('❌ Usage: `/evolution_rollback <id> <reason>`');
        const [evolutionId, ...reasonParts] = parts;
        const success = await engine.rollback(evolutionId, reasonParts.join(' '));
        return reply(success
          ? `✅ Rolled back evolution \`${evolutionId}\`. Reason: ${reasonParts.join(' ')}`
          : `❌ Rollback failed — evolution \`${evolutionId}\` not found or already rolled back`);
      },
    });

    // Register /evolution_approve command
    api.registerCommand({
      name: 'evolution_approve',
      description: 'Approve a pending evolution proposal',
      acceptsArgs: true,
      handler: async (ctx: PluginCommandContext): Promise<ReplyPayload> => {
        const proposalId = ctx.commandBody.trim();
        if (!proposalId) return reply('❌ Usage: `/evolution_approve <proposal_id>`');

        const pendingDir = path.join(dataDir, 'pending');
        const proposalFile = path.join(pendingDir, `${proposalId}.json`);
        const previewFile = path.join(pendingDir, `${proposalId}.md`);

        if (!fs.existsSync(proposalFile)) {
          return reply(`❌ Proposal \`${proposalId}\` not found`);
        }

        try {
          // Read the proposal
          const proposalData = JSON.parse(fs.readFileSync(proposalFile, 'utf-8'));
          const proposal = {
            ...proposalData,
            timestamp: new Date(proposalData.timestamp),
          };

          // Create executor to apply the change
          const evolutionLog = new EvolutionLog(dataDir);
          const askExecutor = new AskExecutor(dataDir, evolutionLog);

          // Get before content
          const targetPath = proposal.target;
          let beforeContent = '';
          if (fs.existsSync(targetPath)) {
            beforeContent = fs.readFileSync(targetPath, 'utf-8');
          }

          // Execute the approved proposal
          const result = await askExecutor.executeApproved(proposal, beforeContent);

          // Clean up pending files
          if (fs.existsSync(proposalFile)) fs.unlinkSync(proposalFile);
          if (fs.existsSync(previewFile)) fs.unlinkSync(previewFile);

          return reply(result.success
            ? `✅ Approved and executed: ${proposal.change}`
            : `❌ Execution failed: ${result.message}`);
        } catch (error) {
          return reply(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      },
    });

    // Register /evolution_reject command
    api.registerCommand({
      name: 'evolution_reject',
      description: 'Reject a pending evolution proposal',
      acceptsArgs: true,
      handler: async (ctx: PluginCommandContext): Promise<ReplyPayload> => {
        const proposalId = ctx.commandBody.trim();
        if (!proposalId) return reply('❌ Usage: `/evolution_reject <proposal_id>`');

        const pendingDir = path.join(dataDir, 'pending');
        const proposalFile = path.join(pendingDir, `${proposalId}.json`);
        const previewFile = path.join(pendingDir, `${proposalId}.md`);

        const jsonExists = fs.existsSync(proposalFile);
        const mdExists = fs.existsSync(previewFile);

        if (!jsonExists && !mdExists) {
          return reply(`❌ Proposal \`${proposalId}\` not found`);
        }

        // Delete pending files
        if (jsonExists) fs.unlinkSync(proposalFile);
        if (mdExists) fs.unlinkSync(previewFile);

        return reply(`🚫 Rejected proposal \`${proposalId}\``);
      },
    });

    // Register after_tool_call hook to collect errors
    api.registerHook('after_tool_call', async (event: unknown) => {
      const ctx = event as Record<string, unknown>;
      if (ctx.error && engine) {
        const errorContext: ErrorContext = {
          timestamp: new Date(),
          errorMessage: String(ctx.error),
          errorType: (ctx.error as Error)?.name || 'Error',
          toolName: String(ctx.toolName || 'unknown'),
        };
        await engine.recordError(errorContext);
      }
    });

    // Register session_end hook
    api.registerHook('session_end', async (event: unknown) => {
      const ctx = event as Record<string, unknown>;
      if (engine && ctx.sessionId) {
        await engine.recordSessionEnd(String(ctx.sessionId));
      }
    });

    // Start the engine
    engine.start();
    api.logger.info(`[${PLUGIN_NAME}] Plugin registered and engine started`);
  },
};

export default plugin;
export { EvolutionEngine } from './engine.js';
export * from './types.js';
