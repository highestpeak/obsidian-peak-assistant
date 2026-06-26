import { Modal, Notice, type App } from 'obsidian';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { applyCopilotArtifactsToContext } from '@/service/copilot/CopilotArtifactApply';
import type { IntentTabId } from '@/service/copilot/intent-hub';
import { runCopilotReview, type ReviewSessionSnapshot } from '@/service/copilot/CopilotReviewSession';
import { buildReviewArtifacts, reviewSubtitle } from '@/service/copilot/CopilotReviewArtifactBuilder';
import { MODE_LABELS, type ReviewMode } from '@/service/copilot/CopilotMetaAgentStream';
import { getCopilotReviewHistoryService, type InsightChatHistories } from '@/service/copilot/CopilotReviewHistoryService';
import type { ChatTurn } from './review/InsightInlineChat';
import { CopilotReviewShell } from './review/CopilotReviewShell';

interface CopilotAutoRunModalProps {
	tab: IntentTabId;
	ctx: DocumentContext;
	mode?: ReviewMode;
	/**
	 * When provided, the modal opens in read-only history mode:
	 *   - The agent loop is NOT run.
	 *   - The snapshot is shown as-is.
	 *   - Apply buttons are disabled (the original document may have changed).
	 */
	initialSnapshot?: ReviewSessionSnapshot;
	/** Persisted insight-chat histories restored from disk (read-only mode). */
	initialInsightChats?: InsightChatHistories;
}

