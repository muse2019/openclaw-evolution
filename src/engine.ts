/**
 * Evolution Engine
 * Core orchestrator for the evolution process
 */

import {
  EvolutionProposal,
  EvolutionResult,
  RiskLevel,
  TriggerType,
  ErrorContext,
  EngineStatus,
  OpenClawAPI,
} from './types.js';

import { ErrorLog, EvolutionLog, MetricsStore } from './storage/index.js';
import { RiskClassifier } from './classifiers/index.js';
import { PathChecker, RateLimiter, RollbackManager } from './safety/index.js';
import { RootCauseAnalyzer, FrameworkAnalyzer, MetricsAnalyzer } from './analyzers/index.js';
import { AutoExecutor, AskExecutor, SuggestExecutor, ForbiddenExecutor, Executor } from './executors/index.js';
import { ErrorTrigger, TimerTrigger, ManualTrigger, ManualTriggerOptions } from './triggers/index.js';

export interface EvolutionEngineConfig {
  dataDir: string;
  openclawDir: string;
  enabled: boolean;
}

export class EvolutionEngine {
  // Storage
  private errorLog: ErrorLog;
  private evolutionLog: EvolutionLog;
  private metricsStore: MetricsStore;

  // Safety
  private pathChecker: PathChecker;
  private rateLimiter: RateLimiter;
  private rollbackManager: RollbackManager;

  // Analyzers
  private rootCauseAnalyzer: RootCauseAnalyzer;
  private frameworkAnalyzer: FrameworkAnalyzer;
  private metricsAnalyzer: MetricsAnalyzer;

  // Classifier
  private riskClassifier: RiskClassifier;

  // Executors
  private executors: Map<RiskLevel, Executor>;

  // Triggers
  private errorTrigger: ErrorTrigger;
  private timerTrigger: TimerTrigger;
  private manualTrigger: ManualTrigger;

  // State
  private api: OpenClawAPI;
  private running: boolean = false;
  private proposalsGenerated: number = 0;
  private proposalsExecuted: number = 0;
  private proposalsRolledBack: number = 0;

  constructor(api: OpenClawAPI, config: EvolutionEngineConfig) {
    this.api = api;

    // Initialize storage
    this.errorLog = new ErrorLog(config.dataDir);
    this.evolutionLog = new EvolutionLog(config.dataDir);
    this.metricsStore = new MetricsStore(config.dataDir);

    // Initialize safety
    this.pathChecker = new PathChecker();
    this.rateLimiter = new RateLimiter(config.dataDir);
    this.rollbackManager = new RollbackManager(this.evolutionLog);

    // Initialize analyzers
    this.rootCauseAnalyzer = new RootCauseAnalyzer(this.errorLog);
    this.frameworkAnalyzer = new FrameworkAnalyzer(config.openclawDir);
    this.metricsAnalyzer = new MetricsAnalyzer(this.metricsStore, this.evolutionLog);

    // Initialize classifier
    this.riskClassifier = new RiskClassifier();

    // Initialize executors
    this.executors = new Map();
    this.executors.set('L0', new AutoExecutor(api, this.evolutionLog));
    this.executors.set('L1', new AskExecutor(api, this.evolutionLog));
    this.executors.set('L2', new SuggestExecutor(config.dataDir));
    this.executors.set('L3', new ForbiddenExecutor(config.dataDir));

    // Initialize triggers
    this.errorTrigger = new ErrorTrigger(this.errorLog);
    this.timerTrigger = new TimerTrigger();
    this.manualTrigger = new ManualTrigger();

    // Wire up trigger callbacks
    this.setupTriggers();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * Start the evolution engine
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.timerTrigger.start();
    this.api.log('[Evolution] Engine started', 'info');
  }

  /**
   * Stop the evolution engine
   */
  stop(): void {
    this.running = false;
    this.timerTrigger.stop();
    this.api.log('[Evolution] Engine stopped', 'info');
  }

  /**
   * Run evolution cycle manually
   */
  async runEvolution(options?: ManualTriggerOptions): Promise<EvolutionResult[]> {
    return this.processTrigger('manual', options);
  }

  /**
   * Record an error (for error-driven evolution)
   */
  async recordError(error: ErrorContext): Promise<boolean> {
    // Record success/error for metrics
    await this.metricsStore.recordError(error.skillName, {
      type: error.errorType,
      message: error.errorMessage,
    });

    // Check if error trigger should fire
    return this.errorTrigger.recordError(error);
  }

  /**
   * Record a success (for metrics)
   */
  async recordSuccess(skillName?: string): Promise<void> {
    await this.metricsStore.recordSuccess(skillName);
  }

  /**
   * Rollback an evolution
   */
  async rollback(evolutionId: string, reason: string): Promise<boolean> {
    const result = await this.rollbackManager.rollback(evolutionId, reason);
    if (result.success) {
      this.proposalsRolledBack++;
    }
    return result.success;
  }

