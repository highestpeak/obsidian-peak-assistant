/**
 * T8 (2026-07-07 heading-mode integration): narrow port for the composed
 * heading-mode data bundle consumed by the React UI. The concrete
 * implementation is composed at the app layer
 * (`@/app/search/composeHeadingModeDeps`) and published on
 * `ServiceContext.headingMode`.
 *
 * Extracted from the app-layer compose module so `src/ui/` never imports
 * from `@/app/**` (boundary-baseline invariant `uiApp: 1`).
 */
import type {
	HeadingTreeInput,
	HeadingTreeNode,
} from '@/service/search/heading/headingTree';
import type { SectionSnippet } from '@/service/search/heading/sectionSnippets';

export interface HeadingModeDeps {
	extractHeadingTree(input: HeadingTreeInput): Promise<HeadingTreeNode[]>;
	getSectionSnippets(
		filePath: string,
		section: { lineStart: number; lineEnd: number },
		queryText: string,
	): Promise<SectionSnippet[]>;
	getLinkPositions(filePath: string): Promise<
		Array<{ line: number; target: string; kind: 'outgoing' | 'backlink' }>
	>;
}
