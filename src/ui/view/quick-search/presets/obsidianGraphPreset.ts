/**
 * Obsidian / knowledge-graph preset for GraphVisualization.
 * Provides edge styles, node styles, label, path extraction, click, effect mapping.
 */

import type {
	EdgeStyle,
	GraphVizNode,
	GraphVizNodeInfo,
	GraphVisualizationProps,
} from '@/ui/component/mine/graph-viz';
import type { SnapshotMarkdownOptions } from '@/ui/component/mine/graph-viz/formatters';

const NODE_ID_PREFIXES = ['node:', 'document:', 'file:', 'src:', 'note:'];

function obsidianNormalizeNodeId(nodeId: string): string {
	if (!nodeId) return nodeId;

	let cleaned = nodeId;
	for (const prefix of NODE_ID_PREFIXES) {
		if (cleaned.startsWith(prefix)) {
			cleaned = cleaned.substring(prefix.length);
			break;
		}
	}

	if (cleaned.startsWith('concept:') || cleaned.startsWith('tag:') || cleaned.startsWith('edge:')) {
		return cleaned.toLowerCase();
	}

	return cleaned;
}

function obsidianGetEdgeStyle(edge: { kind: string; weight: number }): EdgeStyle {
	if (edge.kind === 'path') {
		return {
			stroke: '#22c55e',
			strokeOpacity: 0.4,
			strokeDasharray: '2 2',
			strokeWidth: 2.5,
			strokeDashoffset: 12,
		};
	}
	if (edge.kind === 'semantic') {
		return {
			stroke: '#d1d5db',
			strokeOpacity: 0.25,
			strokeDasharray: '4 3',
			strokeWidth: Math.max(1, Math.min(3, (edge.weight || 1) * 2)),
			strokeDashoffset: 12,
		};
	}
	return {
		stroke: '#d1d5db',
		strokeOpacity: 0.4,
		strokeDasharray: null,
		strokeWidth: Math.max(1, Math.min(3, (edge.weight || 1) * 2)),
		strokeDashoffset: null,
	};
}

function obsidianGetNodeStyle(node: GraphVizNode): { fill: string; r?: number } {
	if (node.badges?.includes('Source')) return { fill: '#16a34a' };
	if (node.badges?.includes('Sink')) return { fill: '#f97316' };
	if (node.badges?.includes('bridge')) return { fill: '#2563eb' };
	if (node.badges?.includes('hub')) return { fill: '#06b6d4' };
	if (node.badges?.includes('authority')) return { fill: '#ef4444' };
	const t = (node.type ?? '').toLowerCase();
	if (t === 'tag') return { fill: '#d97706' };
	if (t === 'concept') return { fill: '#0ea5e9' };
	if (t === 'file' || t === 'document') return { fill: '#059669' };
	if (t === 'inspire_idea') return { fill: '#7c3aed' };
	return { fill: '#7c3aed' };
}

function obsidianGetNodeLabel(node: GraphVizNode, mode: 'full' | 'short'): string {
	const raw = (node.label || '').trim();
	if (raw) {
		return mode === 'short' && raw.length > 15 ? raw.substring(0, 15) + '...' : raw;
	}
	const title = String((node as any).title ?? '').trim();
	if (title) {
		const out = mode === 'short' && title.length > 15 ? title.substring(0, 15) + '...' : title;
		console.debug('[GraphVisualization] label fallback: title', out);
		return out;
	}
	const pathFromNode = (node as any).path ?? obsidianExtractPathFromNode(node) ?? String((node as any)?.attributes?.path ?? '').trim();
	if (pathFromNode) {
		const base = pathFromNode.split('/').filter(Boolean).pop() || pathFromNode;
		const clean = base.replace(/\.(md|markdown)$/i, '') || base;
		const out = mode === 'short' && clean.length > 15 ? clean.substring(0, 15) + '...' : clean;
		console.debug('[GraphVisualization] label fallback: path', out);
		return out;
	}
	const id = String(node.id || '').trim();
	if (!id) {
		console.warn('[GraphVisualization] node missing label/title/id/path', node);
		return '';
	}
	if (id.startsWith('concept:')) {
		const text = id.slice('concept:'.length).replace(/-/g, ' ').trim();
		const out = mode === 'short' && text.length > 15 ? text.substring(0, 15) + '...' : text;
		console.debug('[GraphVisualization] label fallback: concept id', out);
		return out;
	}
	if (id.startsWith('tag:')) {
		const text = id.slice('tag:'.length).replace(/-/g, ' ').trim();
		const out = mode === 'short' && text.length > 15 ? text.substring(0, 15) + '...' : text;
		console.debug('[GraphVisualization] label fallback: tag id', out);
		return out;
	}
	if (id.includes('/')) {
		const base = id.split('/').filter(Boolean).pop() || id;
		const out = mode === 'short' && base.length > 15 ? base.substring(0, 15) + '...' : base;
		console.debug('[GraphVisualization] label fallback: raw id path', out);
		return out;
	}
	if (id.startsWith('file:')) {
		const base = id.slice('file:'.length).split('/').filter(Boolean).pop() || id.slice('file:'.length);
		const out = mode === 'short' && base.length > 15 ? base.substring(0, 15) + '...' : base;
		console.debug('[GraphVisualization] label fallback: file id', out);
		return out;
	}
	if (id.startsWith('note:')) {
		const text = id.slice('note:'.length);
		const out = mode === 'short' && text.length > 15 ? text.substring(0, 15) + '...' : text;
		console.debug('[GraphVisualization] label fallback: note id', out);
		return out;
	}
	return mode === 'short' && id.length > 15 ? id.substring(0, 15) + '...' : id;
}

