import type { SearchResultItem } from '@/core/search/searchTypes';
import {
	buildRelatedSnapshot,
	type BriefThought,
	type ComposerRelatedMaterialSnapshot,
} from '@/service/composer';
import type { SidecarConfig } from './sidecarConfig';

export interface SidecarPreviewFixtureProjection {
	related: ComposerRelatedMaterialSnapshot;
	thoughts: readonly BriefThought[];
}

/**
 * Build explicitly-labelled visual QA data for the configured acceptance file.
 * This never participates in search, persistence, receipts, or document writes.
 */
export function resolveSidecarPreviewFixture(
	filePath: string | undefined,
	config: SidecarConfig,
	focus: { anchorId: string; documentId: string },
): SidecarPreviewFixtureProjection | null {
	const fileName = fileNameOf(filePath ?? '');
	if (!config.previewFixture.fileNames.includes(fileName)) return null;
	const items: SearchResultItem[] = config.previewFixture.materials.map((material) => ({
		id: material.id,
		type: 'markdown',
		title: material.title,
		path: material.path,
		lastModified: 0,
		content: material.content,
		finalScore: material.score,
		source: 'local',
	}));
	const reasonBySourceId = Object.fromEntries(
		config.previewFixture.materials.map((material) => [material.id, material.reason]),
	);
	return {
		related: buildRelatedSnapshot({
			focus: { anchorId: focus.anchorId, rootNodeId: focus.documentId },
			revision: 'design-preview',
			items,
			graphNodeCap: config.graphNodeCap,
			reasonBySourceId,
		}),
		thoughts: config.previewFixture.thoughts.map((thought) => ({
			thoughtId: thought.id,
			runId: 'design-preview',
			insightId: thought.id,
			label: thought.label,
			detail: thought.detail,
			state: 'active',
		})),
	};
}

function fileNameOf(filePath: string): string {
	const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
	return filePath.slice(slash + 1);
}
