import type { AppContext } from '@/app/context/AppContext';
import { decodeIndexedTagsBlob } from '@/core/document/helper/TagService';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import {
	buildGraphNodeExplanationEvidence,
	GraphNodeExplanationService,
	type GraphNodeExplanationEvidence,
} from '@/service/search/community/GraphNodeExplanationService';
import { getConnectedLinks } from '@/service/search/inspectorService';
import { getIndexTenantForPath } from '@/service/search/index/indexService';
import {
	DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG,
	type ResultGraphCommunityConfig,
} from '@/service/search/index/helper/structural/ResultGraphCommunityDefaults';

type NodeExplanationConfig = ResultGraphCommunityConfig['nodeExplanation'];

export function composeGraphNodeExplanationPort(appContext: AppContext): GraphNodeExplanationService | null {
	const outputs = appContext.runtimeRegistry.tryGetGeneratedOutputPersistenceRuntime();
	if (!outputs) return null;
	const config = appContext.runtimeRegistry.tryGetIndexService()?.env.communityConfig?.nodeExplanation
		?? DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG.nodeExplanation;
	return new GraphNodeExplanationService(
		appContext.manager,
		outputs,
		{ read: (path) => readGraphNodeExplanationEvidence(path, config) },
		config,
	);
}

export async function readGraphNodeExplanationEvidence(
	path: string,
	config: NodeExplanationConfig = DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG.nodeExplanation,
): Promise<GraphNodeExplanationEvidence | null> {
	if (!path || !sqliteStoreManager.isInitialized()) return null;
	const tenant = getIndexTenantForPath(path);
	const row = await sqliteStoreManager.getMobiusNodeRepo(tenant).getByPath(path);
	if (!row) return null;
	const tags = decodeIndexedTagsBlob(row.tags_json);
	const signals = [
		...tags.topicTags,
		...(tags.userKeywordTags ?? tags.keywordTags),
		...(tags.textrankKeywordTerms ?? []),
	];
	const connected = await getConnectedLinks(path).catch(() => []);
	const representativeLinks = connected
		.slice()
		.sort((left, right) => (
			right.convergenceCount - left.convergenceCount
			|| left.label.localeCompare(right.label)
			|| left.path.localeCompare(right.path)
		))
		.slice(0, config.representativeLinkLimit)
		.map((link) => ({
			path: link.path,
			label: link.label,
			direction: link.direction === 'in' ? 'incoming' as const : 'outgoing' as const,
		}));
	const normalizedSignals = [...new Set(signals.map((signal) => signal.trim()).filter(Boolean))]
		.slice(0, config.signalLimit);
	return buildGraphNodeExplanationEvidence({
		path: row.path ?? path,
		title: row.label?.trim() || fallbackTitle(path),
		summary: row.summary ?? '',
		signals: normalizedSignals,
		incomingLinks: row.doc_incoming_cnt ?? 0,
		outgoingLinks: row.doc_outgoing_cnt ?? 0,
		representativeLinks,
	});
}

function fallbackTitle(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
}
