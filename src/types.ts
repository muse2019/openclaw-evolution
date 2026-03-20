/**
 * OpenClaw Evolution Plugin - Type Definitions
 */

// ============================================
// Core Types
// ============================================

/**
 * Risk levels for evolution proposals
 * - L0: Auto-execute (low risk, typo fixes, phrasing improvements)
 * - L1: Ask user (medium risk, new skills, config changes)
 * - L2: Suggest only (high risk, deletions, behavior changes)
 * - L3: Forbidden (critical, secrets, auth data)
 */
export type RiskLevel = 'L0' | 'L1' | 'L2' | 'L3';

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
    L0: RateLimit;
    L1: RateLimit;
    L2: RateLimit;
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
// Plugin Interface Types
// ============================================

/**
 * Plugin API provided by OpenClaw
 */
export interface OpenClawAPI {
  registerSkill(path: string): void;
  registerTool(tool: ToolDefinition): void;
  registerHook(hook: HookDefinition): void;
  log(message: string, level?: 'info' | 'warn' | 'error'): void;
  askUser(question: string, options: string[]): Promise<string>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  getSkill(name: string): Promise<string>;
  updateSkill(name: string, content: string): Promise<void>;
  getConfig(key: string): Promise<unknown>;
  setConfig(key: string, value: unknown): Promise<void>;
  getMemory(key: string): Promise<unknown>;
  setMemory(key: string, value: unknown): Promise<void>;
}

/**
 * Tool definition for OpenClaw
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Hook definition for OpenClaw
 */
export interface HookDefinition {
  event: string;
  handler: (context: unknown) => Promise<void>;
}

/**
 * Plugin definition
 */
export interface PluginDefinition {
  id: string;
  name: string;
  version: string;
  description: string;
  register(api: OpenClawAPI): Promise<void>;
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
