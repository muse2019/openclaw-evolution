/**
 * Metrics Analyzer
 * Analyzes effectiveness metrics to identify improvement opportunities
 */

import { EvolutionProposal, AnalysisResult, EffectivenessMetrics } from '../types.js';
import { MetricsStore, EvolutionLog } from '../storage/index.js';

export class MetricsAnalyzer {
  private metricsStore: MetricsStore;
  private evolutionLog: EvolutionLog;

  constructor(metricsStore: MetricsStore, evolutionLog: EvolutionLog) {
    this.metricsStore = metricsStore;
    this.evolutionLog = evolutionLog;
  }

  /**
   * Analyze metrics for improvement opportunities
   */
  async analyze(): Promise<AnalysisResult> {
    const proposals: EvolutionProposal[] = [];
    const insights: string[] = [];

    // Get aggregated metrics
    const dailyMetrics = this.metricsStore.getAggregated('day');
    const weeklyMetrics = this.metricsStore.getAggregated('week');

    insights.push(`Daily success rate: ${(dailyMetrics.successRate * 100).toFixed(1)}%`);
    insights.push(`Weekly success rate: ${(weeklyMetrics.successRate * 100).toFixed(1)}%`);

    // Check for degrading skills
    const trending = this.metricsStore.getTrending();

    if (trending.degrading.length > 0) {
      insights.push(`Skills degrading: ${trending.degrading.join(', ')}`);

      for (const skill of trending.degrading) {
        proposals.push({
          id: `evo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          type: 'skill',
          target: skill,
          change: `Investigate and fix degradation in skill: ${skill}`,
          reasoning: `Skill "${skill}" is showing increased error rate`,
          status: 'pending',
          source: 'timer',
        });
      }
    }

    if (trending.improving.length > 0) {
      insights.push(`Skills improving: ${trending.improving.join(', ')}`);
    }

    // Analyze evolution effectiveness
    const evolutionStats = this.evolutionLog.getStats();
    if (evolutionStats.rolledBack > 0) {
      const rollbackRate = evolutionStats.rolledBack / evolutionStats.total;
      if (rollbackRate > 0.2) {
        proposals.push({
          id: `evo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
          type: 'framework',
          target: 'evolution-engine',
          change: 'Review evolution classification rules - high rollback rate',
          reasoning: `${(rollbackRate * 100).toFixed(1)}% of evolutions were rolled back`,
          status: 'pending',
          source: 'timer',
        });
      }
    }

    // Check for low-performing skills
    for (const [skill, stats] of Object.entries(dailyMetrics.bySkill)) {
      const total = stats.success + stats.error;
      if (total >= 5) {
        const errorRate = stats.error / total;
        if (errorRate > 0.3) {
          proposals.push({
            id: `evo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
            type: 'skill',
            target: skill,
            change: `Improve skill: ${skill} (high error rate: ${(errorRate * 100).toFixed(1)}%)`,
            reasoning: `Skill "${skill}" has ${(errorRate * 100).toFixed(1)}% error rate over ${total} executions`,
            status: 'pending',
            source: 'timer',
          });
        }
      }
    }

    return {
      proposals,
      patterns: [],
      insights,
      confidence: 0.8,
    };
  }

  /**
   * Get effectiveness metrics for a specific evolution
   */
  getEvolutionEffectiveness(evolutionId: string, periodDays: number = 7): EffectivenessMetrics | null {
    const record = this.evolutionLog.getById(evolutionId);
    if (!record) return null;

    const afterStart = new Date(record.timestamp);
    const afterEnd = new Date(afterStart.getTime() + periodDays * 24 * 60 * 60 * 1000);
    const beforeStart = new Date(afterStart.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const beforeEnd = afterStart;

    return this.metricsStore.getEffectivenessMetrics(
      beforeStart,
      beforeEnd,
      afterStart,
      afterEnd
    );
  }

  /**
   * Update effectiveness for all recent evolutions
   */
  async updateEvolutionEffectiveness(): Promise<void> {
    const recentEvolutions = this.evolutionLog.getActive().slice(0, 10);

    for (const record of recentEvolutions) {
      if (!record.effectiveness) {
        const metrics = this.getEvolutionEffectiveness(record.id);
        if (metrics) {
          await this.evolutionLog.updateEffectiveness(record.id, metrics);
        }
      }
    }
  }
}
