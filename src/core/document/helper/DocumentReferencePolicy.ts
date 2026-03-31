import type { DocumentType } from '@/core/document/types';
import { getAIHubSummaryFolder } from '@/app/settings/types';
import { isVaultPathUnderPrefix } from '@/core/utils/hub-path-utils';
import { GraphNodeType } from '@/core/po/graph.po';

/**
 * Internal policy: which {@link DocumentType} values count as doc-to-doc outgoing references
 * for Mobius `doc_outgoing_cnt` / `docOutgoing` on reference edges. Not user-configurable.
 */
export const DOC_OUTGOING_TARGET_TYPES: readonly DocumentType[] = [
	'markdown',
	'excalidraw',
	'canvas',
	'dataloom',
	'pdf',
] as const;

const DOC_OUTGOING_TARGET_TYPE_SET = new Set<DocumentType>(DOC_OUTGOING_TARGET_TYPES);

/**
 * True when a resolved vault path type should increment doc-side reference stats (vs resource).
 */
export function countsAsDocOutgoingTarget(docType: DocumentType | null | undefined): boolean {
	return !!docType && DOC_OUTGOING_TARGET_TYPE_SET.has(docType);
}

/**
 * Mobius graph node type for a reference target that is not yet a full indexed row (placeholder).
 * Hub-summary paths use {@link GraphNodeType.HubDoc}; note-like types use {@link GraphNodeType.Document};
 * attachments and other types use {@link GraphNodeType.Resource}.
 */
export function graphNodeTypeForPlaceholderReferenceTarget(
	fullPath: string,
	docType: DocumentType | null,
): GraphNodeType {
	const hub = getAIHubSummaryFolder();
	if (hub && isVaultPathUnderPrefix(fullPath, hub) && countsAsDocOutgoingTarget(docType)) {
		return GraphNodeType.HubDoc;
	}
	if (countsAsDocOutgoingTarget(docType)) return GraphNodeType.Document;
	return GraphNodeType.Resource;
}
