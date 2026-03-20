/**
 * OpenClaw Evolution Plugin - Type Definitions
 * Refactored to use real OpenClaw Plugin API
 */

// ============================================
// Core Types
// ============================================

/**
 * Risk levels for evolution proposals
 * 🟢 Auto: Execute without asking (typo fixes, phrasing improvements)
 * 🟡 Ask:  Show preview, ask for confirmation (new skills, config changes)
 * 🔴 Forbid: Never auto-execute, generate report only (deletions, behavior changes)
 */
export type RiskLevel = 'auto' | 'ask' | 'forbid';

/**
 * Evolution target categories
 */
export type EvolutionTarget =
  | 'skill'        // SKILL.md files, tool definitions
  | 'config'       // User preferences, model parameters
  | 'memory'       // User data, habits, history
  | 'framework';   // Knowledge base structure, workflow design

/**
 * Trigger types
 */
export type TriggerType = 'error' | 'timer' | 'manual';

/**
 * Execution status
 */
export type ExecutionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'rolled_back'
  | 'forbidden';

// ============================================
// Proposal & Analysis
// ============================================

/**
 * A proposed evolution change
 */
export interface EvolutionProposal {
  id: string;
  timestamp: Date;
  type: EvolutionTarget;
  target: string;           // File path or config key
  change: string;           // Description of the change
  reasoning: string;        // Why this change is needed
  beforeSnapshot?: string;  // Content before change
  afterSnapshot?: string;   // Content after change
  riskLevel?: RiskLevel;    // Assigned after classification
  status: ExecutionStatus;
  source: TriggerType;      // What triggered this proposal
  errorContext?: ErrorContext; // Related error if error-triggered
}

/**
 * Context of an error that triggered evolution
 */
export interface ErrorContext {
  timestamp: Date;
  errorMessage: string;
  errorType: string;
  skillName?: string;
  toolName?: string;
  userInput?: string;
  executionTrace?: string[];
  recoveryAttempted?: boolean;
}

/**
 * Analysis result from an analyzer
 */
export interface AnalysisResult {
  proposals: EvolutionProposal[];
  patterns: ErrorPattern[];
  insights: string[];
  confidence: number;  // 0-1
}

/**
 * Pattern detected in errors
 */
export interface ErrorPattern {
  pattern: string;
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  examples: string[];
}

// ============================================
// Storage Types
// ============================================

/**
 * Error log entry
 */
export interface ErrorLogEntry {
  id: string;
  timestamp: Date;
  error: ErrorContext;
  resolved: boolean;
  resolvedBy?: string;  // Evolution ID that resolved it
}

/**
 * Evolution history record
 */
export interface EvolutionRecord {
  id: string;
  timestamp: Date;
  proposal: EvolutionProposal;
  before: Snapshot;
  after: Snapshot;
  status: 'active' | 'rolled_back';
  rolledBackAt?: Date;
  rolledBackReason?: string;
  effectiveness?: EffectivenessMetrics;
}

/**
 * File/content snapshot for rollback
 */
export interface Snapshot {
  type: 'file' | 'config' | 'memory';
  path: string;
  content: string;
  hash: string;
  timestamp: Date;
}

/**
 * Effectiveness metrics for tracking evolution impact
 */
export interface EffectivenessMetrics {
  errorsBefore: number;
  errorsAfter: number;
  successRateBefore: number;
  successRateAfter: number;
  userSatisfaction?: number;  // 1-5 if feedback provided
  period: 'day' | 'week' | 'month';
}

// ============================================
// Configuration
// ============================================

/**
 * Evolution plugin configuration
 */
export interface EvolutionConfig {
  enabled: boolean;
  errorThreshold: number;
  cooldownMinutes: number;
  feedbackThreshold?: number;    // 默认 10
  feedbackCooldownHours?: number; // 默认 6
  triggers: {
    error: {
      enabled: boolean;
      threshold: number;      // Errors before triggering
      cooldownMinutes: number;
    };
    timer: {
      enabled: boolean;
      intervalHours: number;
    };
    manual: {
      enabled: boolean;
    };
  };
  limits: {
    auto: RateLimit;
    ask: RateLimit;
    forbid: RateLimit;
  };
  paths: {
    allowlist: string[];
    blocklist: string[];
  };
  autoRollback: {
    enabled: boolean;
    errorIncreaseThreshold: number;  // Rollback if errors increase by this %
  };
}

/**
 * Rate limiting configuration
 */
export interface RateLimit {
  perHour: number;
  perDay: number;
}

/**
 * Classification rule for risk assessment
 */
export interface ClassificationRule {
  id: string;
  pattern: RegExp | ((proposal: EvolutionProposal) => boolean);
  level: RiskLevel;
  reason: string;
  target?: EvolutionTarget;
}

// ============================================
// Result Types
// ============================================

/**
 * Result of evolution execution
 */
export interface EvolutionResult {
  success: boolean;
  proposalId: string;
  action: 'executed' | 'asked' | 'suggested' | 'rejected' | 'forbidden';
  message: string;
  rollbackAvailable: boolean;
}

/**
 * Evolution engine status
 */
export interface EngineStatus {
  running: boolean;
  lastRun: Date | null;
  proposalsGenerated: number;
  proposalsExecuted: number;
  proposalsRolledBack: number;
  recentErrors: number;
}

// ============================================
// Plugin Interface Types (Real OpenClaw API)
// ============================================

/**
 * Plugin definition for OpenClaw
 * Based on OpenClawPluginDefinition
 */
export interface EvolutionPluginDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  register(api: EvolutionPluginApi): Promise<void>;
}

/**
 * Evolution-specific API wrapper
 * Wraps the real OpenClawPluginApi with additional helpers
 */
export interface EvolutionPluginApi {
  // Core API from OpenClaw
  registerTool(tool: EvolutionToolDefinition, opts?: { name: string }): void;
  registerHook(event: PluginHookName, handler: (event: unknown) => Promise<void>): void;
  logger: PluginLogger;
  
  // Configuration
  config: {
    evolutionEnabled: boolean;
    errorThreshold: number;
    cooldownMinutes: number;
  };
  
  // Runtime context
  runtime: {
    workspaceDir: string;
    agentDir: string;
  };
}

/**
 * Available hook events in OpenClaw
 */
export type PluginHookName = 'after_tool_call' | 'session_end' | 'before_reset';

/**
 * Logger interface from OpenClaw
 */
export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

/**
 * Tool definition for OpenClaw (simplified for evolution plugin)
 */
export interface EvolutionToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description: string;
      default?: unknown;
    }>;
    required?: string[];
  };
  handler: (params: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

/**
 * Tool context provided by OpenClaw
 */
export interface ToolContext {
  workspaceDir: string;
  agentDir: string;
  sessionKey: string;
  sessionId: string;
}

/**
 * After tool call hook event
 */
export interface AfterToolCallEvent {
  toolName: string;
  success: boolean;
  error?: Error;
  result?: unknown;
  params?: Record<string, unknown>;
}

/**
 * Session end hook event
 */
export interface SessionEndEvent {
  sessionId: string;
  sessionKey: string;
  messages?: Array<{
    role: string;
    content: string;
  }>;
}
