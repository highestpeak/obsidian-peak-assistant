import { sanitizeMermaidOverview } from '@/core/utils/mermaid-utils';
import type { ClassifyDimension } from '@/ui/view/quick-search/types/search-steps';
import type { DiscoveryGroup } from '@/service/agents/vault/types';

/** Escape a label for mermaid quoted nodes: ["label"]. */
function esc(s: string, maxLen = 50): string {
	if (!s) return '?';
	const cleaned = s.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').replace(/[[\]{}()<>]/g, '').trim();
	return cleaned.length > maxLen ? cleaned.slice(0, maxLen - 1) + '…' : cleaned;
}

/** Format a dimension id like "essence_definition" → "essence definition". */
function fmtDim(id: string): string {
	return id.replace(/_/g, ' ').replace(/-/g, ' ');
}

/**
 * Build a mermaid flowchart showing what was searched → what was found.
 *
 * Left: classify dimensions (query aspects the AI identified)
 * Right: discovery groups (evidence clusters actually found in vault, coverage-colored)
 * Edges: distribute dimensions across groups proportionally
 *
 * This answers "Did you understand my question AND did you find relevant content?"
 * which is the decision the user needs to make at the HITL approval point.
 */
export function buildPlanMermaid(
	dimensions: ClassifyDimension[],
	discoveryGroups: DiscoveryGroup[],
): string {
	if (dimensions.length === 0 || discoveryGroups.length === 0) return '';

	// Show all — no artificial limits
	const dims = dimensions;
	const groups = discoveryGroups;

	const lines: string[] = ['flowchart LR'];

	// Left: query dimensions (what AI understood from the query)
	lines.push('  subgraph dims["Query Dimensions"]');
	for (let i = 0; i < dims.length; i++) {
		const label = esc(fmtDim(dims[i].id));
		lines.push(`    d${i}["${label}"]`);
	}
	lines.push('  end');

	// Right: discovery groups (evidence found, colored by coverage quality)
	// Label = full topic name (no note count — coverage color already signals quality)
	lines.push('  subgraph found["Evidence Found"]');
	for (let i = 0; i < groups.length; i++) {
		const label = esc(groups[i].topic, 50);
		lines.push(`    g${i}["${label}"]`);
	}
	lines.push('  end');

	// Edges: each discovery group connects to 1-2 closest dimensions by index
	const dLen = dims.length;
	const gLen = groups.length;
	for (let gi = 0; gi < gLen; gi++) {
		const di = Math.min(Math.round((gi / gLen) * dLen), dLen - 1);
		lines.push(`  d${di} --> g${gi}`);
		// Connect a second dimension if there's room and it's different
		const di2 = Math.min(di + 1, dLen - 1);
		if (di2 !== di) {
			lines.push(`  d${di2} --> g${gi}`);
		}
	}

	// Coverage-based colors for evidence groups
	lines.push('  classDef highCov fill:#d1fae5,stroke:#10b981,color:#065f46');
	lines.push('  classDef medCov fill:#fef3c7,stroke:#f59e0b,color:#92400e');
	lines.push('  classDef lowCov fill:#fee2e2,stroke:#ef4444,color:#991b1b');
	lines.push('  classDef dimNode fill:#ede9fe,stroke:#7c3aed,color:#4c1d95');

	for (let gi = 0; gi < groups.length; gi++) {
		const cls = groups[gi].coverage === 'high' ? 'highCov' : groups[gi].coverage === 'medium' ? 'medCov' : 'lowCov';
		lines.push(`  class g${gi} ${cls}`);
	}
	for (let di = 0; di < dims.length; di++) {
		lines.push(`  class d${di} dimNode`);
	}

	try {
		return sanitizeMermaidOverview(lines.join('\n'));
	} catch {
		return lines.join('\n');
	}
}