function obsidianExtractPathFromNode(node: GraphVizNode): string | null {
	const id = node.id ?? '';
	if (id.startsWith('file:')) return id.slice('file:'.length);
	if (id.startsWith('node:')) {
		const rest = id.slice('node:'.length);
		if (rest.includes('/') || rest.toLowerCase().endsWith('.md')) return rest;
	}
	if (id.includes('/') || id.toLowerCase().endsWith('.md')) return id;
	return null;
}

const OBSIDIAN_EFFECT_KIND_MAP: Partial<Record<string, string[]>> = {
	path: ['path'],
	semantic: ['semantic'],
	filter: ['semantic'],
};

const OBSIDIAN_SNAPSHOT_MARKDOWN_OPTIONS: SnapshotMarkdownOptions = {
	nodeTypeGroups: { concepts: ['concept'], tags: ['tag'] },
	edgeKindLabels: { physical: 'physical', semantic: 'semantic', path: 'path' },
	title: 'Knowledge Graph',
};

function createObsidianOnNodeClick(options: {
	copyText: (text: string) => Promise<void>;
	onOpenPath?: (path: string) => void | Promise<void>;
	openFile?: (path: string) => Promise<void>;
}): (node: GraphVizNodeInfo) => void | Promise<void> {
	const { copyText, onOpenPath, openFile } = options;
	return async (node: GraphVizNodeInfo) => {
		try {
			if (node.type === 'concept' || node.type === 'tag') {
				await copyText(node.label);
				return;
			}
			const path = node.path ?? null;
			if (!path) {
				await copyText(node.label || node.id);
				return;
			}
			if (onOpenPath) {
				await onOpenPath(path);
				return;
			}
			if (openFile) {
				await openFile(path);
				return;
			}
			await copyText(node.label || node.id);
		} catch (e) {
			console.warn('[GraphVisualization] Node click failed:', e);
		}
	};
}

export interface CreateObsidianGraphPresetOptions {
	onOpenPath?: (path: string) => void | Promise<void>;
	openFile?: (path: string) => Promise<void>;
	copyText?: (text: string) => Promise<void>;
}

/** Props returned by createObsidianGraphPreset - all required graph-viz props for Obsidian usage. */
export type ObsidianGraphPresetResult = Pick<
	GraphVisualizationProps,
	| 'getEdgeStyle'
	| 'getNodeStyle'
	| 'getNodeLabel'
	| 'extractPathFromNode'
	| 'effectKindMap'
	| 'defaultNodeType'
	| 'defaultEdgeKind'
	| 'normalizeNodeId'
	| 'snapshotMarkdownOptions'
> & Pick<GraphVisualizationProps, 'onNodeClick'>;

/**
 * Returns GraphVisualization props for Obsidian / knowledge-graph usage.
 */
export function createObsidianGraphPreset(
	options: CreateObsidianGraphPresetOptions = {}
): ObsidianGraphPresetResult {
	const copyText = options.copyText ?? (async (t: string) => navigator.clipboard.writeText(t));
	const onNodeClick = createObsidianOnNodeClick({
		copyText,
		onOpenPath: options.onOpenPath,
		openFile: options.openFile,
	});

	return {
		getEdgeStyle: obsidianGetEdgeStyle,
		getNodeStyle: obsidianGetNodeStyle,
		getNodeLabel: obsidianGetNodeLabel,
		extractPathFromNode: obsidianExtractPathFromNode,
		effectKindMap: OBSIDIAN_EFFECT_KIND_MAP,
		defaultNodeType: 'document',
		defaultEdgeKind: 'physical',
		normalizeNodeId: obsidianNormalizeNodeId,
		snapshotMarkdownOptions: OBSIDIAN_SNAPSHOT_MARKDOWN_OPTIONS,
		onNodeClick,
	};
}
