import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, X, RefreshCw, ChevronDown, ChevronUp, AlertTriangle, Copy, Check } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { useSharedStore } from '@/ui/view/quick-search/store/sharedStore';
import {
	recordCandidateSelection,
	suggestQueries,
	type QueryRewriteError,
	type QueryRewriteStage,
	type QueryRewriteSuccess,
} from '@/ui/view/quick-search/rewrite/AIQueryRewriteService';
import { behaviorRecorder } from '@/ui/view/quick-search/rewrite/BehaviorContextRecorder';
import { suggestHistoryStore, type SuggestHistoryEntry } from '@/ui/view/quick-search/rewrite/SuggestHistoryStore';
import type { App } from 'obsidian';
import type { MyPluginSettings } from '@/core/config/settingsTypes';

/**
 * Decide whether the user has produced enough signal to run a Suggest round.
 * Cold open (empty query + no active file + no session events beyond
 * modal.opened) will produce weak candidates and burn tokens — nudge the
 * user to interact first instead.
 */
/**
 * Serialise a completed trace into a copyable text block: model header + one
 * line per stage with cumulative time + per-stage duration. Suitable for
 * pasting into a bug report or LLM-quality feedback comment.
 */
function formatTraceForCopy(data: QueryRewriteSuccess): string {
	const total = data.trace[data.trace.length - 1]?.tMs ?? 0;
	const lines: string[] = [
		`Model: ${data.provider} · ${data.modelId}`,
		`Total: ${(total / 1000).toFixed(2)}s across ${data.trace.length} stages`,
		'',
	];
	for (const t of data.trace) {
		const dur = t.durationMs != null ? ` (${t.durationMs}ms)` : '';
		lines.push(`+${(t.tMs / 1000).toFixed(2).padStart(6)}s  ${t.label}${dur}`);
	}
	return lines.join('\n');
}

function labelForStage(stage: QueryRewriteStage): string {
	switch (stage.kind) {
		case 'resolving-binding':   return 'Resolving Fast Lookup binding';
		case 'resolved-binding':    return `Model: ${stage.provider} · ${stage.modelId}`;
		case 'building-context':    return `Snapshotting behavior (${stage.eventCount} events)`;
		case 'rendering-prompts':   return 'Rendering prompts';
		case 'calling-llm':         return `Calling LLM (attempt ${stage.attempt}/${stage.maxAttempts})`;
		case 'parsing-response':    return 'Parsing JSON response';
		case 'validating-schema':   return 'Validating against schema';
		case 'retrying':            return `Retry — ${stage.reason}`;
		case 'falling-back':        return `Falling back — ${stage.reason}`;
	}
}

function hasUsableContext(app: App, currentQuery: string): boolean {
	if (currentQuery.trim().length > 0) return true;
	if (app.workspace.getActiveFile()) return true;
	const events = behaviorRecorder.snapshotEvents();
	// modal.opened alone counts as no signal; anything else means the user
	// did SOMETHING (typed / switched view / hovered / expanded / focused).
	return events.some((e) => e.kind !== 'modal.opened');
}

interface AIQueryRewritePanelProps {
	app: App;
	settings: MyPluginSettings;
	onClose: () => void;
	/** Called with the picked query string; caller writes it into the input. */
	onPick: (query: string) => void;
	/**
	 * Open the AI Setup tab of the Settings modal. Provided so the
	 * `no-fast-tier` error state can offer a direct "Open AI Setup" button
	 * instead of leaving the user in a dead-end.
	 */
	onOpenAISetup?: () => void;
	/**
	 * When set, panel opens in replay mode: skips the LLM call and hydrates
	 * from this stored entry. "Try again" still triggers a fresh Suggest
	 * round — replay is a starting-state, not a lock.
	 */
	replayEntry?: SuggestHistoryEntry;
}

interface LoadingTrace {
	label: string;
	kind: QueryRewriteStage['kind'];
	tMs: number;
}

