import type { QueryPlan } from '@/service/search/query/query-parser';
import type { SearchRetriever, RetrieverResult } from './types';

export class RetrieverRegistry {
  private retrievers: SearchRetriever[] = [];

  register(retriever: SearchRetriever): void {
    this.retrievers.push(retriever);
  }

  async executeAll(
    plan: QueryPlan,
    exclude?: Set<string>,
  ): Promise<Map<string, RetrieverResult[]>> {
    const active = this.retrievers.filter(r => {
      if (exclude?.has(r.name)) return false;
      return r.shouldActivate(plan);
    });

    const entries = await Promise.all(
      active.map(async (r) => {
        try {
          const results = await r.retrieve(plan);
          return [r.name, results] as const;
        } catch (error) {
          console.error(`[RetrieverRegistry] ${r.name} failed:`, error);
          return [r.name, []] as const;
        }
      }),
    );

    return new Map(entries);
  }

  getRegistered(): readonly SearchRetriever[] {
    return this.retrievers;
  }
}