  /**
   * Get engine status
   */
  getStatus(): EngineStatus {
    const stats = this.errorLog.getStats();
    return {
      running: this.running,
      lastRun: this.timerTrigger.getStatus().lastRun,
      proposalsGenerated: this.proposalsGenerated,
      proposalsExecuted: this.proposalsExecuted,
      proposalsRolledBack: this.proposalsRolledBack,
      recentErrors: stats.last24Hours,
    };
  }

  /**
   * Get evolution history
   */
  getHistory(count: number = 20) {
    return this.evolutionLog.getRecent(count);
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    return this.errorLog.getStats();
  }

  /**
   * Get metrics summary
   */
  getMetrics() {
    return {
      daily: this.metricsStore.getAggregated('day'),
      weekly: this.metricsStore.getAggregated('week'),
      trending: this.metricsStore.getTrending(),
    };
  }

  /**
   * List rollbackable evolutions
   */
  listRollbackable() {
    return this.rollbackManager.listRollbackable();
  }

  // ============================================
  // Private methods
  // ============================================

  private setupTriggers(): void {
    // Error trigger callback
    this.errorTrigger.onTrigger(async (type, errors) => {
      await this.processTrigger(type, { errors });
    });

    // Timer trigger callback
    this.timerTrigger.onTrigger(async (type) => {
      await this.processTrigger(type);
    });

    // Manual trigger callback
    this.manualTrigger.onTrigger(async (type, options) => {
      await this.processTrigger(type, options);
    });
  }

  private async processTrigger(
    type: TriggerType,
    options?: ManualTriggerOptions & { errors?: ErrorContext[] }
  ): Promise<EvolutionResult[]> {
    const results: EvolutionResult[] = [];

    try {
      // 1. Generate proposals
      const proposals = await this.generateProposals(type, options);

      // 2. Process each proposal
      for (const proposal of proposals) {
        const result = await this.processProposal(proposal, options?.reportOnly);
        results.push(result);

        if (result.success) {
          this.proposalsExecuted++;
        }
      }

      this.proposalsGenerated += proposals.length;

      // 3. Update effectiveness metrics
      await this.metricsAnalyzer.updateEvolutionEffectiveness();

    } catch (error) {
      this.api.log(
        `[Evolution] Error processing trigger: ${error instanceof Error ? error.message : 'Unknown'}`,
        'error'
      );
    }

    return results;
  }

  private async generateProposals(
    triggerType: TriggerType,
    options?: ManualTriggerOptions & { errors?: ErrorContext[] }
  ): Promise<EvolutionProposal[]> {
    const proposals: EvolutionProposal[] = [];

    // Run analyzers based on trigger type and options
    if (options?.fullAnalysis || triggerType === 'timer') {
      // Full analysis - run all analyzers
      const rootCause = await this.rootCauseAnalyzer.analyze();
      const framework = await this.frameworkAnalyzer.analyze();
      const metrics = await this.metricsAnalyzer.analyze();

      proposals.push(...rootCause.proposals, ...framework.proposals, ...metrics.proposals);
    } else if (options?.errors || triggerType === 'error') {
      // Error-driven - focus on root cause
      const rootCause = await this.rootCauseAnalyzer.analyze();
      proposals.push(...rootCause.proposals);
    }

    // Filter by target if specified
    if (options?.target) {
      return proposals.filter(p => p.target === options.target);
    }

    // Filter by type if specified
    if (options?.type) {
      return proposals.filter(p => p.type === options.type);
    }

    return proposals;
  }

  private async processProposal(
    proposal: EvolutionProposal,
    reportOnly?: boolean
  ): Promise<EvolutionResult> {
    // 1. Check path permissions
    const pathCheck = this.pathChecker.isAllowed(proposal.target);
    if (!pathCheck.allowed) {
      proposal.riskLevel = 'L3';
      const executor = this.executors.get('L3')!;
      return executor.execute(proposal);
    }

    // 2. Classify risk
    const classification = this.riskClassifier.classify(proposal);
    proposal.riskLevel = classification.level;

    // 3. If report-only mode, upgrade L0/L1 to L2
    if (reportOnly && (classification.level === 'L0' || classification.level === 'L1')) {
      proposal.riskLevel = 'L2';
    }

    // 4. Check rate limits
    const rateCheck = this.rateLimiter.canExecute(proposal.riskLevel);
    if (!rateCheck.allowed) {
      return {
        success: false,
        proposalId: proposal.id,
        action: proposal.riskLevel === 'L3' ? 'forbidden' : 'rejected',
        message: rateCheck.reason || 'Rate limit exceeded',
        rollbackAvailable: false,
      };
    }

    // 5. Execute via appropriate executor
    const executor = this.executors.get(proposal.riskLevel)!;
    const result = await executor.execute(proposal);

    // 6. Record execution for rate limiting
    if (result.action === 'executed') {
      await this.rateLimiter.recordExecution(proposal.riskLevel);
    }

    return result;
  }
}