type ViewState =
	| { kind: 'idle-empty' } // cold-open with no signal to lean on — ask the user to interact first
	| { kind: 'loading'; trace: LoadingTrace[] }
	| { kind: 'success'; data: QueryRewriteSuccess }
	| { kind: 'error'; error: QueryRewriteError };

/** Turn a stored history entry into a QueryRewriteSuccess so replay can enter
 *  the same success view without duplicating any render logic. */
function entryToSuccess(entry: SuggestHistoryEntry): QueryRewriteSuccess {
	return {
		candidates: entry.candidates,
		provider: entry.provider,
		modelId: entry.modelId,
		payloadSnapshot: entry.payloadSnapshot,
		fromFallback: entry.fromFallback,
		fallbackReason: entry.fallbackReason,
		fallbackRaw: entry.fallbackRaw,
		trace: entry.trace,
	};
}

/**
 * Body of the AI Query Rewrite (Suggest) modal. Loads candidates on mount,
 * lets the user pick one → auto-fill vault search query. See spec at
 * `docs/research/2026-07-08-ai-query-rewrite/README.md`.
 */
export const AIQueryRewritePanel: React.FC<AIQueryRewritePanelProps> = ({
	app, settings, onClose, onPick, onOpenAISetup, replayEntry,
}) => {
	const { vaultSearchQuery } = useSharedStore();
	// Replay mode hydrates the success state directly from the stored entry;
	// no LLM round runs unless the user hits Try again.
	const initialState: ViewState = replayEntry
		? { kind: 'success', data: entryToSuccess(replayEntry) }
		: hasUsableContext(app, vaultSearchQuery)
			? { kind: 'loading', trace: [] }
			: { kind: 'idle-empty' };
	const [state, setState] = useState<ViewState>(initialState);
	const [cursor, setCursor] = useState(0);
	const [showContext, setShowContext] = useState(false);
	const [showTrace, setShowTrace] = useState(false);
	// Id of the history entry we're either replaying OR just persisted, so
	// picking a candidate mutates the same record's `pickedIndex` instead of
	// creating a duplicate.
	const [historyId, setHistoryId] = useState<string | null>(replayEntry?.id ?? null);
	const abortRef = useRef<AbortController | null>(null);
	const loadStartRef = useRef<number>(0);

	const load = useCallback(async () => {
		abortRef.current?.abort();
		const ac = new AbortController();
		abortRef.current = ac;
		loadStartRef.current = Date.now();
		setState({ kind: 'loading', trace: [] });
		setCursor(0);
		// Fresh round overrides any replayed id — the new entry is what we
		// want to attribute a subsequent pick to.
		setHistoryId(null);
		const result = await suggestQueries({
			app,
			harness: settings.harnessSettings,
			signal: ac.signal,
			onStage: (stage) => {
				if (ac.signal.aborted) return;
				const entry: LoadingTrace = {
					kind: stage.kind,
					label: labelForStage(stage),
					tMs: Date.now() - loadStartRef.current,
				};
				setState((prev) => (prev.kind === 'loading'
					? { kind: 'loading', trace: [...prev.trace, entry] }
					: prev));
			},
		});
		if (ac.signal.aborted) return;
		if (result.ok) {
			// Persist to history so the hover popover has something to show.
			// Failures are swallowed inside the store; a broken localStorage
			// shouldn't nuke the round.
			const id = suggestHistoryStore.save({
				currentQuery: result.value.payloadSnapshot.currentQuery,
				provider: result.value.provider,
				modelId: result.value.modelId,
				candidates: result.value.candidates,
				payloadSnapshot: result.value.payloadSnapshot,
				trace: result.value.trace,
				fromFallback: !!result.value.fromFallback,
				fallbackReason: result.value.fallbackReason,
				fallbackRaw: result.value.fallbackRaw,
			});
			setHistoryId(id);
			setState({ kind: 'success', data: result.value });
		} else {
			setState({ kind: 'error', error: result.error });
		}
	}, [app, settings.harnessSettings]);

	useEffect(() => {
		// Only auto-load when we actually have signal to feed the LLM.
		// Replay mode already sits in success; nothing to do.
		if (initialState.kind === 'loading') void load();
		return () => abortRef.current?.abort();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [load]);

	const pick = useCallback((index: number) => {
		if (state.kind !== 'success') return;
		const chosen = state.data.candidates[index];
		if (!chosen) return;
		recordCandidateSelection({
			app,
			candidate: chosen,
			index,
			totalCandidates: state.data.candidates.length,
			fromFallback: !!state.data.fromFallback,
		});
		if (historyId) suggestHistoryStore.markPicked(historyId, index, chosen.query);
		onPick(chosen.query);
		onClose();
	}, [state, app, onPick, onClose, historyId]);

	// Keyboard: Esc closes, ↑↓ moves cursor, Enter picks, 1..5 direct pick.
	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
			if (state.kind !== 'success') return;
			const n = state.data.candidates.length;
			if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % n); return; }
			if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + n) % n); return; }
			if (e.key === 'Enter') {
				e.preventDefault();
				pick(cursor);
				return;
			}
			const num = parseInt(e.key, 10);
			if (!isNaN(num) && num >= 1 && num <= n) {
				e.preventDefault();
				pick(num - 1);
			}
		}
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	}, [state, cursor, onClose, pick]);

	// Compose subtitle summarizing what the recorder saw
	const subtitle = React.useMemo(() => {
		if (state.kind !== 'success') return '';
		const evts = state.data.payloadSnapshot.sessionEvents;
		if (evts.length === 0) return 'Suggestions based on your current query.';
		const lastT = evts[evts.length - 1]?.t ?? 0;
		const seen = new Set(evts.map((e) => e.kind));
		const bits: string[] = [];
		if (seen.has('typed')) bits.push('typing');
		if (seen.has('switchedView')) bits.push('view switches');
		if (seen.has('focusedFile') || seen.has('expandedFolder')) bits.push('browsing');
		if (seen.has('pinnedHub')) bits.push('a hub pin');
		const summary = bits.length > 0 ? bits.join(', ') : 'your actions';
		return `Based on ${lastT.toFixed(0)}s of ${summary}. Pick one to auto-fill${vaultSearchQuery ? ' (replaces "' + vaultSearchQuery + '")' : ''}:`;
	}, [state, vaultSearchQuery]);

	return (
		<div className="peak-design-root pktw-flex pktw-flex-col pktw-h-full pktw-bg-pk-background">
			{/* Sticky header */}
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-3 pktw-border-b pktw-border-pk-border">
				<Sparkles className="pktw-w-4 pktw-h-4 pktw-text-pk-accent" />
				<span className="pktw-flex-1 pktw-text-sm pktw-font-semibold pktw-text-pk-foreground">AI query suggest</span>
				<button
					type="button"
					onClick={onClose}
					className="pktw-w-6 pktw-h-6 pktw-inline-flex pktw-items-center pktw-justify-center pktw-rounded-md hover:pktw-bg-pk-surface-sunken pktw-text-pk-foreground-muted"
					aria-label="Close (Esc)"
				>
					<X className="pktw-w-3.5 pktw-h-3.5" />
				</button>
			</div>

			{/* Body */}
			<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto">
				{state.kind === 'idle-empty' && <IdleEmptyBody onGoAnyway={load} onClose={onClose} />}
				{state.kind === 'loading' && <LoadingBody trace={state.trace} />}
				{state.kind === 'error' && <ErrorBody error={state.error} onRetry={load} onOpenAISetup={onOpenAISetup} />}
				{state.kind === 'success' && (
					<>
						<div className="pktw-px-4 pktw-pt-2 pktw-pb-1 pktw-text-[11.5px] pktw-text-pk-foreground-muted">
							{subtitle}
						</div>
						{state.data.fromFallback && (
							<FallbackBanner
								reason={state.data.fallbackReason ?? ''}
								raw={state.data.fallbackRaw ?? ''}
								provider={state.data.provider}
								modelId={state.data.modelId}
							/>
						)}
						<div className="pktw-px-3 pktw-pb-3 pktw-flex pktw-flex-col pktw-gap-1.5">
							{state.data.candidates.map((c, i) => (
								<CandidateCard
									key={i}
									index={i + 1}
									title={c.title}
									query={c.query}
									reason={c.reason}
									focused={i === cursor}
									onClick={() => pick(i)}
									onHover={() => setCursor(i)}
								/>
							))}
						</div>
						{showTrace && state.data.trace && state.data.trace.length > 0 && (
							<div className="pktw-mx-3 pktw-mb-2 pktw-relative pktw-p-2.5 pktw-pt-6 pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border pktw-rounded-md pktw-max-h-[200px] pktw-overflow-y-auto">
								<CopyButton
									text={formatTraceForCopy(state.data)}
									label="Copy trace"
									className="pktw-absolute pktw-top-1.5 pktw-right-1.5 pktw-z-10 pktw-bg-pk-background"
								/>
								{state.data.trace.map((t, i) => (
									<div key={i} className="pktw-flex pktw-items-baseline pktw-gap-2 pktw-text-[10.5px] pktw-font-mono pktw-py-0.5 pktw-text-pk-foreground">
										<span className="pktw-tabular-nums pktw-w-[56px] pktw-flex-none pktw-text-right pktw-text-pk-foreground-faint">
											+{(t.tMs / 1000).toFixed(2)}s
										</span>
										<span className="pktw-flex-1">{t.label}</span>
										{t.durationMs != null && (
											<span className="pktw-flex-none pktw-tabular-nums pktw-text-pk-foreground-muted">
												{t.durationMs}ms
											</span>
										)}
									</div>
								))}
							</div>
						)}
						{showContext && (
							<div className="pktw-mx-3 pktw-mb-3 pktw-relative pktw-p-3 pktw-pt-6 pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border pktw-rounded-md pktw-max-h-[240px] pktw-overflow-y-auto">
								<CopyButton
									text={JSON.stringify(state.data.payloadSnapshot, null, 2)}
									label="Copy context"
									className="pktw-absolute pktw-top-1.5 pktw-right-1.5 pktw-z-10 pktw-bg-pk-background"
								/>
								<pre className="pktw-text-[10.5px] pktw-text-pk-foreground pktw-whitespace-pre-wrap pktw-break-words pktw-font-mono pktw-m-0 pktw-leading-relaxed">
									{JSON.stringify(state.data.payloadSnapshot, null, 2)}
								</pre>
							</div>
						)}
					</>
				)}
			</div>

			{/* Footer */}
			<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-2 pktw-border-t pktw-border-pk-border pktw-bg-pk-surface-sunken">
				{state.kind === 'success' && (
					<>
						<button
							type="button"
							onClick={() => setShowContext((v) => !v)}
							className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-sm pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground"
						>
							{showContext ? <ChevronUp className="pktw-w-3 pktw-h-3" /> : <ChevronDown className="pktw-w-3 pktw-h-3" />}
							{showContext ? 'Hide context' : 'Show context'}
						</button>
						{state.data.trace && state.data.trace.length > 0 && (
							<button
								type="button"
								onClick={() => setShowTrace((v) => !v)}
								className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-sm pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground"
								title={`Total ${state.data.trace[state.data.trace.length - 1]?.tMs ?? 0}ms across ${state.data.trace.length} stages`}
							>
								{showTrace ? <ChevronUp className="pktw-w-3 pktw-h-3" /> : <ChevronDown className="pktw-w-3 pktw-h-3" />}
								{showTrace ? 'Hide trace' : `Trace · ${((state.data.trace[state.data.trace.length - 1]?.tMs ?? 0) / 1000).toFixed(2)}s`}
							</button>
						)}
					</>
				)}
				<div className="pktw-flex-1" />
				<button
					type="button"
					onClick={load}
					disabled={state.kind === 'loading'}
					className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-sm pktw-text-pk-accent hover:pktw-opacity-80 disabled:pktw-opacity-40"
				>
					<RefreshCw className={cn('pktw-w-3 pktw-h-3', state.kind === 'loading' && 'pktw-animate-spin')} />
					Try again
				</button>
				<span className="pktw-text-[10.5px] pktw-text-pk-foreground-faint">
					<Kbd>↑↓</Kbd> pick · <Kbd>↵</Kbd> use · <Kbd>Esc</Kbd> close
				</span>
			</div>
		</div>
	);
};

