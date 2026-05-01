import React, { useState } from 'react';

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
	vault_search: { label: 'Searched vault', icon: '\uD83D\uDD0D' },
	local_search_whole_vault: { label: 'Searched vault', icon: '\uD83D\uDD0D' },
	vault_read_note: { label: 'Read note', icon: '\uD83D\uDCC4' },
	content_reader: { label: 'Read note', icon: '\uD83D\uDCC4' },
	vault_grep: { label: 'Searched text', icon: '\uD83D\uDD0E' },
	graph_traversal: { label: 'Explored graph', icon: '\uD83D\uDD50' },
	find_path: { label: 'Found path', icon: '\uD83D\uDD17' },
	find_key_nodes: { label: 'Found key notes', icon: '\u2B50' },
	inspect_note_context: { label: 'Inspected context', icon: '\uD83D\uDD2C' },
	explore_folder: { label: 'Explored folder', icon: '\uD83D\uDCC1' },
	submit_plan: { label: 'Submitted plan', icon: '\uD83D\uDCCB' },
	submit_final_answer: { label: 'Finished', icon: '\u2705' },
};

function getToolDisplay(toolName: string) {
	return TOOL_LABELS[toolName] ?? { label: toolName, icon: '\u2699\uFE0F' };
}

interface ToolCall {
	toolName: string;
	input?: any;
	output?: any;
	isActive?: boolean;
}

interface Props {
	toolCalls: ToolCall[];
	isStreaming?: boolean;
}

export const ToolCallSummary: React.FC<Props> = ({ toolCalls, isStreaming }) => {
	const [expanded, setExpanded] = useState(false);
	const completed = toolCalls.filter(tc => !tc.isActive);
	const active = toolCalls.find(tc => tc.isActive);

	// Build summary text
	const summaryParts = completed.map(tc => getToolDisplay(tc.toolName).label);
	const uniqueParts = [...new Set(summaryParts)];
	const summaryText = uniqueParts.join(', ');

	if (isStreaming && active) {
		const display = getToolDisplay(active.toolName);
		const inputPreview = typeof active.input === 'string' ? active.input
			: active.input?.query ?? active.input?.note_path ?? active.input?.start_note_path ?? '';
		return (
			<div className="pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-bg-accent/10 pktw-border pktw-border-accent/25 pktw-text-[11px] pktw-text-muted-foreground pktw-mb-1.5">
				<span className="pktw-animate-pulse">{display.icon}</span>
				<span>{display.label}</span>
				{inputPreview && <span className="pktw-font-medium pktw-text-foreground">{String(inputPreview).slice(0, 40)}</span>}
				{completed.length > 0 && <><span>&middot;</span><span>{completed.length} completed</span></>}
			</div>
		);
	}

	if (completed.length === 0) return null;

	return (
		<div className="pktw-mb-1.5">
			<div
				className="pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-bg-secondary pktw-border pktw-border-border pktw-text-[11px] pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
				onClick={() => setExpanded(!expanded)}
			>
				<span>{'\u2699\uFE0F'}</span>
				<span>{summaryText}</span>
				<span>&middot;</span>
				<span className="pktw-font-semibold pktw-text-foreground">{completed.length} steps</span>
				<span className={`pktw-text-[8px] pktw-text-muted-foreground pktw-transition-transform ${expanded ? 'pktw-rotate-180' : ''}`}>{'\u25BE'}</span>
			</div>

			{expanded && (
				<div className="pktw-py-1">
					{completed.map((tc, i) => {
						const display = getToolDisplay(tc.toolName);
						const inputPreview = typeof tc.input === 'string' ? tc.input
							: tc.input?.query ?? tc.input?.note_path ?? tc.input?.start_note_path ?? '';
						const resultPreview = getResultPreview(tc);
						return (
							<div key={i} className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-py-0.5 pktw-text-[11px] pktw-text-muted-foreground">
								<span className="pktw-w-3.5 pktw-text-center pktw-text-[10px]">{display.icon}</span>
								<span className="pktw-font-medium pktw-text-foreground">{display.label}</span>
								{inputPreview && <span className="pktw-text-muted-foreground/60 pktw-italic">{String(inputPreview).slice(0, 50)}</span>}
								{resultPreview && <span className="pktw-ml-auto pktw-text-[10px] pktw-text-[var(--pk-success,#22c55e)] pktw-whitespace-nowrap">{resultPreview}</span>}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};

function getResultPreview(tc: ToolCall): string | null {
	if (!tc.output) return null;
	if (typeof tc.output === 'object' && tc.output.results) return `${tc.output.results.length} found`;
	if (typeof tc.output === 'string' && tc.output.length > 0) return `${(tc.output.length / 1000).toFixed(1)}k chars`;
	return null;
}
