/**
 * V2 (Agent SDK) types for the AI search UI.
 * V1 step types have been removed — only V2 types remain.
 */

// ---------------------------------------------------------------------------
// V2 types
// ---------------------------------------------------------------------------

export type V2TimelineItem =
	| { kind: 'text'; id: string; chunks: string[]; complete: boolean }
	| { kind: 'tool'; step: V2ToolStep };

export interface V2Source {
	path: string;
	title: string;
	readAt: number;
	reasoning?: string;
}

export interface V2ToolStep {
	id: string;                    // tool call id from SDK
	toolName: string;              // e.g. 'mcp__vault__vault_list_folders'
	displayName: string;           // e.g. 'Browsing vault structure'
	icon: string;                  // emoji
	input: Record<string, unknown>;
	status: 'running' | 'done' | 'error';
	startedAt: number;
	endedAt?: number;
	summary?: string;              // one-line summary extracted from tool result
	resultPreview?: string;        // raw result JSON for expanded view
}

/** Tool display name + icon, derived from toolName + input */
export function v2ToolDisplay(toolName: string, input: Record<string, unknown>): { displayName: string; icon: string } {
	const shortName = toolName.replace(/^mcp__vault__/, '');
	switch (shortName) {
		case 'vault_list_folders':
			return { displayName: 'Browsing vault structure', icon: '📂' };
		case 'vault_read_folder': {
			const folder = String(input.folder ?? '').split('/').pop() || 'folder';
			return { displayName: `Reading ${folder}`, icon: '📂' };
		}
		case 'vault_read_note': {
			const path = String(input.path ?? input.paths?.[0] ?? '');
			const basename = path.split('/').pop()?.replace(/\.md$/, '') || 'note';
			return { displayName: `Reading ${basename}`, icon: '📄' };
		}
		case 'vault_grep': {
			const query = String(input.pattern ?? input.query ?? '');
			return { displayName: `Searching "${query.slice(0, 30)}"`, icon: '🔍' };
		}
		case 'vault_wikilink_expand': {
			const path = String(input.path ?? '');
			const basename = path.split('/').pop()?.replace(/\.md$/, '') || 'note';
			return { displayName: `Following links from ${basename}`, icon: '🔗' };
		}
		case 'vault_submit_plan':
			return { displayName: 'Evidence plan', icon: '📋' };
		default:
			return { displayName: shortName, icon: '🔧' };
	}
}

/**
 * Unwrap SDK tool result content blocks to get the actual text.
 * SDK tool_result.content can be:
 *   - a string (direct text)
 *   - an array of content blocks: [{type:'text', text:'...'}]
 *   - null/undefined
 */
export function unwrapToolOutput(output: unknown): string {
	if (typeof output === 'string') return output;
	if (Array.isArray(output)) {
		return output
			.filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
			.map((b: any) => b.text)
			.join('');
	}
	if (output && typeof output === 'object') return JSON.stringify(output);
	return '';
}

/** Extract human-readable summary from tool result */
export function extractV2Summary(toolName: string, result: unknown): string {
	try {
		const raw = unwrapToolOutput(result);
		if (!raw) return '';
		const data = JSON.parse(raw);
		const shortName = toolName.replace(/^mcp__vault__/, '');
		switch (shortName) {
			case 'vault_list_folders':
				return `${data.folders?.length ?? 0} folders · ${data.totalMdFiles ?? 0} files`;
			case 'vault_read_folder':
				return `${data.totalCount ?? data.files?.length ?? 0} files in ${data.folder ?? ''}`;
			case 'vault_read_note':
				return data.error ? `⚠️ ${data.error}` : `${(data.bodyPreview ?? data.body ?? '').length} chars`;
			case 'vault_grep':
				return `${data.hits?.length ?? 0} hits`;
			case 'vault_wikilink_expand':
				return `${data.visited?.length ?? 0} notes discovered`;
			case 'vault_submit_plan':
				return `${data.adjustedPaths?.length ?? data.selected_paths?.length ?? 0} sources selected`;
			default:
				return '';
		}
	} catch {
		return '';
	}
}
