/**
 * Base Executor Interface
 */

import { RiskLevel, EvolutionProposal, EvolutionResult } from '../types.js';

export interface Executor {
  canHandle(level: RiskLevel): boolean;
  execute(proposal: EvolutionProposal): Promise<EvolutionResult>;
}
