import * as React from 'react';
import { ArrowLeft, ChevronRight, MessageSquare, Send, ShieldAlert } from 'lucide-react';
import type { ComposerContextSnapshot } from '@/core/composer';
import { composerTargetBlockId } from '@/core/composer';
import { PromptInput, PromptInputAttachments, PromptInputBody } from '@/ui/component/prompt-input';
import { Button, IconButton } from '@/ui/components/primitives';
import { BriefView } from './BriefView';
import { RunReceiptCard } from './RunReceiptCard';
import { useSessionProjection, useSidecar } from './SidecarContext';

export { BriefView, BriefViewContent, type BriefViewContentProps, type RelatedLoadState } from './BriefView';

/**
 * Peak Composer — Copilot lifecycle projection. The Brief itself lives in its
 * own design-source component so session/review code cannot flatten its layout
 * back into a generic list of buttons.
 */
export function CopilotView(): React.ReactElement {
	const { runtime } = useSidecar();
	const projection = useSessionProjection(runtime);
	if (projection.stage === 'session') return <SessionView />;
	if (projection.stage === 'review') return <ReviewView />;
	return <BriefView />;
}

// ── session ─────────────────────────────────────────────────────────────────

function SessionView(): React.ReactElement {
	const { runtime, hub, config, getFocusedBlockId, resolveFocusContext } = useSidecar();
	const projection = useSessionProjection(runtime);
	const s = config.strings;
	const inputFocusRef = React.useRef<{ focus: () => void } | null>(null);

	React.useEffect(() => {
		const frame = requestAnimationFrame(() => inputFocusRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, []);

	const documentFallback = (): { snapshot: ComposerContextSnapshot; targetQuote: string } => ({
		snapshot: {
			documentId: 'document',
			revision: hub?.currentRevision ?? 'r0',
			target: { kind: 'document', documentId: 'document' },
			targetSource: '',
			nearby: { before: '', after: '' },
		},
		targetQuote: '',
	});

	const onSend = (text: string) => {
		if (!text.trim()) return;
		const focused = getFocusedBlockId?.() ?? null;
		const context = resolveFocusContext?.(focused) ?? documentFallback();
		runtime.session.send({
			snapshot: context.snapshot,
			targetQuote: context.targetQuote || text.trim(),
		});
	};

	return (
		<div className="pk-session" data-testid="pk-session">
			<div className="pk-session-head">
				<IconButton className="pk-back-btn" label={s.back} onClick={() => runtime.session.backToBrief()}>
					<ArrowLeft size={14} />
				</IconButton>
				<span className="pk-session-title">{projection.sessionTitle ?? s.tabCopilot}</span>
			</div>
			<div className="pk-session-thread">
				{projection.receipts.map((receipt) => (
					<RunReceiptCard key={receipt.runId} receipt={receipt} />
				))}
			</div>
			<div className="pk-session-composer">
				{projection.pendingCommentRefs.length > 0 && (
					<div className="pk-session-comment-sources" aria-label={s.commentSource}>
						{projection.pendingCommentRefs.map((source) => (
							<div
								key={source.commentId}
								className="pk-session-comment-source"
								data-trust={source.trust}
							>
								<MessageSquare size={13} aria-hidden />
								<span className="pk-session-comment-source__label">{s.commentSource}</span>
								<span className="pk-session-comment-source__quote">
									{source.quote || source.body}
								</span>
								{source.trust === 'external' && (
									<span
										className="pk-session-comment-source__trust"
										title={s.externalCommentWarning}
									>
										<ShieldAlert size={12} aria-hidden />
										{s.externalCommentWarning}
									</span>
								)}
							</div>
						))}
					</div>
				)}
				<PromptInput
					className="pk-prompt-input-shell"
					inputFocusRef={inputFocusRef}
					onSubmit={(message) => onSend(message.text)}
				>
					<PromptInputAttachments />
					<div className="pk-prompt-editor">
						<PromptInputBody inputRef={inputFocusRef} placeholder={s.askComposerPlaceholder} />
					</div>
					<div className="pk-prompt-foot">
						<IconButton type="submit" className="pk-send-btn" label={s.send}>
							<Send size={14} />
						</IconButton>
					</div>
				</PromptInput>
			</div>
		</div>
	);
}

// ── review (transient) ──────────────────────────────────────────────────────

function ReviewView(): React.ReactElement {
	const { runtime, config, onLocate } = useSidecar();
	const projection = useSessionProjection(runtime);
	const s = config.strings;
	const receipt = projection.receipts.find((entry) => entry.runId === projection.activeRunId);
	return (
		<div className="pk-review" data-testid="pk-review">
			<div className="pk-session-head">
				<IconButton className="pk-back-btn" label={s.back} onClick={() => runtime.session.closeReview()}>
					<ArrowLeft size={14} />
				</IconButton>
				<span className="pk-session-title">{receipt?.action ?? s.reviewClose}</span>
			</div>
			<div className="pk-review-list">
				{(receipt?.changes ?? []).map((change) => (
					<Button
						key={change.changeId}
						className="pk-review-item"
						variant="ghost"
						onClick={() => {
							const blockId = composerTargetBlockId(change.target);
							if (blockId) onLocate?.(blockId);
						}}
					>
						<span className="pk-review-item-label">{change.label}</span>
						<ChevronRight size={13} />
					</Button>
				))}
			</div>
			<Button className="pk-review-close" variant="outline" onClick={() => runtime.session.closeReview()}>
				{s.reviewClose}
			</Button>
		</div>
	);
}