const CandidateCard: React.FC<{
	index: number;
	title: string;
	query: string;
	reason: string;
	focused: boolean;
	onClick: () => void;
	onHover: () => void;
}> = ({ index, title, query, reason, focused, onClick, onHover }) => (
	<div
		onClick={onClick}
		onMouseEnter={onHover}
		className={cn(
			'pktw-relative pktw-px-3 pktw-py-2.5 pktw-border pktw-rounded-md pktw-cursor-pointer pktw-transition-all',
			focused
				? 'pktw-border-pk-accent pktw-bg-pk-accent-tint'
				: 'pktw-border-pk-border hover:pktw-border-pk-accent-soft hover:pktw-bg-pk-surface-sunken',
		)}
		style={focused ? { boxShadow: '0 0 0 3px rgba(124, 58, 237, 0.10)' } : undefined}
	>
		<span
			className={cn(
				'pktw-absolute pktw-top-1.5 pktw-right-2 pktw-text-pk-xs pktw-font-mono pktw-px-1.5 pktw-py-px pktw-rounded',
				focused ? 'pktw-bg-pk-accent pktw-text-white' : 'pktw-bg-pk-surface-sunken pktw-text-pk-foreground-muted',
			)}
		>
			{index}
		</span>
		<div className="pktw-text-[12.5px] pktw-font-semibold pktw-text-pk-foreground pktw-pr-6 pktw-mb-1">
			{title}
		</div>
		<div className="pktw-font-mono pktw-text-pk-sm pktw-text-pk-accent pktw-bg-pk-accent-tint pktw-px-2 pktw-py-1 pktw-rounded pktw-mb-1 pktw-break-all">
			{query}
		</div>
		<div className="pktw-text-pk-sm pktw-text-pk-foreground-muted pktw-leading-snug">
			{reason}
		</div>
	</div>
);