const CopilotAutoRunContent: React.FC<{
	tab: IntentTabId;
	ctx: DocumentContext;
	mode: ReviewMode;
	initialSnapshot?: ReviewSessionSnapshot;
	initialInsightChats?: InsightChatHistories;
	onClose: () => void;
}> = ({ tab, ctx, mode, initialSnapshot, initialInsightChats, onClose }) => {
	const readOnly = Boolean(initialSnapshot);
	const controllerRef = useRef<AbortController | null>(null);
	const [snapshot, setSnapshot] = useState<ReviewSessionSnapshot | null>(initialSnapshot ?? null);
	const [deselectedBlockIds, setDeselectedBlockIds] = useState<Set<string>>(new Set());
	const [insightChats, setInsightChats] = useState<InsightChatHistories>(initialInsightChats ?? {});
	const persistedRecordRef = useRef<{ id: string; storagePath: string } | null>(null);
	const lastSavedSignatureRef = useRef<string>('');

	const updateInsightChat = (key: string, turns: ChatTurn[]) => {
		setInsightChats(prev => ({ ...prev, [key]: turns }));
	};

	const toggleBlock = (blockId: string) => {
		setDeselectedBlockIds(prev => {
			const next = new Set(prev);
			if (next.has(blockId)) next.delete(blockId);
			else next.add(blockId);
			return next;
		});
	};

	useEffect(() => {
		if (readOnly) return; // skip live run when restoring
		const controller = new AbortController();
		controllerRef.current = controller;
		let mounted = true;

		(async () => {
			try {
				const generator = runCopilotReview({ ctx, mode, signal: controller.signal });
				for await (const next of generator) {
					if (!mounted) return;
					setSnapshot(next);
				}
			} catch (err) {
				if (!mounted) return;
				console.error('[CopilotAutoRunModal] review failed', err);
				setSnapshot(prev => prev ? { ...prev, status: 'error', error: err instanceof Error ? err.message : String(err) } : prev);
			}
		})();

		return () => {
			mounted = false;
			controller.abort();
			controllerRef.current = null;
		};
	}, [ctx, mode, readOnly]);

	// Persist progressively: every time the snapshot or insight chats gain new
	// content, upsert the same history file. No debounce — each propose triggers
	// one async write so closing the modal mid-run never loses a checkpoint.
	useEffect(() => {
		if (readOnly || !snapshot) return;
		const hasOutput =
			snapshot.collectorSnapshot.insights.length > 0 ||
			snapshot.collectorSnapshot.changes.length > 0 ||
			snapshot.collectorSnapshot.sources.length > 0 ||
			snapshot.collectorSnapshot.chatFollowups.length > 0 ||
			Object.values(insightChats).some(turns => turns.length > 0);
		const finished = ['completed', 'cancelled', 'error'].includes(snapshot.status);
		// Don't write empty checkpoints — wait until at least one artifact exists
		// OR the session terminated (even an empty terminal state is worth recording).
		if (!hasOutput && !finished) return;

		// Quick signature so we skip identical re-saves (snapshots arrive on every event).
		const chatSigParts = Object.entries(insightChats)
			.map(([key, turns]) => `${key}:${turns.length}`)
			.sort();
		const sig = [
			snapshot.status,
			snapshot.rounds.length,
			snapshot.currentRoundIndex,
			snapshot.collectorSnapshot.insights.length,
			snapshot.collectorSnapshot.changes.length,
			snapshot.collectorSnapshot.sources.length,
			snapshot.collectorSnapshot.chatFollowups.length,
			snapshot.collectorSnapshot.findings.length,
			snapshot.collectorSnapshot.submissions.length,
			...chatSigParts,
		].join(':');
		if (sig === lastSavedSignatureRef.current) return;

		lastSavedSignatureRef.current = sig;
		const service = getCopilotReviewHistoryService();
		const originScope = tab === 'vault' ? 'vault' : 'document';
		service.save(ctx.file.path, snapshot, persistedRecordRef.current ?? undefined, insightChats, originScope)
			.then(rec => {
				persistedRecordRef.current = { id: rec.id, storagePath: rec.storagePath };
			})
			.catch(err => {
				console.warn('[CopilotAutoRunModal] failed to save review checkpoint', err);
			});
	}, [snapshot, readOnly, ctx.file.path, insightChats, tab]);

	const artifacts = useMemo(() => {
		if (!snapshot) {
			return {
				changes: [],
				insights: [],
				sources: [],
				trace: [],
				allProvenance: [],
			};
		}
		const base = buildReviewArtifacts(snapshot);
		if (deselectedBlockIds.size === 0) return base;
		return {
			...base,
			changes: base.changes.map(change => ({
				...change,
				blocks: change.blocks.map(block => ({
					...block,
					selected: !deselectedBlockIds.has(block.id),
				})),
			})),
		};
	}, [snapshot, deselectedBlockIds]);

	const cancelRun = () => {
		controllerRef.current?.abort();
	};

	const applyArtifacts = async () => {
		const result = await applyCopilotArtifactsToContext({ ctx, artifacts, selectedOnly: true, app: AppContext.getInstance().app });
		if (result.appliedBlocks === 0) {
			new Notice('No matching changes were applied.');
			return;
		}
		new Notice(`Applied ${result.appliedBlocks} change block${result.appliedBlocks === 1 ? '' : 's'}.`);
		onClose();
	};

	const isRunning = !readOnly && (snapshot
		? snapshot.status === 'running' || snapshot.status === 'awaiting-next-round'
		: true);

	const traceSummary = useMemo(() => {
		if (!snapshot || snapshot.rounds.length === 0) return undefined;
		const firstStart = snapshot.rounds[0].startedAt;
		const lastRound = snapshot.rounds[snapshot.rounds.length - 1];
		const finished = !isRunning;
		const end = finished ? (lastRound.endedAt ?? Date.now()) : Date.now();
		return {
			totalMs: Math.max(0, end - firstStart),
			roundCount: snapshot.rounds.length,
			turnCount: snapshot.rounds.reduce((s, r) => s + r.turnCount, 0),
			finished,
		};
	}, [snapshot, isRunning]);
	const subtitle = readOnly
		? `Read-only history · ${snapshot?.signalReport.basename ?? 'unknown'}`
		: snapshot
			? reviewSubtitle(snapshot)
			: 'Preparing pre-flight signal report...';
	const footerNote = (() => {
		if (readOnly) return 'Historical snapshot. The original document may have changed since this review; applying is disabled.';
		if (!snapshot) return 'Pre-flight inspection of the document.';
		if (snapshot.status === 'running') return 'Agent may keep calling tools as it learns. No changes are applied automatically.';
		if (snapshot.status === 'awaiting-next-round') return 'Compacting previous round before starting the next one.';
		if (snapshot.status === 'cancelled') return 'Cancelled — partial artifacts shown.';
		if (snapshot.status === 'error') return `Error: ${snapshot.error ?? 'unknown'}.`;
		return 'Review the artifacts before applying. Nothing is applied automatically.';
	})();

	const canApply = !readOnly && snapshot
		? (snapshot.status === 'completed' || snapshot.status === 'cancelled')
		: false;

	const baseTitle = `Auto Review · ${MODE_LABELS[mode]}`;
	const title = readOnly ? `${baseTitle} · History` : baseTitle;

	return (
		<CopilotReviewShell
			title={title}
			subtitle={subtitle}
			artifacts={artifacts}
			running={isRunning}
			showTraceRail={isRunning}
			footerNote={footerNote}
			cancelLabel="Cancel run"
			onClose={onClose}
			onCancelRun={isRunning ? cancelRun : undefined}
			onApplySelected={canApply ? () => void applyArtifacts() : undefined}
			deselectedBlockIds={deselectedBlockIds}
			onToggleChangeBlock={readOnly ? undefined : toggleBlock}
			originalContent={ctx.content}
			chatFollowups={snapshot?.collectorSnapshot.chatFollowups ?? []}
			subjectPath={ctx.file.path}
			subjectBasename={ctx.file.basename}
			insightChatHistories={insightChats}
			onInsightChatChange={updateInsightChat}
			insightChatReadOnly={readOnly}
			traceSummary={traceSummary}
		/>
	);
};

export class CopilotAutoRunModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App, private props: CopilotAutoRunModalProps) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.contentEl.addClass('pktw-root');
		this.contentEl.style.padding = '0';
		this.modalEl.style.width = '1240px';
		this.modalEl.style.maxWidth = '92vw';
		this.modalEl.style.height = 'min(820px, calc(100vh - 72px))';
		this.modalEl.style.padding = '0';
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotAutoRunContent,
				{
					tab: this.props.tab,
					ctx: this.props.ctx,
					mode: this.props.mode ?? 'complete',
					initialSnapshot: this.props.initialSnapshot,
					initialInsightChats: this.props.initialInsightChats,
					onClose: () => this.close(),
				},
				AppContext.getInstance(),
			),
		);
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
