import { SEMANTIC_DIMENSION_IDS, AXIS_TOPOLOGY_ID, AXIS_TEMPORAL_ID } from '@/core/schemas/agents/search-agent-schemas';
import { DIMENSION_AXIS_COLORS } from '@/core/constant';

export type DimensionAxis = 'semantic' | 'topology' | 'temporal';

const SEMANTIC_SET = new Set<string>(SEMANTIC_DIMENSION_IDS);

export function getDimensionAxis(id: string): DimensionAxis {
	if (id === AXIS_TOPOLOGY_ID) return 'topology';
	if (id === AXIS_TEMPORAL_ID) return 'temporal';
	if (SEMANTIC_SET.has(id)) return 'semantic';
	return 'semantic';
}

export function getDimensionColors(axis: DimensionAxis) {
	return DIMENSION_AXIS_COLORS[axis];
}

export function formatDimensionLabel(id: string): string {
	return id.replace(/_/g, ' ');
}
