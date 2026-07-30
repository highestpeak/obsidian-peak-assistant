import type { LensEdgeData } from '@/core/types/lens-graph';
import type {
	AIGraphRelationFamily,
	AIGraphRelation,
} from './domain';

/**
 * Compiled domain defaults for canonicalizing the existing Lens edge vocabulary.
 * This is deliberately kept out of runtime logic so a future TemplateManager
 * config can replace the table without changing the artifact pipeline.
 */
const LENS_RELATION_DEFAULTS: Record<
	LensEdgeData['kind'],
	{
		family: AIGraphRelationFamily;
		predicate: string;
		directed: boolean;
	}
> = {
	link: { family: 'structural', predicate: 'links-to', directed: true },
	semantic: { family: 'semantic', predicate: 'related-to', directed: false },
	derives: { family: 'causal', predicate: 'derived-from', directed: true },
	temporal: { family: 'temporal', predicate: 'precedes', directed: true },
	'cross-domain': { family: 'structural', predicate: 'bridges', directed: false },
	builds_on: { family: 'semantic', predicate: 'builds-on', directed: true },
	contrasts: { family: 'semantic', predicate: 'contrasts-with', directed: false },
	complements: { family: 'semantic', predicate: 'complements', directed: false },
	applies: { family: 'semantic', predicate: 'applies', directed: true },
	references: { family: 'attribution', predicate: 'references', directed: true },
};

export function resolveLensRelationDefaults(
	edge: Pick<LensEdgeData, 'kind' | 'predicate' | 'relationFamily'> & {
		directionality?: 'directed' | 'undirected' | 'bidirectional';
	},
): Pick<AIGraphRelation, 'family' | 'predicate' | 'directed'> {
	const fallback = LENS_RELATION_DEFAULTS[edge.kind];
	return {
		family: edge.relationFamily ?? fallback.family,
		predicate: edge.predicate?.trim() || fallback.predicate,
		directed: edge.directionality
			? edge.directionality !== 'undirected'
			: fallback.directed,
	};
}

/** Compiled fallback mirrored by the natural-language update contract. */
const SELECTED_REMOVAL_PATTERN =
	/\b(?:delete|remove|drop|reject|split|merge|deduplicate|combine)\b|删除|移除|去掉|拒绝|拆分|合并|去重/i;

export function requestsSelectedAIGraphRemoval(instruction: string): boolean {
	return SELECTED_REMOVAL_PATTERN.test(instruction);
}
