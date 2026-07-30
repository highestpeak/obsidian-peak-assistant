import * as React from 'react';
import { Layers3, MessageSquare, Sparkles, Undo2, Redo2 } from 'lucide-react';
import { Button, Chip, IconButton, Segmented } from '@/ui/components/primitives';
import type { DefaultDocumentView } from '@/core/composer';
import { useOwnerDocumentListener } from '@/ui/hooks/useOwnerWindow';
import { DisplayStateSwitch, type ComposerDisplayState } from './DisplayStateSwitch';
import { useComposerChrome } from './ComposerChromeContext';
import { useHubProjection } from './useHubProjection';
import { DEFAULT_SIDECAR_CONFIG, loadSidecarConfig } from '../sidecar/sidecarConfig';

/**
 * Unified document control bar. Display state, comment visibility and document
 * Undo / Redo live in one normal-flow surface before the workspace, so none of
 * these persistent controls obscure the first comment or the document footer.
 * A disabled undo control keeps its slot (no layout shift); tooltip + aria name
 * the next transaction and the shortcut.
 *
 * `⌘/Ctrl+Z` and `⇧⌘Z / Ctrl+Y` drive the DOCUMENT stack only when focus is not
 * inside an editable range — native input/contenteditable keeps its own undo
 * ownership while the user is typing. Keyboard listening is owner-scoped so it
 * fires inside a detached (popped-out) window too.
 */
