import type { ComposerBlock, ComposerDocumentSnapshot } from '@/core/composer';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import type { AtlasQuickAction } from '@/ui/view/file-atlas/FileAtlasHostPort';

const FILE_ATLAS_ACTION_ALIASES = new Map<string, string>([
	['composer.prose.polish-block', 'composer.prose.polish'],
]);

function normalizedActionTitle(title: string): string {
	return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/**
 * Present one user-facing action for one intent. Composer retains compatibility
 * capability IDs, but those aliases must not become duplicate Inspector buttons.
 */
export function projectFileAtlasQuickActions(
	actions: AtlasQuickAction[],
): AtlasQuickAction[] {
	const capabilityIds = new Set(actions.map((action) => action.capabilityId));
	const seenTitles = new Set<string>();
	return actions.filter((action) => {
		const canonicalId = FILE_ATLAS_ACTION_ALIASES.get(action.capabilityId);
		if (canonicalId && capabilityIds.has(canonicalId as AtlasQuickAction['capabilityId'])) {
			return false;
		}
		const title = normalizedActionTitle(action.title);
		if (seenTitles.has(title)) return false;
		seenTitles.add(title);
		return true;
	});
}

function overlapSize(
	left: { from: number; to: number },
	right: { from: number; to: number },
): number {
	return Math.max(0, Math.min(left.to, right.to) - Math.max(left.from, right.from));
}

/**
 * Resolve an independently parsed Atlas element to the owning top-level
 * Composer block. Resource rows can be smaller than their Markdown paragraph,
 * so exact containment wins before overlap size and span length.
 */
export function composerBlockForAtlasLocation(
	snapshot: ComposerDocumentSnapshot,
	location: DocumentSourceLocation,
): ComposerBlock | null {
	const fallback = snapshot.blocks.find((block) => {
		const line = snapshot.sourceText.slice(0, block.source.from).split('\n').length - 1;
		return line === location.line;
	}) ?? null;
	if (location.from === undefined) return fallback;
	const target = {
		from: location.from,
		to: Math.max(location.from + 1, location.to ?? location.from + 1),
	};
	const candidates = snapshot.blocks
		.map((block) => {
			const range = { from: block.source.from, to: block.source.to };
			return {
				block,
				contains: range.from <= target.from && range.to >= target.to,
				overlap: overlapSize(range, target),
				span: range.to - range.from,
			};
		})
		.filter((candidate) => candidate.contains || candidate.overlap > 0)
		.sort((left, right) =>
			Number(right.contains) - Number(left.contains)
			|| right.overlap - left.overlap
			|| left.span - right.span,
		);
	return candidates[0]?.block ?? fallback;
}
