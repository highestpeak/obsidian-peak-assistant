/**
 * Graph snapshot formatters for copy/export.
 */

import { SLICE_CAPS } from '@/core/constant';
import { GraphNodeType } from '@/core/po/graph.po';
import type { GraphSnapshot } from '../types';

export interface SnapshotMarkdownOptions {
	/** Section title -> node types. e.g. { concepts: ['concept'], tags: ['tag'] } */
	nodeTypeGroups?: Record<string, string[]>;
	/** Edge kind -> display label for stats. */
	edgeKindLabels?: Record<string, string>;
	title?: string;
}

function getKnownTypes(groups: Record<string, string[]>): Set<string> {
	const known = new Set<string>();
	for (const types of Object.values(groups)) {
		for (const t of types) known.add(t);
	}
	return known;
}

export function snapshotToMarkdown(
	snapshot: GraphSnapshot,
	options: SnapshotMarkdownOptions
): string {
	const nodeTypeGroups = options.nodeTypeGroups ?? {};
	const edgeKindLabels = options.edgeKindLabels ?? {};
	const title = options.title ?? 'Graph';

	const knownTypes = getKnownTypes(nodeTypeGroups);
	const docs = snapshot.nodes.filter((n) => !knownTypes.has(n.type ?? 'document'));

	const typeCounts: Record<string, number> = { docs: docs.length };
	for (const [groupName, types] of Object.entries(nodeTypeGroups)) {
		const count = types.reduce(
			(sum, t) => sum + snapshot.nodes.filter((n) => (n.type ?? GraphNodeType.Document) === t).length,
			0,
		);
		typeCounts[groupName] = count;
	}

	const edgeCounts = snapshot.edges.reduce((acc, e) => {
		acc.total++;
		acc[e.kind] = (acc[e.kind] ?? 0) + 1;
		return acc;
	}, { total: 0 } as Record<string, number>);

	const lines: string[] = [];
	lines.push(`## ${title}`);
	lines.push('');
	const countParts = Object.entries(typeCounts)
		.map(([k, v]) => `${k}: ${v}`)
		.join(', ');
	lines.push(`- Nodes: **${snapshot.nodes.length}** (${countParts})`);
	const edgeParts = Object.entries(edgeCounts)
		.filter(([k]) => k !== 'total')
		.map(([k, v]) => `${edgeKindLabels[k] ?? k}: ${v}`)
		.join(', ');
	lines.push(`- Edges: **${snapshot.edges.length}** (${edgeParts || 'none'})`);
	lines.push('');

	for (const [sectionName, types] of Object.entries(nodeTypeGroups)) {
		if (types.length === 0) continue;
		const items = snapshot.nodes.filter((n) => types.includes(n.type ?? GraphNodeType.Document));
		if (items.length === 0) continue;
		const sectionTitle = sectionName.charAt(0).toUpperCase() + sectionName.slice(1);
		lines.push(`### ${sectionTitle}`);
		for (const n of items.slice(0, SLICE_CAPS.graphViz.formatItems)) {
			lines.push(`- ${n.label}`);
		}
		lines.push('');
	}

	if (docs.length) {
		lines.push('### Documents');
		for (const d of docs.slice(0, SLICE_CAPS.graphViz.formatDocs)) {
			lines.push(`- ${d.label}`);
		}
		lines.push('');
	}

	if (snapshot.edges.length) {
		lines.push('### Edges (sample)');
		for (const e of snapshot.edges.slice(0, SLICE_CAPS.graphViz.formatEdges)) {
			lines.push(`- ${e.source} -> ${e.target} (${e.kind})`);
		}
		lines.push('');
	}
	return lines.join('\n');
}

export function snapshotToMermaid(snapshot: GraphSnapshot): string {
	const nodes = snapshot.nodes.slice(0, SLICE_CAPS.graphViz.formatNodes);
	const idMap = new Map<string, string>();
	nodes.forEach((n, idx) => idMap.set(n.id, `n${idx}`));
	const esc = (s: string) => s.replace(/"/g, '\\"');

	const lines: string[] = [];
	lines.push('flowchart TD');
	for (const n of nodes) {
		const nid = idMap.get(n.id)!;
		const label = esc(n.label || n.id);
		lines.push(`${nid}["${label}"]`);
	}
	for (const e of snapshot.edges.slice(0, SLICE_CAPS.graphViz.formatEdges)) {
		const a = idMap.get(e.source);
		const b = idMap.get(e.target);
		if (!a || !b) continue;
		lines.push(`${a} -->|"${e.kind}"| ${b}`);
	}
	return lines.join('\n');
}

export function snapshotToJson(snapshot: GraphSnapshot): string {
	return JSON.stringify(snapshot);
}
