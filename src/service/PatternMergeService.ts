import type { PatternDiscoveryOutput } from '@/core/schemas/agents/pattern-discovery-schemas';
import type { QueryPatternRepo } from '@/core/storage/sqlite/repositories/QueryPatternRepo';

/**
 * Replace all `{variableName}` placeholders with `{}` for dedup comparison.
 */
export function normalizeTemplate(template: string): string {
	return template.replace(/\{[^}]+\}/g, '{}');
}

/**
 * Case-insensitive exact match of normalized templates.
 */
export function isDuplicate(a: string, b: string): boolean {
	return normalizeTemplate(a).toLowerCase() === normalizeTemplate(b).toLowerCase();
}

/**
 * Merge agent-discovered patterns into the repo.
 *
 * - Skips new patterns whose normalized template already exists in the repo.
 * - Inserts fresh patterns with source='discovered'.
 * - Deprecates patterns listed in output.deprecateIds.
 * - Auto-deprecates stale discovered patterns unused for 30 days.
 */
export async function mergeDiscoveredPatterns(
	repo: QueryPatternRepo,
	output: PatternDiscoveryOutput,
): Promise<{ inserted: number; deprecated: number }> {
	const existing = await repo.listAll();
	const existingNormalized = existing.map((p) => normalizeTemplate(p.template));

	let inserted = 0;
	let deprecated = 0;

	for (const newPattern of output.newPatterns) {
		const normalizedNew = normalizeTemplate(newPattern.template);
		const duplicate = existingNormalized.some(
			(n) => n.toLowerCase() === normalizedNew.toLowerCase(),
		);
		if (duplicate) continue;

		const id = 'disc-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
		await repo.insert({
			id,
			template: newPattern.template,
			variables: JSON.stringify(newPattern.variables),
			conditions: JSON.stringify(newPattern.conditions),
			source: 'discovered',
			confidence: newPattern.confidence,
			usage_count: 0,
			discovered_at: Date.now(),
			last_used_at: null,
			deprecated: 0,
		});

		// Track for subsequent dedup within this batch
		existingNormalized.push(normalizedNew);
		inserted++;
	}

	for (const id of output.deprecateIds) {
		await repo.deprecate(id);
		deprecated++;
	}

	await repo.deprecateStale(30);

	return { inserted, deprecated };
}
