import type { MatchCondition } from '@/core/schemas/agents/pattern-discovery-schemas';
import type { VaultContext } from './ContextProvider';

// ─── StoredPattern ────────────────────────────────────────────────────────────

export interface StoredPattern {
	id: string;
	template: string;
	variables: string[]; // parsed from JSON string[] in DB
	conditions: MatchCondition; // parsed from JSON in DB
	source: string;
	confidence: number;
	usage_count: number;
	discovered_at: string;
	last_used_at: string | null;
	deprecated: number; // 0 | 1
}

// ─── MatchedSuggestion ────────────────────────────────────────────────────────

export interface MatchedSuggestion {
	patternId: string;
	filledTemplate: string;
	variables: string[];
	source: string;
	confidence: number;
	usageCount: number;
	contextType: 'activeDoc' | 'outlinks' | 'folder' | 'tags' | 'backlinks' | 'recent' | 'general';
	contextTags: string[];
}

// ─── Glob Folder Match ────────────────────────────────────────────────────────

function matchFolderGlob(pattern: string, folder: string): boolean {
	// Exact match
	if (!pattern.endsWith('/*') && !pattern.endsWith('/**')) {
		return pattern === folder;
	}

	if (pattern.endsWith('/**')) {
		// Recursive: folder must equal base OR start with base/
		const base = pattern.slice(0, -3);
		return folder === base || folder.startsWith(base + '/');
	}

	// pattern ends with /*: one level deep only
	const base = pattern.slice(0, -2);
	if (!folder.startsWith(base + '/')) return false;
	const remainder = folder.slice(base.length + 1);
	return !remainder.includes('/');
}

// ─── evaluateConditions ───────────────────────────────────────────────────────

export function evaluateConditions(conditions: MatchCondition, ctx: VaultContext): boolean {
	// always: true → short-circuit pass
	if (conditions.always === true) return true;

	if (conditions.hasActiveDocument !== undefined) {
		const pass = ctx.activeDocumentTitle !== null;
		if (conditions.hasActiveDocument !== pass) return false;
	}

	if (conditions.folderMatch !== undefined) {
		if (ctx.currentFolder === null) return false;
		if (!matchFolderGlob(conditions.folderMatch, ctx.currentFolder)) return false;
	}

	if (conditions.tagMatch !== undefined) {
		const tags = ctx.documentTags
			? ctx.documentTags.split(', ').map((t) => t.trim().toLowerCase())
			: [];
		if (conditions.tagMatch.length === 0) {
			// "has any tags"
			if (tags.length === 0) return false;
		} else {
			const required = conditions.tagMatch.map((t) => t.toLowerCase());
			const hasMatch = required.some((r) => tags.includes(r));
			if (!hasMatch) return false;
		}
	}

	if (conditions.hasOutgoingLinks !== undefined) {
		const has = ctx.outgoingLinks !== null;
		if (conditions.hasOutgoingLinks !== has) return false;
	}

	if (conditions.hasBacklinks !== undefined) {
		const has = ctx.backlinks !== null;
		if (conditions.hasBacklinks !== has) return false;
	}

	if (conditions.propertyMatch !== undefined) {
		if (ctx.frontmatterProperties === null) return false;
		const { key, value } = conditions.propertyMatch;
		if (value !== undefined) {
			// Must contain "key: value"
			const needle = `${key}: ${value}`;
			if (!ctx.frontmatterProperties.includes(needle)) return false;
		} else {
			// Must contain "key:"
			const needle = `${key}:`;
			if (!ctx.frontmatterProperties.includes(needle)) return false;
		}
	}

	if (conditions.keywordMatch !== undefined) {
		const keywords = ctx.documentKeywords
			? ctx.documentKeywords.split(', ').map((k) => k.trim().toLowerCase())
			: [];
		const required = conditions.keywordMatch.map((k) => k.toLowerCase());
		const hasMatch = required.some((r) => keywords.includes(r));
		if (!hasMatch) return false;
	}

	return true;
}

// ─── inferContextType ─────────────────────────────────────────────────────────

export function inferContextType(
	variables: string[],
): MatchedSuggestion['contextType'] {
	const set = new Set(variables);

	if (set.has('activeDocumentTitle') || set.has('activeDocumentPath') || set.has('firstHeading')) {
		return 'activeDoc';
	}
	if (set.has('outgoingLinks') || set.has('linkContext')) {
		return 'outlinks';
	}
	if (set.has('backlinks')) {
		return 'backlinks';
	}
	if (set.has('documentTags')) {
		return 'tags';
	}
	if (set.has('currentFolder') || set.has('recentFolders')) {
		return 'folder';
	}
	if (set.has('recentDocuments') || set.has('documentAge')) {
		return 'recent';
	}
	return 'general';
}

// ─── buildContextTags ─────────────────────────────────────────────────────────

export function buildContextTags(variables: string[], ctx: VaultContext): string[] {
	const tags: string[] = [];

	for (const v of variables) {
		switch (v) {
			case 'activeDocumentTitle':
				if (ctx.activeDocumentTitle) tags.push(`doc:${ctx.activeDocumentTitle}`);
				break;
			case 'currentFolder':
				if (ctx.currentFolder) tags.push(`folder:${ctx.currentFolder}`);
				break;
			case 'documentTags':
				if (ctx.documentTags) {
					const first = ctx.documentTags.split(', ')[0]?.trim();
					if (first) tags.push(`tag:${first}`);
				}
				break;
			case 'outgoingLinks':
				if (ctx.outgoingLinks) tags.push('has-outlinks');
				break;
			case 'backlinks':
				if (ctx.backlinks) tags.push('has-backlinks');
				break;
			case 'documentType':
				if (ctx.documentType) tags.push(`type:${ctx.documentType}`);
				break;
			case 'vaultName':
				if (ctx.vaultName) tags.push(`vault:${ctx.vaultName}`);
				break;
			default:
				break;
		}
	}

	return tags;
}

// ─── fillTemplate ─────────────────────────────────────────────────────────────

/**
 * Replace {variableName} placeholders in template with values from ctx.
 * Returns null if any variable is unresolvable (null in ctx).
 */
function fillTemplate(
	template: string,
	variables: string[],
	ctx: VaultContext,
): string | null {
	let result = template;
	for (const varName of variables) {
		const placeholder = `{${varName}}`;
		if (!template.includes(placeholder)) continue;
		const value = (ctx as Record<string, string | null>)[varName];
		if (value === null || value === undefined) return null;
		result = result.split(placeholder).join(value);
	}
	return result;
}

// ─── matchPatterns ────────────────────────────────────────────────────────────

export function matchPatterns(
	patterns: StoredPattern[],
	ctx: VaultContext,
	limit = 6,
): MatchedSuggestion[] {
	const results: MatchedSuggestion[] = [];

	for (const pattern of patterns) {
		if (pattern.deprecated === 1) continue;
		if (!evaluateConditions(pattern.conditions, ctx)) continue;

		const filled = fillTemplate(pattern.template, pattern.variables, ctx);
		if (filled === null) continue; // unresolvable variable

		const contextType = inferContextType(pattern.variables);
		const contextTags = buildContextTags(pattern.variables, ctx);

		results.push({
			patternId: pattern.id,
			filledTemplate: filled,
			variables: pattern.variables,
			source: pattern.source,
			confidence: pattern.confidence,
			usageCount: pattern.usage_count,
			contextType,
			contextTags,
		});
	}

	// Sort by usageCount descending
	results.sort((a, b) => b.usageCount - a.usageCount);

	return results.slice(0, limit);
}
