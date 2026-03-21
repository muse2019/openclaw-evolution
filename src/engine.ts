/**
 * Evolution Engine
 * Core orchestrator for the evolution process
 * Refactored to use real OpenClaw Plugin API
 */

import {
  EvolutionProposal,
  EvolutionResult,
  RiskLevel,
  TriggerType,
  ErrorContext,
  EngineStatus,
  EvolutionConfig,
} from './types.js';

import { ErrorLog, EvolutionLog, MetricsStore, FeedbackStore, FeedbackEntry } from './storage/index.js';
import { RiskClassifier } from './classifiers/index.js';
import { PathChecker, RateLimiter, RollbackManager } from './safety/index.js';
import { RootCauseAnalyzer, FrameworkAnalyzer, MetricsAnalyzer, FeedbackAnalyzer, FeedbackAnalysisResult } from './analyzers/index.js';
import { AutoExecutor, AskExecutor, SuggestExecutor, ForbiddenExecutor, Executor, EvolutionExecutor } from './executors/index.js';
import { ErrorTrigger, TimerTrigger, ManualTrigger, ManualTriggerOptions, FeedbackTrigger } from './triggers/index.js';

export interface EvolutionEngineConfig {
  dataDir: string;
  openclawDir: string;
  workspaceDir: string;
  config: EvolutionConfig;
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

  // Feedback-driven evolution
  private feedbackStore: FeedbackStore;
  private feedbackTrigger: FeedbackTrigger;
  private evolutionExecutor: EvolutionExecutor;

  // State
  private api: { logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void } };
  private config: EvolutionConfig;
  private running: boolean = false;
  private proposalsGenerated: number = 0;
  private proposalsExecuted: number = 0;
  private proposalsRolledBack: number = 0;

  constructor(
    api: { logger: { info: (msg: string) => void; warn: (msg: string) => void; error: (msg: string) => void } },
    engineConfig: EvolutionEngineConfig
  ) {
    this.api = api;
    this.config = engineConfig.config;

    // Initialize storage
    this.errorLog = new ErrorLog(engineConfig.dataDir);
    this.evolutionLog = new EvolutionLog(engineConfig.dataDir);
    this.metricsStore = new MetricsStore(engineConfig.dataDir);

    // Initialize safety
    this.pathChecker = new PathChecker();
    this.rateLimiter = new RateLimiter(engineConfig.dataDir);
    this.rollbackManager = new RollbackManager(this.evolutionLog);

    // Initialize analyzers
    this.rootCauseAnalyzer = new RootCauseAnalyzer(this.errorLog);
    this.frameworkAnalyzer = new FrameworkAnalyzer(engineConfig.openclawDir);
    this.metricsAnalyzer = new MetricsAnalyzer(this.metricsStore, this.evolutionLog);

    // Initialize classifier
    this.riskClassifier = new RiskClassifier();

    // Initialize executors with dataDir for fs operations
    this.executors = new Map();
    this.executors.set('auto', new AutoExecutor(engineConfig.dataDir, this.evolutionLog));
    this.executors.set('ask', new AskExecutor(engineConfig.dataDir, this.evolutionLog));
    this.executors.set('forbid', new ForbiddenExecutor(engineConfig.dataDir));

    // Initialize triggers
    this.errorTrigger = new ErrorTrigger(this.errorLog);
    this.timerTrigger = new TimerTrigger();
    this.manualTrigger = new ManualTrigger();

    // Initialize feedback-driven evolution components
    this.feedbackStore = new FeedbackStore(engineConfig.dataDir);

    // Initialize EvolutionExecutor
    const executorConfig = {
      workspaceDir: engineConfig.workspaceDir,
      allowedPaths: engineConfig.config.paths.allowlist,
      blockedPaths: engineConfig.config.paths.blocklist,
      maxRetries: 3,
      buildCommand: 'npm run build',
    };
    this.evolutionExecutor = new EvolutionExecutor(executorConfig);

    // Initialize FeedbackTrigger
    const feedbackTriggerConfig = {
      feedbackStore: this.feedbackStore,
      threshold: engineConfig.config.feedbackThreshold ?? 3,
      cooldownHours: engineConfig.config.feedbackCooldownHours ?? 6,
    };
    this.feedbackTrigger = new FeedbackTrigger(feedbackTriggerConfig);

    // Subscribe to feedback trigger
    this.feedbackTrigger.onTrigger(async (entries) => {
      const analyzer = new FeedbackAnalyzer();
      const analysis = analyzer.analyze(entries);
      await this.runFeedbackEvolution(analysis);
    });

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
    this.api.logger.info('[Evolution] Engine started');

    // Periodic feedback check - every hour
    setInterval(() => {
      this.feedbackTrigger.check();
    }, 60 * 60 * 1000);
  }

  /**
   * Stop the evolution engine
   */
  stop(): void {
    this.running = false;
    this.timerTrigger.stop();
    this.api.logger.info('[Evolution] Engine stopped');
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
    // Record error for metrics
    await this.metricsStore.recordError(error.toolName, {
      type: error.errorType,
      message: error.errorMessage,
    });

    // Log the error
    await this.errorLog.log(error);

    // Check if error trigger should fire
    return this.errorTrigger.recordError(error);
  }

  /**
   * Record session end (for metrics)
   */
  async recordSessionEnd(sessionId: string): Promise<void> {
    await this.metricsStore.recordSessionEnd(sessionId);
  }

  /**
   * Rollback an evolution
   */
  async rollback(evolutionId: string, reason: string): Promise<boolean> {
    const result = await this.rollbackManager.rollback(evolutionId, reason);
    if (result.success) {
      this.proposalsRolledBack++;
      this.api.logger.info(`[Evolution] Rolled back ${evolutionId}: ${reason}`);
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
    // Check if evolution is enabled
    if (!this.config.enabled) {
      this.api.logger.info('[Evolution] Plugin is disabled (enabled=false). Skipping.');
      return [];
    }

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
      this.api.logger.error(
        `[Evolution] Error processing trigger: ${error instanceof Error ? error.message : 'Unknown'}`
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
      proposal.riskLevel = 'forbid';
      const executor = this.executors.get('forbid')!;
      return executor.execute(proposal);
    }

    // 2. Classify risk
    const classification = this.riskClassifier.classify(proposal);
    proposal.riskLevel = classification.level;

    // 3. If report-only mode, upgrade auto/ask to forbid
    if (reportOnly && (classification.level === 'auto' || classification.level === 'ask')) {
      proposal.riskLevel = 'forbid';
    }

    // 4. Check rate limits
    const rateCheck = this.rateLimiter.canExecute(proposal.riskLevel);
    if (!rateCheck.allowed) {
      return {
        success: false,
        proposalId: proposal.id,
        action: proposal.riskLevel === 'forbid' ? 'forbidden' : 'rejected',
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

    // 7. Record success for metrics tracking
    if (result.success) {
      await this.metricsStore.recordSuccess(proposal.type);
    }

    return result;
  }

  private async runFeedbackEvolution(analysis: FeedbackAnalysisResult): Promise<void> {
    for (const insight of analysis.insights) {
      const result = await this.evolutionExecutor.executeFeedbackImprovement({
        negativeFeedback: insight.examples,
        targetSkill: insight.pattern,
      });
      
      if (result.success) {
        this.api.logger.info(`[Evolution] Feedback-driven evolution completed for pattern: ${insight.pattern}`);
        this.proposalsExecuted++;
      } else {
        this.api.logger.error(`[Evolution] Feedback-driven evolution failed for pattern: ${insight.pattern} - ${result.error}`);
      }
    }
  }
}
