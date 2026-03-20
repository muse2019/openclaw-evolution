/**
 * OpenClaw Evolution Plugin
 *
 * A self-evolution plugin for OpenClaw that enables:
 * - Error-driven learning and improvement
 * - Periodic framework analysis
 * - Manual evolution triggers
 * - Risk-based approval workflow (L0-L3)
 *
 * Usage:
 *   /evolve              - Run manual evolution
 *   /evolve --report     - Generate report only (no L0/L1 execution)
 *   /evolve --target X   - Focus on specific target
 *   /evolve --full       - Run full analysis
 */

import { PluginDefinition, OpenClawAPI } from './types.js';
import { EvolutionEngine } from './engine.js';
import * as path from 'path';
import * as os from 'os';

// Plugin metadata
const PLUGIN_ID = 'openclaw-evolution';
const PLUGIN_NAME = 'OpenClaw Evolution';
const PLUGIN_VERSION = '0.1.0';

// Global engine instance
let engine: EvolutionEngine | null = null;

/**
 * Plugin definition
 */
const plugin: PluginDefinition = {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  version: PLUGIN_VERSION,
  description: 'Self-evolution plugin for OpenClaw - learns from errors and improves itself',

  async register(api: OpenClawAPI): Promise<void> {
    // Determine directories
    const homeDir = os.homedir();
    const openclawDir = path.join(homeDir, '.openclaw');
    const dataDir = path.join(openclawDir, 'evolution-data');

    // Initialize the engine
    engine = new EvolutionEngine(api, {
      dataDir,
      openclawDir,
      enabled: true,
    });

    // Register the evolve skill
    api.registerSkill(path.join(__dirname, '../skills/evolve'));

    // Register tools
    api.registerTool({
      name: 'evolve',
      description: 'Trigger evolution cycle for self-improvement',
      parameters: {
        type: 'object',
        properties: {
          reportOnly: {
            type: 'boolean',
            description: 'Generate reports only, no L0/L1 execution',
          },
          target: {
            type: 'string',
            description: 'Specific target to analyze',
          },
          fullAnalysis: {
            type: 'boolean',
            description: 'Run full analysis with all analyzers',
          },
        },
      },
      handler: async (params) => {
        const results = await engine!.runEvolution({
          reportOnly: params.reportOnly as boolean,
          target: params.target as string,
          fullAnalysis: params.fullAnalysis as boolean,
        });

        return {
          success: results.some(r => r.success),
          results,
          message: `Processed ${results.length} proposals`,
        };
      },
    });

    // Register rollback tool
    api.registerTool({
      name: 'evolution_rollback',
      description: 'Rollback a previous evolution',
      parameters: {
        type: 'object',
        properties: {
          evolutionId: {
            type: 'string',
            description: 'ID of the evolution to rollback',
          },
          reason: {
            type: 'string',
            description: 'Reason for rollback',
          },
        },
        required: ['evolutionId', 'reason'],
      },
      handler: async (params) => {
        const success = await engine!.rollback(
          params.evolutionId as string,
          params.reason as string
        );

        return {
          success,
          message: success
            ? `Rolled back evolution ${params.evolutionId}`
            : 'Rollback failed',
        };
      },
    });

    // Register status tool
    api.registerTool({
      name: 'evolution_status',
      description: 'Get evolution engine status and statistics',
      parameters: {
        type: 'object',
        properties: {},
      },
      handler: async () => {
        return engine!.getStatus();
      },
    });

    // Register history tool
    api.registerTool({
      name: 'evolution_history',
      description: 'Get evolution history',
      parameters: {
        type: 'object',
        properties: {
          count: {
            type: 'number',
            description: 'Number of records to return',
            default: 20,
          },
        },
      },
      handler: async (params) => {
        return engine!.getHistory(params.count as number);
      },
    });

    // Register error hook for automatic error-driven evolution
    api.registerHook({
      event: 'execution_error',
      handler: async (context: unknown) => {
        const ctx = context as {
          error?: Error;
          skillName?: string;
          input?: string;
        };

        if (ctx.error) {
          await engine!.recordError({
            timestamp: new Date(),
            errorMessage: ctx.error.message,
            errorType: ctx.error.name || 'Error',
            skillName: ctx.skillName,
            userInput: ctx.input,
          });
        }
      },
    });

    // Register success hook for metrics
    api.registerHook({
      event: 'execution_success',
      handler: async (context: unknown) => {
        const ctx = context as { skillName?: string };
        await engine!.recordSuccess(ctx.skillName);
      },
    });

    // Start the engine
    engine.start();

    api.log(`[${PLUGIN_NAME}] Plugin registered and engine started`, 'info');
  },
};

export default plugin;

// Also export the engine for direct use
export { EvolutionEngine } from './engine.js';
export * from './types.js';