/**
 * "Cold open" state — user hit Suggest before typing or browsing anything.
 * The LLM would produce weak candidates from thin air, and the rule-based
 * fallback has no folders to lean on. So we show a friendly nudge instead
 * of burning tokens; user can still force a call with "Try anyway".
 */
const IdleEmptyBody: React.FC<{ onGoAnyway: () => void; onClose: () => void }> = ({ onGoAnyway, onClose }) => (
	<div className="pktw-flex pktw-flex-col pktw-items-center pktw-py-10 pktw-px-8 pktw-text-center pktw-gap-3">
		<Sparkles className="pktw-w-8 pktw-h-8 pktw-text-pk-accent-soft" />
		<div className="pktw-text-pk-md pktw-font-semibold pktw-text-pk-foreground">Give me something to work with</div>
		<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-leading-relaxed pktw-max-w-[380px]">
			Type a few words, browse a couple of results, or open a related file — then hit Suggest again. Right now I have no signal about what you're looking for.
		</div>
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-2">
			<button
				type="button"
				onClick={onClose}
				className="pktw-text-pk-sm pktw-px-3 pktw-py-1.5 pktw-rounded-md pktw-border pktw-border-pk-border hover:pktw-bg-pk-surface-sunken pktw-text-pk-foreground"
			>
				Got it, let me browse
			</button>
			<button
				type="button"
				onClick={onGoAnyway}
				className="pktw-text-pk-sm pktw-px-3 pktw-py-1.5 pktw-rounded-md pktw-text-pk-accent hover:pktw-underline"
			>
				Try anyway
			</button>
		</div>
	</div>
);

