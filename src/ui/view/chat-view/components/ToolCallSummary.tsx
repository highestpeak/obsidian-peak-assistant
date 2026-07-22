/**
 * ToolCallSummary — the assistant turn's Agent Run surface.
 *
 * This component deliberately does not render model reasoning. It owns two
 * execution layers only:
 *   1. the user-readable tool timeline (what the agent did), and
 *   2. an optional diagnostic span stack (why the runtime did it).
 *
 * `message.reasoning` remains a separate, quiet disclosure in MessageViewItem.
 * Keeping those surfaces distinct prevents provider reasoning text from being
 * mistaken for a real agent/tool trace.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useChatViewStore } from '../store/chatViewStore';
import {
	AlertTriangle,
	BarChart,
	Bug,
	Check,
	CheckCircle2,
	ChevronDown,
	ClipboardList,
	FileSearch,
	FileText,
	Folder,
	Loader2,
	Microscope,
	Network,
	Package,
	Puzzle,
	Route,
	Search,
	Settings,
	Star,
	Workflow,
} from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import type { DebugRun, DebugRunStatus, DebugSpan } from '@/core/debug-trace';
import { useChatStudioStrings } from '../chatStudioStringsContext';
import type { ChatStudioStrings } from '../chatStudioStrings';

interface ToolDisplay {
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}

// Icons stay in code because React components cannot live in JSON. Human labels
// remain config-driven through chat-studio.json.
const TOOL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
	vault_search: Search,
	local_search_whole_vault: Search,
	vault_read_note: FileText,
	content_reader: FileText,
	vault_grep: FileSearch,
	graph_traversal: Network,
	find_path: Route,
	find_key_nodes: Star,
	inspect_note_context: Microscope,
	explore_folder: Folder,
	submit_plan: ClipboardList,
	submit_final_answer: CheckCircle2,
	'context-pipeline:assemble': Package,
	'context-pipeline:build-slots': Puzzle,
	'context-pipeline:budget-govern': BarChart,
};

function getToolDisplay(toolName: string, strings: ChatStudioStrings): ToolDisplay {
	const labels = strings.messages.toolLabels ?? {};
	return {
		label: labels[toolName] ?? toolName,
		icon: TOOL_ICONS[toolName] ?? Settings,
	};
}

export interface AgentToolCall {
	toolName: string;
	input?: unknown;
	output?: unknown;
	isActive?: boolean;
	startedAt?: number;
	finishedAt?: number;
}

interface Props {
	toolCalls: AgentToolCall[];
	isStreaming?: boolean;
	/** Runtime-only, retention-bounded diagnostic data for this exact turn. */
	debugRun?: DebugRun;
	/** Extra truthful run metadata prepared by the message renderer. */
	meta?: string[];
	/**
	 * The owning message id — enables MSG-07 "open trace" routing so this
	 * component can subscribe to chatViewStore.openTraceForMessageId and
	 * auto-expand/scroll when the user clicks the Trace message action.
	 * Omitted from streaming placeholders where no message id is known yet.
	 */
	messageId?: string;
}

type AgentRunVisualStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export const ToolCallSummary: React.FC<Props> = ({
	toolCalls,
	isStreaming = false,
	debugRun,
	meta = [],
	messageId,
}) => {
	const strings = useChatStudioStrings();
	const visualStatus = resolveRunStatus(isStreaming, debugRun?.status, toolCalls);
	const [expanded, setExpanded] = useState(
		isStreaming || toolCalls.length > 1 || visualStatus === 'failed',
	);
	const [traceForceOpen, setTraceForceOpen] = useState(false);
	const traceAnchorRef = useRef<HTMLDivElement | null>(null);
	const toolSpans = useMemo(
		() => debugRun?.spans.filter((span) => span.kind === 'tool.call') ?? [],
		[debugRun],
	);

	useEffect(() => {
		if (isStreaming || toolCalls.length > 1 || visualStatus === 'failed') {
			setExpanded(true);
		}
	}, [isStreaming, toolCalls.length, visualStatus]);

	// MSG-07 — subscribe to the "open Trace" store signal. When the target
	// message id matches ours, expand the AgentTrace section AND scroll it
	// into view; then clear the request so subsequent clicks retrigger.
	useEffect(() => {
		if (!messageId) return;
		const unsub = useChatViewStore.subscribe((state) => {
			if (state.openTraceForMessageId !== messageId) return;
			setExpanded(true);
			setTraceForceOpen(true);
			// Defer scroll one frame so the newly-expanded body has laid out.
			requestAnimationFrame(() => {
				traceAnchorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
				useChatViewStore.getState().clearOpenTraceRequest();
			});
		});
		return () => unsub();
	}, [messageId]);

	// Fallback: when the assistant produced no tool timeline but we DO have
	// a debug run, still render the trace anchor so the Trace message
	// action lands somewhere real. Without this, a text-only turn would
	// have no visible target for the Trace click even though the debug run
	// exists in memory.
	if (toolCalls.length === 0) {
		if (debugRun && debugRun.spans.length > 0) {
			return (
				<div
					ref={traceAnchorRef}
					data-message-id={messageId}
					className="pkchat-msg__trace-fallback"
				>
					<AgentTrace run={debugRun} strings={strings} forceOpen={traceForceOpen} onOpenChange={(open) => { if (!open) setTraceForceOpen(false); }} />
				</div>
			);
		}
		return null;
	}

	const stepWord = toolCalls.length === 1
		? strings.messages.agentRunStepSingular
		: strings.messages.agentRunStepPlural;
	const statusLabel = getRunStatusLabel(visualStatus, strings);
	const runDuration = getRunDurationLabel(debugRun);
	const metaParts = [`${toolCalls.length} ${stepWord}`, ...meta];
	if (runDuration && !metaParts.includes(runDuration)) metaParts.push(runDuration);

	return (
		<section
			className="pkchat-agent-run"
			data-state={visualStatus}
			data-expanded={expanded ? 'true' : 'false'}
		>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="pkchat-agent-run__trigger"
				onClick={() => setExpanded((value) => !value)}
				aria-expanded={expanded}
				aria-label={`${strings.messages.agentRunTitle}: ${statusLabel}`}
			>
				<RunStatusIcon status={visualStatus} />
				<span className="pkchat-agent-run__title">
					<strong>{strings.messages.agentRunTitle}</strong>
					<small>{statusLabel}</small>
				</span>
				<span className="pkchat-agent-run__meta">{metaParts.join(' · ')}</span>
				<ChevronDown className="pkchat-agent-run__chevron" />
			</Button>

			{expanded && (
				<div className="pkchat-agent-run__body">
					<div className="pkchat-agent-run__timeline">
						{toolCalls.map((toolCall, index) => (
							<AgentStepRow
								key={`${toolCall.toolName}-${index}`}
								call={toolCall}
								index={index}
								span={matchToolSpan(toolCall, index, toolSpans)}
								strings={strings}
							/>
						))}
					</div>
					{debugRun && debugRun.spans.length > 0 && (
						<div ref={traceAnchorRef} data-message-id={messageId}>
							<AgentTrace run={debugRun} strings={strings} forceOpen={traceForceOpen} onOpenChange={(open) => { if (!open) setTraceForceOpen(false); }} />
						</div>
					)}
				</div>
			)}
		</section>
	);
};

const RunStatusIcon: React.FC<{ status: AgentRunVisualStatus }> = ({ status }) => {
	if (status === 'running') {
		return (
			<span className="pkchat-agent-run__status" aria-hidden="true">
				<Loader2 className="pktw-animate-spin" />
			</span>
		);
	}
	if (status === 'failed') {
		return (
			<span className="pkchat-agent-run__status" aria-hidden="true">
				<AlertTriangle />
			</span>
		);
	}
	return (
		<span className="pkchat-agent-run__status" aria-hidden="true">
			<Workflow />
		</span>
	);
};

