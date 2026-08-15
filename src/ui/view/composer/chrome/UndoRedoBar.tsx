import * as React from 'react';
import {
	ArrowLeft,
	ArrowRight,
	ChevronsLeftRight,
	ChevronsRightLeft,
	MessageSquare,
	Redo2,
	Sparkles,
	Undo2,
} from 'lucide-react';
import type {
	ComposerWorkspaceNavigationPort,
	ComposerWorkspaceNavigationSnapshot,
	ComposerContentWidth,
	ComposerCandidate,
	ComposerCandidateRuntimePort,
} from '@/core/composer';
import type { ComposerWorkspaceIntelligenceRuntime } from '@/service/composer';
import { Button, Chip, IconButton } from '@/ui/components/primitives';
import { useOwnerDocumentListener } from '@/ui/hooks/useOwnerWindow';
import { DisplayStateSwitch, type ComposerDisplayState } from './DisplayStateSwitch';
import { useComposerChrome } from './ComposerChromeContext';
import { useHubProjection } from './useHubProjection';
import { DEFAULT_SIDECAR_CONFIG, loadSidecarConfig } from '../sidecar/sidecarConfig';
import { ComposerReviewNavigation } from './ComposerReviewNavigation';
import {
	PEAK_CONTROL_KEY_TIP_KEYS,
	PEAK_KEYBOARD_ZONE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';

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
	onOpenNativeMarkdown,
	contentWidth,
	onContentWidth,
	reviewCandidates = [],
	candidateRuntime,
	workspaceIntelligence,
	documentId,
	documentPath,
	onLocateReviewCandidate,
	onOpenReviewDocument,
	intelligenceTriggerRef,
	commentTriggerRef,
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
	onOpenNativeMarkdown?: () => void;
	contentWidth: ComposerContentWidth;
	onContentWidth: (width: ComposerContentWidth) => void;
	reviewCandidates?: readonly ComposerCandidate[];
	candidateRuntime?: ComposerCandidateRuntimePort;
	workspaceIntelligence?: ComposerWorkspaceIntelligenceRuntime;
	documentId?: string;
	documentPath?: string;
	onLocateReviewCandidate?: (candidate: ComposerCandidate) => void;
	onOpenReviewDocument?: (path: string) => void;
	intelligenceTriggerRef?: React.Ref<HTMLButtonElement>;
	commentTriggerRef?: React.Ref<HTMLButtonElement>;
}): React.ReactElement {
	const { runtime, config } = useComposerChrome();
	const hub = runtime.hub;
	const comments = runtime.comments;
	const projection = useHubProjection(hub);
	const [commentCount, setCommentCount] = React.useState(0);
	const [intelligenceStrings, setIntelligenceStrings] = React.useState(DEFAULT_SIDECAR_CONFIG.strings);
	const { undo } = projection;
	const c = config.chrome.undo;
	const workspaceNavigation = runtime.workspaceNavigation;
	const workspaceNavigationState = useWorkspaceNavigation(workspaceNavigation);
	const workspaceNavigationStrings = config.chrome.workspaceNavigation;
	const contentWidthStrings = config.chrome.contentWidth;
	const commentStrings = config.chrome.comment;
	const nextContentWidth: ComposerContentWidth = contentWidth === 'wide' ? 'readable' : 'wide';
	const contentWidthAction = contentWidth === 'wide'
		? contentWidthStrings.switchToReadable
		: contentWidthStrings.switchToWide;

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
		<div
			className="pk-composer-controlbar"
			data-chrome="true"
			data-peak-keyboard-zone="cv-controlbar"
			data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['cv-controlbar']}
			aria-label={config.chrome.displayStates.groupLabel}
		>
			{workspaceNavigation && (
				<div
					className="pk-composer-workspace-navigation"
					role="group"
					aria-label={workspaceNavigationStrings.groupLabel}
				>
					<IconButton
						label={workspaceNavigationStrings.back}
						className="pk-composer-workspace-navigation__btn"
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.workspaceBack}
						data-peak-keytip-label={workspaceNavigationStrings.back}
						disabled={!workspaceNavigationState.canBack}
						onClick={() => void workspaceNavigation.back()}
					>
						<ArrowLeft size={16} />
					</IconButton>
					<IconButton
						label={workspaceNavigationStrings.forward}
						className="pk-composer-workspace-navigation__btn"
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.workspaceForward}
						data-peak-keytip-label={workspaceNavigationStrings.forward}
						disabled={!workspaceNavigationState.canForward}
						onClick={() => void workspaceNavigation.forward()}
					>
						<ArrowRight size={16} />
					</IconButton>
				</div>
			)}
			{canEdit ? (
				<DisplayStateSwitch
					value={displayState}
					onChange={onDisplayState}
					onOpenNativeMarkdown={onOpenNativeMarkdown}
				/>
			) : (
				<span className="pk-composer-controlbar__badge">{readOnlyLabel}</span>
			)}
			<Button
				variant="ghost"
				size="sm"
				className="pk-composer-content-width-toggle"
				data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.contentWidth}
				data-peak-keytip-label={contentWidthAction}
				aria-label={contentWidthAction}
				title={contentWidthAction}
				onClick={() => onContentWidth(nextContentWidth)}
			>
				{contentWidth === 'wide' ? <ChevronsRightLeft size={15} /> : <ChevronsLeftRight size={15} />}
			</Button>
			{documentId && documentPath && onLocateReviewCandidate ? (
				<ComposerReviewNavigation
					candidates={reviewCandidates}
					candidateRuntime={candidateRuntime}
					acceptAllLabel={config.chrome.displayStates.acceptAll}
					acceptAllFailedLabel={config.chrome.displayStates.acceptAllFailed}
					workspaceRuntime={workspaceIntelligence}
					documentId={documentId}
					documentPath={documentPath}
					onLocateCandidate={onLocateReviewCandidate}
					onOpenDocument={onOpenReviewDocument}
				/>
			) : null}
			<span className="pk-composer-controlbar__spacer" />
			{comments && (
				<Button
					ref={commentTriggerRef}
					variant={commentOpen ? 'primary' : 'ghost'}
					size="sm"
					className="pk-composer-comment-toggle"
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.comments}
					data-peak-keytip-label={commentOpen ? commentStrings.closeRail : commentStrings.openRail}
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
					ref={intelligenceTriggerRef}
					variant={intelligenceOpen ? 'primary' : 'ghost'}
					size="sm"
					className="pk-composer-intelligence-toggle"
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.intelligence}
					data-peak-keytip-label={intelligenceOpen ? intelligenceStrings.close : intelligenceStrings.openDrawer}
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
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.undo}
						data-peak-keytip-label={c.undo}
						disabled={!undo.canUndo}
						onClick={doUndo}
					>
						<Undo2 size={15} />
					</IconButton>
					<IconButton
						label={undo.nextRedoLabel ? `${c.redo} · ${undo.nextRedoLabel} (${c.shortcutRedo})` : `${c.redo} (${c.shortcutRedo})`}
						className="pk-undo-redo__btn"
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.composer.redo}
						data-peak-keytip-label={c.redo}
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

const EMPTY_WORKSPACE_NAVIGATION: ComposerWorkspaceNavigationSnapshot = Object.freeze({
	canBack: false,
	canForward: false,
});

function useWorkspaceNavigation(
	port: ComposerWorkspaceNavigationPort | undefined,
): ComposerWorkspaceNavigationSnapshot {
	const subscribe = React.useCallback(
		(listener: () => void) => port?.subscribe(listener) ?? (() => undefined),
		[port],
	);
	const getSnapshot = React.useCallback(
		() => port?.getSnapshot() ?? EMPTY_WORKSPACE_NAVIGATION,
		[port],
	);
	return React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