/**
 * Small "copy to clipboard" button used by fallback/error surfaces so the
 * user can grab the underlying LLM error for debugging without opening
 * DevTools. Shows a check for 1.2s after success.
 */
const CopyButton: React.FC<{ text: string; label?: string; className?: string }> = ({ text, label = 'Copy', className }) => {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				void navigator.clipboard.writeText(text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1200);
				}).catch(() => {/* ignore */});
			}}
			className={cn(
				'pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-[10.5px] pktw-px-2 pktw-py-0.5 pktw-rounded pktw-border pktw-border-pk-border hover:pktw-bg-pk-surface-sunken pktw-text-pk-foreground-muted',
				className,
			)}
			title="Copy to clipboard"
		>
			{copied ? <Check className="pktw-w-3 pktw-h-3 pktw-text-pk-success" /> : <Copy className="pktw-w-3 pktw-h-3" />}
			{copied ? 'Copied' : label}
		</button>
	);
};

/**
 * Yellow-tinted banner shown when candidates came from `buildRuleBasedCandidates()`
 * instead of the LLM. Exposes the underlying LLM error text with a copy button
 * and a "Show raw response" disclosure — otherwise the user is stuck with a
 * generic "LLM 没给出可用回复" and can't do anything about it.
 */
const FallbackBanner: React.FC<{
	reason: string;
	raw: string;
	provider: string;
	modelId: string;
}> = ({ reason, raw, provider, modelId }) => {
	const [showDetail, setShowDetail] = useState(false);
	const combined = [
		`Model: ${provider} · ${modelId}`,
		'',
		reason || '(no error captured)',
		raw ? `\n--- raw response ---\n${raw}` : '',
	].join('\n');
	return (
		<div className="pktw-mx-3 pktw-mb-2 pktw-px-3 pktw-py-2 pktw-text-pk-sm pktw-bg-pk-warning-bg pktw-border pktw-border-pk-warning/20 pktw-rounded-md">
			<div className="pktw-flex pktw-items-start pktw-gap-2">
				<AlertTriangle className="pktw-w-3.5 pktw-h-3.5 pktw-mt-0.5 pktw-flex-none pktw-text-pk-warning" />
				<div className="pktw-flex-1 pktw-min-w-0">
					<div className="pktw-text-pk-warning pktw-font-medium">
						LLM 没给出可用回复 · 下面是基于你行为的规则回退候选
					</div>
					<div className="pktw-mt-0.5 pktw-text-pk-foreground-muted pktw-text-[10.5px]">
						{provider} · {modelId}{reason ? ` — ${firstLine(reason)}` : ''}
					</div>
				</div>
				<CopyButton text={combined} label="Copy error" className="pktw-flex-none" />
			</div>
			{(reason || raw) && (
				<div className="pktw-mt-1.5">
					<button
						type="button"
						onClick={() => setShowDetail((v) => !v)}
						className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-[10.5px] pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground"
					>
						{showDetail ? <ChevronUp className="pktw-w-3 pktw-h-3" /> : <ChevronDown className="pktw-w-3 pktw-h-3" />}
						{showDetail ? 'Hide details' : 'Show details'}
					</button>
					{showDetail && (
						<pre className="pktw-mt-1.5 pktw-p-2 pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded pktw-text-[10.5px] pktw-font-mono pktw-whitespace-pre-wrap pktw-break-words pktw-max-h-[200px] pktw-overflow-y-auto pktw-text-pk-foreground">{combined}</pre>
					)}
				</div>
			)}
		</div>
	);
};