const AgentStepRow: React.FC<{
	call: AgentToolCall;
	index: number;
	span?: DebugSpan;
	strings: ChatStudioStrings;
}> = ({ call, index, span, strings }) => {
	const display = getToolDisplay(call.toolName, strings);
	const ToolIcon = display.icon;
	const error = getToolError(call, span);
	const state = call.isActive ? 'running' : error ? 'failed' : 'completed';
	const inputPreview = extractInputPreview(call.input) || span?.input?.excerpt || '';
	const resultPreview = getResultPreview(call, span, strings);
	const duration = getToolDurationLabel(call, span);

	return (
		<div className="pkchat-agent-step" data-state={state}>
			<span className="pkchat-agent-step__rail" aria-hidden="true">
				<span className="pkchat-agent-step__node">
					{state === 'running' ? <Loader2 className="pktw-animate-spin" /> : state === 'failed' ? <AlertTriangle /> : <Check />}
				</span>
			</span>
			<span className="pkchat-agent-step__tool-icon" aria-hidden="true">
				<ToolIcon />
			</span>
			<span className="pkchat-agent-step__content">
				<span className="pkchat-agent-step__topline">
					<strong>{display.label}</strong>
					{duration && <small>{duration}</small>}
				</span>
				{inputPreview && <span className="pkchat-agent-step__input">{inputPreview}</span>}
				{error ? (
					<span className="pkchat-agent-step__result pkchat-agent-step__result--error">{error}</span>
				) : resultPreview ? (
					<span className="pkchat-agent-step__result">{resultPreview}</span>
				) : null}
			</span>
			<span className="pkchat-agent-step__index" aria-hidden="true">{index + 1}</span>
		</div>
	);
};

