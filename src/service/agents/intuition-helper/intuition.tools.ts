/**
 * Tool set for knowledge intuition recon: folder tools plus graph helpers.
 */

import type { TemplateManager } from '@/core/template/TemplateManager';
import type { AgentTool } from '@/service/tools/types';
import {
	findPathTool,
	graphTraversalToolMarkdownOnly,
	hubLocalGraphTool,
} from '@/service/tools/search-graph-inspector';
import { buildFolderHubTools } from '@/service/agents/hub-helper/hubDiscovery.tools';

/** Inspector tools used to ground intuition skeleton claims. */
export function buildIntuitionTools(tm: TemplateManager): Record<string, AgentTool> {
	return {
		...buildFolderHubTools(tm),
		graph_traversal: graphTraversalToolMarkdownOnly(tm),
		hub_local_graph: hubLocalGraphTool(tm),
		find_path: findPathTool(tm),
	};
}

export { executeReconToolCalls } from '@/service/agents/hub-helper/hubDiscovery.tools';
