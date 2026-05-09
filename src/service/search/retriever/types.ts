import type { ChunkType } from '@/service/search/index/chunkTypes';
import type { QueryPlan } from '@/service/search/query/query-parser';

export type MatchType = 'exact' | 'stem' | 'semantic' | 'fuzzy' | 'meta';

export type RetrieverResult = {
  path: string;
  docId?: string;
  score: number;
  title?: string;
  content?: string;
  contentRaw?: string;
  chunkType?: ChunkType;
  matchType: MatchType;
  source: string;
  fuzzyCorrection?: string;
  lastModified?: number;
  type?: string;
};

export interface SearchRetriever {
  readonly name: string;
  shouldActivate(plan: QueryPlan): boolean;
  retrieve(plan: QueryPlan): Promise<RetrieverResult[]>;
}
