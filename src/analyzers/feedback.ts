import { FeedbackEntry } from '../storage/index.js';

export interface FeedbackInsight {
  pattern: string;
  count: number;
  examples: string[];
  suggestedAction: string;
}

export interface FeedbackAnalysisResult {
  insights: FeedbackInsight[];
  dominantTopics: string[];
  recommendedSkills: string[];
}

export class FeedbackAnalyzer {
  analyze(entries: FeedbackEntry[]): FeedbackAnalysisResult {
    // 按 skill 分组
    const bySkill = this.groupBySkill(entries);
    // 识别模式
    const insights = this.extractPatterns(entries);
    // 提取高频 topic
    const dominantTopics = this.extractTopics(entries);
    // 推荐改进的 skill
    const recommendedSkills = this.extractSkillRecommendations(bySkill);

    return {
      insights,
      dominantTopics,
      recommendedSkills,
    };
  }

  private groupBySkill(entries: FeedbackEntry[]): Map<string, FeedbackEntry[]> {
    const map = new Map<string, FeedbackEntry[]>();
    for (const entry of entries) {
      const skill = entry.context.skill || 'unknown';
      if (!map.has(skill)) map.set(skill, []);
      map.get(skill)!.push(entry);
    }
    return map;
  }

  private extractPatterns(entries: FeedbackEntry[]): FeedbackInsight[] {
    const insights: FeedbackInsight[] = [];
    const patternMap = new Map<string, FeedbackEntry[]>();

    for (const entry of entries) {
      const msg = entry.message.toLowerCase();
      let pattern = 'general';
      
      if (msg.includes('慢') || msg.includes('久')) pattern = 'too_slow';
      else if (msg.includes('错') || msg.includes('不对')) pattern = 'incorrect';
      else if (msg.includes('不') || msg.includes('没') || msg.includes('无')) pattern = 'missing';
      else if (msg.includes('崩') || msg.includes('坏')) pattern = 'broken';
      else if (msg.includes('难') || msg.includes('不懂')) pattern = 'unclear';

      if (!patternMap.has(pattern)) patternMap.set(pattern, []);
      patternMap.get(pattern)!.push(entry);
    }

    const patternLabels: Record<string, string> = {
      too_slow: 'Response too slow',
      incorrect: 'Incorrect response',
      missing: 'Missing information',
      broken: 'Crashes or errors',
      unclear: 'Unclear or confusing',
      general: 'General complaint',
    };

    const patternActions: Record<string, string> = {
      too_slow: 'Optimize the skill instructions for faster execution',
      incorrect: 'Review and fix the logic in the skill',
      missing: 'Add missing information or capabilities to the skill',
      broken: 'Fix the error handling and edge cases',
      unclear: 'Improve clarity and specificity of instructions',
      general: 'Review the overall approach and quality',
    };

    for (const [pattern, entries] of patternMap) {
      insights.push({
        pattern,
        count: entries.length,
        examples: entries.slice(0, 3).map(e => e.message),
        suggestedAction: patternActions[pattern] || patternActions.general,
      });
    }

    return insights.sort((a, b) => b.count - a.count);
  }

  private extractTopics(entries: FeedbackEntry[]): string[] {
    const wordCounts = new Map<string, number>();
    const stopWords = new Set(['的', '了', '是', '在', '我', '你', '他', '这', '那', '和', '也', '都', '有', '没有', '不']);

    for (const entry of entries) {
      const words = entry.message.replace(/[^\w\s]/g, '').split(/\s+/);
      for (const word of words) {
        if (word.length >= 2 && !stopWords.has(word)) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      }
    }

    return Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  private extractSkillRecommendations(
    bySkill: Map<string, FeedbackEntry[]>
  ): string[] {
    return Array.from(bySkill.entries())
      .filter(([skill, entries]) => skill !== 'unknown' && entries.length >= 2)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3)
      .map(([skill]) => skill);
  }
}