const AgentTrace: React.FC<{
	run: DebugRun;
	strings: ChatStudioStrings;
	forceOpen?: boolean;
	onOpenChange?: (open: boolean) => void;
}> = ({ run, strings, forceOpen = false, onOpenChange }) => {
	const [open, setOpen] = useState(false);
	// MSG-07 — parent forces this open when the Trace action targets THIS
	// message. Local `open` is still authoritative for user clicks, but a
	// forced open overrides the local resting state.
	useEffect(() => {
		if (forceOpen && !open) setOpen(true);
	}, [forceOpen, open]);
	const rows = useMemo(() => buildTraceRows(run.spans), [run.spans]);
	const spanWord = rows.length === 1
		? strings.messages.agentTraceSpanSingular
		: strings.messages.agentTraceSpanPlural;

	return (
		<div className="pkchat-agent-trace" data-open={open ? 'true' : 'false'}>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="pkchat-agent-trace__trigger"
				onClick={() => {
					setOpen((value) => {
						const next = !value;
						onOpenChange?.(next);
						return next;
					});
				}}
				aria-expanded={open}
			>
				<Bug />
				<span>{strings.messages.agentTraceTitle}</span>
				<small>{rows.length} {spanWord}</small>
				<ChevronDown />
			</Button>
			{open && (
				<div className="pkchat-agent-trace__stack">
					{rows.map(({ span, depth }) => (
						<div
							key={span.spanId}
							className="pkchat-agent-trace__span"
							data-depth={depth}
							data-state={span.error ? 'failed' : 'completed'}
						>
							<span className="pkchat-agent-trace__span-node" aria-hidden="true" />
							<span className="pkchat-agent-trace__span-copy">
								<strong>{span.name}</strong>
								<small>{span.kind}</small>
								{span.error?.message && <em>{span.error.message}</em>}
							</span>
							<span className="pkchat-agent-trace__span-time">{formatDurationMs(span.durationMs)}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

function resolveRunStatus(
	isStreaming: boolean,
	debugStatus: DebugRunStatus | undefined,
	toolCalls: AgentToolCall[],
): AgentRunVisualStatus {
	if (isStreaming || debugStatus === 'running' || toolCalls.some((call) => call.isActive)) return 'running';
	if (debugStatus === 'failed' || toolCalls.some((call) => getToolError(call))) return 'failed';
	if (debugStatus === 'cancelled') return 'cancelled';
	return 'completed';
}

function getRunStatusLabel(status: AgentRunVisualStatus, strings: ChatStudioStrings): string {
	if (status === 'running') return strings.messages.agentRunRunning;
	if (status === 'failed') return strings.messages.agentRunFailed;
	if (status === 'cancelled') return strings.messages.agentRunCancelled;
	return strings.messages.agentRunCompleted;
}

function matchToolSpan(call: AgentToolCall, index: number, spans: readonly DebugSpan[]): DebugSpan | undefined {
	const exact = spans.find((span) => span.name === call.toolName || span.name.endsWith(call.toolName));
	return exact ?? spans[index];
}

function extractInputPreview(input: unknown): string {
	if (typeof input === 'string') return cleanPreview(input, 110);
	if (!input || typeof input !== 'object') return '';
	const value = input as Record<string, unknown>;
	const preferred = value.query
		?? value.note_path
		?? value.path
		?? value.start_note_path
		?? value.folder
		?? value.prompt
		?? '';
	if (typeof preferred === 'string') return cleanPreview(preferred, 110);
	try {
		return cleanPreview(JSON.stringify(value), 110);
	} catch {
		return '';
	}
}

function getResultPreview(
	call: AgentToolCall,
	span: DebugSpan | undefined,
	strings: ChatStudioStrings,
): string | null {
	if (span?.output?.excerpt) return cleanPreview(span.output.excerpt, 90);
	if (!call.output) return null;
	if (typeof call.output === 'object') {
		const output = call.output as Record<string, unknown>;
		if (Array.isArray(output.results)) {
			return `${output.results.length} ${strings.messages.agentResultFound}`;
		}
		if (typeof output.summary === 'string') return cleanPreview(output.summary, 90);
		return strings.messages.agentResultComplete;
	}
	if (typeof call.output === 'string') {
		const length = call.output.length;
		if (length <= 90) return cleanPreview(call.output, 90);
		return `${(length / 1000).toFixed(1)}k ${strings.messages.agentResultCharacters}`;
	}
	return strings.messages.agentResultComplete;
}

function getToolError(call: AgentToolCall, span?: DebugSpan): string | null {
	if (span?.error?.message) return span.error.message;
	if (!call.output || typeof call.output !== 'object') return null;
	const output = call.output as Record<string, unknown>;
	if (typeof output.error === 'string') return output.error;
	if (output.success === false && typeof output.message === 'string') return output.message;
	return null;
}

function getToolDurationLabel(call: AgentToolCall, span?: DebugSpan): string | null {
	if (span && span.durationMs >= 0) return formatDurationMs(span.durationMs);
	if (typeof call.startedAt !== 'number' || typeof call.finishedAt !== 'number') return null;
	if (call.finishedAt <= call.startedAt) return null;
	return formatDurationMs(call.finishedAt - call.startedAt);
}

function getRunDurationLabel(run?: DebugRun): string | null {
	if (!run?.endedAt || run.endedAt <= run.startedAt) return null;
	return formatDurationMs(run.endedAt - run.startedAt);
}

function formatDurationMs(ms: number): string {
	if (ms < 100) return '<0.1s';
	if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
	const minutes = Math.floor(ms / 60_000);
	const seconds = Math.round((ms % 60_000) / 1000);
	return `${minutes}m ${seconds}s`;
}

function cleanPreview(value: string, limit: number): string {
	const compact = value.replace(/\s+/g, ' ').trim();
	if (compact.length <= limit) return compact;
	return `${compact.slice(0, Math.max(0, limit - 1))}…`;
}

function buildTraceRows(spans: readonly DebugSpan[]): Array<{ span: DebugSpan; depth: number }> {
	const ordered = [...spans].sort((left, right) => left.startedAt - right.startedAt);
	const byId = new Map(ordered.map((span) => [span.spanId, span]));
	return ordered.map((span) => ({ span, depth: getSpanDepth(span, byId) }));
}

function getSpanDepth(span: DebugSpan, byId: Map<string, DebugSpan>): number {
	let depth = 0;
	let parentId = span.parentSpanId;
	const visited = new Set<string>();
	while (parentId && depth < 4 && !visited.has(parentId)) {
		visited.add(parentId);
		const parent = byId.get(parentId);
		if (!parent) break;
		depth += 1;
		parentId = parent.parentSpanId;
	}
	return depth;
}
