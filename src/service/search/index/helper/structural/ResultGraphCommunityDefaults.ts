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
		inspectKey: string;
		ui: {
			communityUnavailable: string;
			fitAll: string;
			inspectHint: string;
			readableView: string;
		};
	};
	graphLayout: {
		minimumRenderedEdgeWidth: number;
		semanticWeightExponent: number;
		semanticIdealLengthMin: number;
		semanticIdealLengthMax: number;
		semanticElasticityMin: number;
		semanticElasticityMax: number;
		structuralIdealLength: number;
		structuralElasticity: number;
		nodeRepulsion: number;
		gravity: number;
		componentSeparation: number;
		flowNodeSeparation: number;
		flowEdgeSeparation: number;
		flowRankSeparationTopDown: number;
		flowRankSeparationLeftRight: number;
		orbitNodeSeparation: number;
		detachedHorizontalGap: number;
		detachedVerticalGap: number;
		detachedRegionGap: number;
		detachedMinimumRegionWidth: number;
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
		inspectKey: 'Shift',
		ui: Object.freeze({
			communityUnavailable: 'Community analysis is unavailable. Run graph maintenance to rebuild the current community evidence.',
			fitAll: 'Fit entire graph',
			inspectHint: 'Hold Shift to inspect · I to pin',
			readableView: 'Readable view',
		}),
	}),
	graphLayout: Object.freeze({
		minimumRenderedEdgeWidth: 1.25,
		semanticWeightExponent: 2,
		semanticIdealLengthMin: 72,
		semanticIdealLengthMax: 156,
		semanticElasticityMin: 0.08,
		semanticElasticityMax: 0.3,
		structuralIdealLength: 92,
		structuralElasticity: 0.34,
		nodeRepulsion: 9000,
		gravity: 0.22,
		componentSeparation: 92,
		flowNodeSeparation: 48,
		flowEdgeSeparation: 18,
		flowRankSeparationTopDown: 84,
		flowRankSeparationLeftRight: 116,
		orbitNodeSeparation: 42,
		detachedHorizontalGap: 34,
		detachedVerticalGap: 26,
		detachedRegionGap: 112,
		detachedMinimumRegionWidth: 720,
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
	const interactionUi = interaction.ui ?? fallback.interaction.ui;
	const graphLayout = loaded.graphLayout ?? fallback.graphLayout;
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
			inspectKey: typeof interaction.inspectKey === 'string' && interaction.inspectKey.trim()
				? interaction.inspectKey.trim()
				: fallback.interaction.inspectKey,
			ui: {
				...fallback.interaction.ui,
				...interactionUi,
			},
		},
		graphLayout: {
			minimumRenderedEdgeWidth: positive(graphLayout.minimumRenderedEdgeWidth, fallback.graphLayout.minimumRenderedEdgeWidth),
			semanticWeightExponent: positive(graphLayout.semanticWeightExponent, fallback.graphLayout.semanticWeightExponent),
			semanticIdealLengthMin: positive(graphLayout.semanticIdealLengthMin, fallback.graphLayout.semanticIdealLengthMin),
			semanticIdealLengthMax: positive(graphLayout.semanticIdealLengthMax, fallback.graphLayout.semanticIdealLengthMax),
			semanticElasticityMin: positive(graphLayout.semanticElasticityMin, fallback.graphLayout.semanticElasticityMin),
			semanticElasticityMax: positive(graphLayout.semanticElasticityMax, fallback.graphLayout.semanticElasticityMax),
			structuralIdealLength: positive(graphLayout.structuralIdealLength, fallback.graphLayout.structuralIdealLength),
			structuralElasticity: positive(graphLayout.structuralElasticity, fallback.graphLayout.structuralElasticity),
			nodeRepulsion: positive(graphLayout.nodeRepulsion, fallback.graphLayout.nodeRepulsion),
			gravity: positive(graphLayout.gravity, fallback.graphLayout.gravity),
			componentSeparation: positive(graphLayout.componentSeparation, fallback.graphLayout.componentSeparation),
			flowNodeSeparation: positive(graphLayout.flowNodeSeparation, fallback.graphLayout.flowNodeSeparation),
			flowEdgeSeparation: positive(graphLayout.flowEdgeSeparation, fallback.graphLayout.flowEdgeSeparation),
			flowRankSeparationTopDown: positive(graphLayout.flowRankSeparationTopDown, fallback.graphLayout.flowRankSeparationTopDown),
			flowRankSeparationLeftRight: positive(graphLayout.flowRankSeparationLeftRight, fallback.graphLayout.flowRankSeparationLeftRight),
			orbitNodeSeparation: positive(graphLayout.orbitNodeSeparation, fallback.graphLayout.orbitNodeSeparation),
			detachedHorizontalGap: positive(graphLayout.detachedHorizontalGap, fallback.graphLayout.detachedHorizontalGap),
			detachedVerticalGap: positive(graphLayout.detachedVerticalGap, fallback.graphLayout.detachedVerticalGap),
			detachedRegionGap: positive(graphLayout.detachedRegionGap, fallback.graphLayout.detachedRegionGap),
			detachedMinimumRegionWidth: positive(graphLayout.detachedMinimumRegionWidth, fallback.graphLayout.detachedMinimumRegionWidth),
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
