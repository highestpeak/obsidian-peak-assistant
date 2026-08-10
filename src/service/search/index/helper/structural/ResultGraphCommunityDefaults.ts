import type { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';

export interface ResultGraphCommunityConfig {
	analysisVersion: number;
	weights: {
		reference: number;
		explicitTagIdf: number;
		textRankTermIdf: number;
		semanticSimilarity: number;
		maxPairWeight: number;
	};
	bounds: {
		exactCentralityNodeLimit: number;
		communityNodeLimit: number;
		maxNeighborsPerNode: number;
		maxSignalsPerDocument: number;
		maxDocumentsPerSignal: number;
		maxPairsPerSignal: number;
		minimumSignalSupport: number;
		maximumSignalDocumentRatio: number;
		descriptorLimit: number;
	};
	interaction: {
		openDelayMs: number;
		closeDelayMs: number;
		cardOffsetPx: number;
	};
	nodeExplanation: {
		summaryCharacterLimit: number;
		signalLimit: number;
		representativeLinkLimit: number;
		ui: {
			title: string;
			evidenceChanged: string;
			loadingSaved: string;
			readingEvidence: string;
			previousSavedPrefix: string;
			evidenceUnavailable: string;
			explain: string;
			regenerate: string;
		};
	};
}

/** Compiled fallback mirrors templates/config/result-graph-community.json. */
export const DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG: ResultGraphCommunityConfig = Object.freeze({
	analysisVersion: 2,
	weights: Object.freeze({
		reference: 1,
		explicitTagIdf: 0.42,
		textRankTermIdf: 0.18,
		semanticSimilarity: 0.16,
		maxPairWeight: 3,
	}),
	bounds: Object.freeze({
		exactCentralityNodeLimit: 4000,
		communityNodeLimit: 12000,
		maxNeighborsPerNode: 36,
		maxSignalsPerDocument: 20,
		maxDocumentsPerSignal: 80,
		maxPairsPerSignal: 1200,
		minimumSignalSupport: 2,
		maximumSignalDocumentRatio: 0.22,
		descriptorLimit: 3,
	}),
	interaction: Object.freeze({
		openDelayMs: 80,
		closeDelayMs: 220,
		cardOffsetPx: 18,
	}),
	nodeExplanation: Object.freeze({
		summaryCharacterLimit: 1600,
		signalLimit: 8,
		representativeLinkLimit: 8,
		ui: Object.freeze({
			title: 'AI graph explanation',
			evidenceChanged: 'Evidence changed',
			loadingSaved: 'Loading saved explanation…',
			readingEvidence: 'Reading the current node evidence…',
			previousSavedPrefix: 'Previous saved explanation:',
			evidenceUnavailable: 'Indexed graph evidence is unavailable for this note.',
			explain: 'Explain with AI',
			regenerate: 'Regenerate',
		}),
	}),
});

export async function loadResultGraphCommunityConfig(
	templateManager?: TemplateManager | null,
): Promise<ResultGraphCommunityConfig> {
	if (!templateManager) return DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG;
	try {
		const loaded = await templateManager.loadJson<Partial<ResultGraphCommunityConfig>>(
			ConfigTemplateId.ResultGraphCommunity,
		);
		return mergeConfig(loaded);
	} catch (error) {
		console.warn('[result-graph-community] Invalid config; using compiled fallback.', error);
		return DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG;
	}
}

function positive(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function ratio(value: unknown, fallback: number): number {
	const parsed = positive(value, fallback);
	return Math.min(1, parsed);
}

function mergeConfig(loaded: Partial<ResultGraphCommunityConfig>): ResultGraphCommunityConfig {
	const fallback = DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG;
	const weights = loaded.weights ?? fallback.weights;
	const bounds = loaded.bounds ?? fallback.bounds;
	const interaction = loaded.interaction ?? fallback.interaction;
	const nodeExplanation = loaded.nodeExplanation ?? fallback.nodeExplanation;
	const nodeExplanationUi = nodeExplanation.ui ?? fallback.nodeExplanation.ui;
	return {
		analysisVersion: Math.floor(positive(loaded.analysisVersion, fallback.analysisVersion)),
		weights: {
			reference: positive(weights.reference, fallback.weights.reference),
			explicitTagIdf: positive(weights.explicitTagIdf, fallback.weights.explicitTagIdf),
			textRankTermIdf: positive(weights.textRankTermIdf, fallback.weights.textRankTermIdf),
			semanticSimilarity: positive(weights.semanticSimilarity, fallback.weights.semanticSimilarity),
			maxPairWeight: positive(weights.maxPairWeight, fallback.weights.maxPairWeight),
		},
		bounds: {
			exactCentralityNodeLimit: Math.floor(positive(bounds.exactCentralityNodeLimit, fallback.bounds.exactCentralityNodeLimit)),
			communityNodeLimit: Math.floor(positive(bounds.communityNodeLimit, fallback.bounds.communityNodeLimit)),
			maxNeighborsPerNode: Math.floor(positive(bounds.maxNeighborsPerNode, fallback.bounds.maxNeighborsPerNode)),
			maxSignalsPerDocument: Math.floor(positive(bounds.maxSignalsPerDocument, fallback.bounds.maxSignalsPerDocument)),
			maxDocumentsPerSignal: Math.floor(positive(bounds.maxDocumentsPerSignal, fallback.bounds.maxDocumentsPerSignal)),
			maxPairsPerSignal: Math.floor(positive(bounds.maxPairsPerSignal, fallback.bounds.maxPairsPerSignal)),
			minimumSignalSupport: Math.floor(positive(bounds.minimumSignalSupport, fallback.bounds.minimumSignalSupport)),
			maximumSignalDocumentRatio: ratio(bounds.maximumSignalDocumentRatio, fallback.bounds.maximumSignalDocumentRatio),
			descriptorLimit: Math.floor(positive(bounds.descriptorLimit, fallback.bounds.descriptorLimit)),
		},
		interaction: {
			openDelayMs: Math.floor(positive(interaction.openDelayMs, fallback.interaction.openDelayMs)),
			closeDelayMs: Math.floor(positive(interaction.closeDelayMs, fallback.interaction.closeDelayMs)),
			cardOffsetPx: Math.floor(positive(interaction.cardOffsetPx, fallback.interaction.cardOffsetPx)),
		},
		nodeExplanation: {
			summaryCharacterLimit: Math.floor(positive(nodeExplanation.summaryCharacterLimit, fallback.nodeExplanation.summaryCharacterLimit)),
			signalLimit: Math.floor(positive(nodeExplanation.signalLimit, fallback.nodeExplanation.signalLimit)),
			representativeLinkLimit: Math.floor(positive(nodeExplanation.representativeLinkLimit, fallback.nodeExplanation.representativeLinkLimit)),
			ui: {
				...fallback.nodeExplanation.ui,
				...nodeExplanationUi,
			},
		},
	};
}
