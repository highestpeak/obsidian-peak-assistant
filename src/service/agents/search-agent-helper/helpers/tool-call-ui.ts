/**
 * Build UI step events from agent tool-call chunks. Used by DocSimpleAgent (and previously RawSearchAgent).
 */

import type { RawUIStreamEvent } from '@/core/providers/types';
import { UIStepType } from '@/core/providers/types';
import { getFileNameFromPath } from '@/core/utils/file-utils';

/** Build a ui-step event for tool call display; returns undefined for tools that need no step. */
export function buildToolCallUIEvent(chunk: { toolName?: string; input?: Record<string, unknown> }, stepId: string): RawUIStreamEvent | undefined {
	const toolName = chunk.toolName;
	if (!toolName) return undefined;
	const input = (chunk.input ?? {}) as Record<string, unknown>;
	let fileName = '';
	switch (toolName) {
		case 'content_reader': {
			fileName = getFileNameFromPath((input.path as string) ?? '');
			const ifQuery = input.query ? `Query: ${input.query}` : '';
			const ifRange = input.lineRange ? `Range: ${(input.lineRange as { start?: number; end?: number }).start}-${(input.lineRange as { start?: number; end?: number }).end}` : '';
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: `Read File. ${input.mode} read. ${fileName}. ${ifQuery} ${ifRange}`,
				description: JSON.stringify(input),
			};
		}
		case 'inspect_note_context':
			fileName = getFileNameFromPath((input.note_path as string) ?? '');
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: `Inspect Note Context. ${fileName}.`,
				description: JSON.stringify(input),
			};
		case 'graph_traversal':
			fileName = getFileNameFromPath((input.start_note_path as string) ?? '');
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: `Explore Graph. ${fileName}. ${input.hops ? `Hops: ${input.hops}` : ''}`,
				description: JSON.stringify(input),
			};
		case 'find_path':
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: `Find Path. ${getFileNameFromPath((input.start_note_path as string) ?? '')} -> ${getFileNameFromPath((input.end_note_path as string) ?? '')}.`,
				description: JSON.stringify(input),
			};
		case 'find_key_nodes':
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: 'Find Key Nodes in vault.',
				description: JSON.stringify(input),
			};
		case 'find_orphans':
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: 'Find Orphans in vault.',
				description: JSON.stringify(input),
			};
		case 'search_by_dimensions':
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: `Search by Dimensions. ${input.boolean_expression ?? ''}.`,
				description: JSON.stringify(input),
			};
		case 'explore_folder':
			fileName = getFileNameFromPath((input.folder_path ?? input.folderPath ?? '') as string);
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: `Explore Folder. ${fileName}. ${input.recursive ? 'Recursive: true' : 'Recursive: false'} ${input.max_depth ? `Max Depth: ${input.max_depth}` : ''}`,
				description: JSON.stringify(input),
			};
		case 'recent_changes_whole_vault':
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: 'Search recent Changes Whole Vault.',
				description: JSON.stringify(input),
			};
		case 'local_search_whole_vault':
			return {
				type: 'ui-step',
				uiType: UIStepType.STEPS_DISPLAY,
				stepId,
				title: `Local Search Whole Vault. ${input.query ? `Query: ${input.query}` : ''}. ${input.scopeMode ? `Scope Mode: ${input.scopeMode}` : ''}.`,
				description: JSON.stringify(input),
			};
		default:
			return undefined;
	}
}