export function UndoRedoBar({
	containerRef,
	displayState,
	onDisplayState,
	canEdit,
	readOnlyLabel,
	commentOpen,
	onCommentOpen,
	intelligenceAvailable,
	intelligenceOpen,
	onIntelligenceOpen,
	defaultDocumentView,
	onDefaultDocumentView,
	onConvertCurrentView,
	reviewCandidateCount = 0,
	reviewAll = false,
	onReviewAll,
}: {
	containerRef: React.RefObject<Element | null>;
	displayState: ComposerDisplayState;
	onDisplayState: (next: ComposerDisplayState) => void;
	canEdit: boolean;
	readOnlyLabel: string;
	commentOpen: boolean;
	onCommentOpen: (open: boolean) => void;
	intelligenceAvailable: boolean;
	intelligenceOpen: boolean;
	onIntelligenceOpen: (open: boolean) => void;
	defaultDocumentView?: DefaultDocumentView;
	onDefaultDocumentView?: (view: DefaultDocumentView) => void;
	onConvertCurrentView?: (view: DefaultDocumentView) => void;
	reviewCandidateCount?: number;
	reviewAll?: boolean;
	onReviewAll?: (open: boolean) => void;
}): React.ReactElement {
	const { runtime, config } = useComposerChrome();
	const hub = runtime.hub;
	const comments = runtime.comments;
	const projection = useHubProjection(hub);
	const [commentCount, setCommentCount] = React.useState(0);
	const [intelligenceStrings, setIntelligenceStrings] = React.useState(DEFAULT_SIDECAR_CONFIG.strings);
	const { undo } = projection;
	const c = config.chrome.undo;
	const commentStrings = config.chrome.comment;

	React.useEffect(() => {
		if (!comments) return;
		return comments.subscribe((all) => setCommentCount(all.length));
	}, [comments]);
	React.useEffect(() => {
		if (!intelligenceAvailable) return;
		let alive = true;
		void loadSidecarConfig().then((sidecarConfig) => {
			if (alive) setIntelligenceStrings(sidecarConfig.strings);
		});
		return () => {
			alive = false;
		};
	}, [intelligenceAvailable]);

	const doUndo = React.useCallback(() => {
		void hub?.undo();
	}, [hub]);
	const doRedo = React.useCallback(() => {
		void hub?.redo();
	}, [hub]);
	function selectDocumentView(view: DefaultDocumentView): void {
		onDefaultDocumentView?.(view);
		if (view !== 'markdown') return;
		onConvertCurrentView?.(view);
	}

	const onKeyDown = React.useCallback(
		(ev: KeyboardEvent) => {
			if (!hub) return;
			const mod = ev.metaKey || ev.ctrlKey;
			if (!mod || ev.key.toLowerCase() !== 'z' && ev.key.toLowerCase() !== 'y') return;
			// Native input / contenteditable owns undo while editing (§9.7 L612).
			if (isEditableTarget(ev.target)) return;
			const isRedo = (ev.key.toLowerCase() === 'z' && ev.shiftKey) || ev.key.toLowerCase() === 'y';
			ev.preventDefault();
			if (isRedo) doRedo();
			else doUndo();
		},
		[hub, doUndo, doRedo],
	);
	useOwnerDocumentListener(containerRef, 'keydown', onKeyDown);

	return (
		<div className="pk-composer-controlbar" data-chrome="true" aria-label={config.chrome.displayStates.groupLabel}>
			{canEdit ? (
				<DisplayStateSwitch value={displayState} onChange={onDisplayState} />
			) : (
				<span className="pk-composer-controlbar__badge">{readOnlyLabel}</span>
			)}
			{defaultDocumentView && onDefaultDocumentView ? (
				<div className="pk-composer-default-view-policy">
					<span>{config.chrome.defaultDocumentView.futureLabel}</span>
					<Segmented<DefaultDocumentView>
						className="pk-composer-default-view-switch"
						aria-label={config.chrome.defaultDocumentView.groupLabel}
						title={config.chrome.defaultDocumentView.help}
						variant="animated-pill"
						size="sm"
						thumbLayoutId="composer-default-document-view-thumb"
						value={defaultDocumentView}
						onValueChange={selectDocumentView}
						options={[
							{ value: 'markdown', label: config.chrome.defaultDocumentView.markdown },
							{ value: 'composer', label: config.chrome.defaultDocumentView.composer },
						]}
					/>
				</div>
			) : null}
			{reviewCandidateCount >= 2 && onReviewAll ? (
				<Button
					variant={reviewAll ? 'primary' : 'ghost'}
					size="sm"
					className="pk-composer-review-all"
					aria-pressed={reviewAll}
					onClick={() => onReviewAll(!reviewAll)}
				>
					<Layers3 size={14} />
					<span>
						{config.chrome.displayStates.reviewAll.replace('{count}', String(reviewCandidateCount))}
					</span>
				</Button>
			) : null}
			<span className="pk-composer-controlbar__spacer" />
			{comments && (
				<Button
					variant={commentOpen ? 'primary' : 'ghost'}
					size="sm"
					className="pk-composer-comment-toggle"
					aria-pressed={commentOpen}
					aria-label={commentOpen ? commentStrings.closeRail : commentStrings.openRail}
					onClick={() => onCommentOpen(!commentOpen)}
				>
					<MessageSquare size={14} />
					<span>{commentStrings.railTitle}</span>
					<Chip className="pk-composer-comment-count" variant={commentOpen ? 'accent' : 'neutral'}>
						{commentCount}
					</Chip>
				</Button>
			)}
			{intelligenceAvailable && (
				<Button
					variant={intelligenceOpen ? 'primary' : 'ghost'}
					size="sm"
					className="pk-composer-intelligence-toggle"
					aria-pressed={intelligenceOpen}
					aria-label={intelligenceOpen ? intelligenceStrings.close : intelligenceStrings.openDrawer}
					onClick={() => onIntelligenceOpen(!intelligenceOpen)}
				>
					<Sparkles size={14} />
					<span>{intelligenceStrings.title}</span>
				</Button>
			)}
			{hub && (
				<div className="pk-undo-redo" role="group" aria-label={`${c.undo} / ${c.redo}`}>
					<IconButton
						label={undo.nextUndoLabel ? `${c.undo} · ${undo.nextUndoLabel} (${c.shortcutUndo})` : `${c.undo} (${c.shortcutUndo})`}
						className="pk-undo-redo__btn"
						disabled={!undo.canUndo}
						onClick={doUndo}
					>
						<Undo2 size={15} />
					</IconButton>
					<IconButton
						label={undo.nextRedoLabel ? `${c.redo} · ${undo.nextRedoLabel} (${c.shortcutRedo})` : `${c.redo} (${c.shortcutRedo})`}
						className="pk-undo-redo__btn"
						disabled={!undo.canRedo}
						onClick={doRedo}
					>
						<Redo2 size={15} />
					</IconButton>
				</div>
			)}
		</div>
	);
}

export function hasReviewableCandidates(candidates: Array<{ status: string }>): boolean {
	return candidates.some((candidate) =>
		candidate.status === 'ready' || candidate.status === 'streaming' || candidate.status === 'pending' || candidate.status === 'stale',
	);
}

function isEditableTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el || !el.tagName) return false;
	const tag = el.tagName.toLowerCase();
	if (tag === 'input' || tag === 'textarea') return true;
	return el.isContentEditable === true;
}
