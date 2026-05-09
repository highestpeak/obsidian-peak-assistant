import type { RetrieverResult } from '@/service/search/retriever/types';
import type { RetrieverWeights } from '@/service/search/query/query-parser';

const RRF_K = 60;

export type MergedResult = {
  path: string;
  rrfScore: number;
  best: RetrieverResult;
  sources: Set<string>;
};

export function rrfMerge(
  retrieverResults: Map<string, RetrieverResult[]>,
  weights: RetrieverWeights,
): MergedResult[] {
  const byPath = new Map<string, MergedResult>();

  for (const [retrieverName, results] of retrieverResults) {
    const w = (weights as Record<string, number>)[retrieverName] ?? 0.5;
    for (let rank = 0; rank < results.length; rank++) {
      const r = results[rank];
      const rrfContribution = w / (RRF_K + rank + 1);

      const existing = byPath.get(r.path);
      if (existing) {
        existing.rrfScore += rrfContribution;
        existing.sources.add(retrieverName);
        if (r.score > existing.best.score) existing.best = r;
      } else {
        byPath.set(r.path, {
          path: r.path,
          rrfScore: rrfContribution,
          best: r,
          sources: new Set([retrieverName]),
        });
      }
    }
  }

  return Array.from(byPath.values()).sort((a, b) => b.rrfScore - a.rrfScore);
}