function firstLine(s: string): string {
	const nl = s.indexOf('\n');
	const line = nl >= 0 ? s.slice(0, nl) : s;
	return line.length > 90 ? `${line.slice(0, 90)}…` : line;
}

const LoadingBody: React.FC<{ trace: LoadingTrace[] }> = ({ trace }) => {
	const current = trace[trace.length - 1];
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-py-8 pktw-px-6 pktw-gap-3">
			<div className="pktw-flex pktw-items-center pktw-gap-2.5">
				<div className="pktw-w-4 pktw-h-4 pktw-border-2 pktw-border-pk-accent pktw-border-t-transparent pktw-rounded-full pktw-animate-spin" />
				<div className="pktw-text-pk-base pktw-text-pk-foreground pktw-font-medium">
					{current?.label ?? 'Reading your browsing…'}
				</div>
			</div>
			{trace.length > 0 && (
				<div className="pktw-w-full pktw-max-w-[420px] pktw-mt-1 pktw-p-2.5 pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border pktw-rounded-md pktw-max-h-[180px] pktw-overflow-y-auto">
					{trace.map((t, i) => {
						const isLast = i === trace.length - 1;
						return (
							<div
								key={i}
								className={cn(
									'pktw-flex pktw-items-baseline pktw-gap-2 pktw-text-[10.5px] pktw-font-mono pktw-py-0.5',
									isLast ? 'pktw-text-pk-accent' : 'pktw-text-pk-foreground-muted',
								)}
							>
								<span className="pktw-tabular-nums pktw-w-[52px] pktw-flex-none pktw-text-right pktw-text-pk-foreground-faint">
									+{(t.tMs / 1000).toFixed(2)}s
								</span>
								<span className="pktw-flex-1">{t.label}</span>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
};

const ErrorBody: React.FC<{
	error: QueryRewriteError;
	onRetry: () => void;
	onOpenAISetup?: () => void;
}> = ({ error, onRetry, onOpenAISetup }) => {
	if (error.kind === 'aborted') return null;
	const message =
		error.kind === 'no-fast-tier'
			? error.message
			: error.kind === 'llm-error'
				? `LLM failed after ${error.attempts} attempt(s): ${error.message}`
				: `LLM returned invalid JSON after ${error.attempts} attempt(s): ${error.message}`;
	const rawBlock = error.kind === 'schema-error' && error.raw
		? `\n--- raw response ---\n${error.raw}`
		: '';
	const copyText = `${message}${rawBlock}`;
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-start pktw-p-4 pktw-gap-3">
			<div className="pktw-flex pktw-items-start pktw-gap-2 pktw-text-pk-error pktw-text-pk-base pktw-w-full">
				<AlertTriangle className="pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-flex-none" />
				<pre className="pktw-flex-1 pktw-whitespace-pre-wrap pktw-break-words pktw-font-mono pktw-text-pk-sm pktw-m-0 pktw-text-pk-error">{message}</pre>
				<CopyButton text={copyText} label="Copy error" className="pktw-flex-none" />
			</div>
			{error.kind === 'schema-error' && error.raw && (
				<pre className="pktw-w-full pktw-p-2 pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border pktw-rounded pktw-text-[10.5px] pktw-font-mono pktw-whitespace-pre-wrap pktw-break-words pktw-max-h-[200px] pktw-overflow-y-auto pktw-text-pk-foreground">{error.raw}</pre>
			)}
			<div className="pktw-flex pktw-items-center pktw-gap-2">
				{error.kind === 'no-fast-tier' && onOpenAISetup && (
					<button
						type="button"
						onClick={onOpenAISetup}
						className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-sm pktw-px-3 pktw-py-1.5 pktw-rounded-md pktw-bg-pk-accent pktw-text-white hover:pktw-opacity-90"
					>
						Open AI Setup
					</button>
				)}
				{error.kind !== 'no-fast-tier' && (
					<button
						type="button"
						onClick={onRetry}
						className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-sm pktw-text-pk-accent hover:pktw-underline"
					>
						<RefreshCw className="pktw-w-3 pktw-h-3" /> Retry
					</button>
				)}
			</div>
		</div>
	);
};

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
	<span className="pktw-inline-block pktw-px-1 pktw-py-px pktw-border pktw-border-pk-border pktw-rounded pktw-font-mono pktw-text-[9px] pktw-bg-pk-background pktw-mx-0.5">
		{children}
	</span>
);

