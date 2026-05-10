/**
 * Inspector tool: find structural holes in the knowledge graph.
 * Queries persisted structural analysis tables for gaps, bridges, and communities.
 */

import { z } from 'zod/v3';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { buildResponse } from '../types';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { ToolTemplateId } from '@/core/template/TemplateRegistry';
import { findStructuralHolesInputSchema } from '@/core/schemas/tools/searchGraphInspector';

type FindStructuralHolesParams = z.infer<typeof findStructuralHolesInputSchema>;

export async function findStructuralHoles(
	params: FindStructuralHolesParams,
	templateManager?: TemplateManager,
) {
	const { limit, bridge_limit, response_format } = params;
	const repo = sqliteStoreManager.getStructuralAnalysisRepo();

	const holes = await repo.getTopHoles(limit ?? 10);
	const bridges = await repo.getTopBridgeNodes(bridge_limit ?? 8);
	const communities = await repo.getCommunities();

	const data = { holes, bridges, communities };
	return buildResponse(response_format, ToolTemplateId.FindStructuralHoles, data, { templateManager });
}
