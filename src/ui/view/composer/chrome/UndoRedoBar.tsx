import * as React from 'react';
import { Undo2, Redo2 } from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';
import { useOwnerDocumentListener } from '@/ui/hooks/useOwnerWindow';
import { DisplayStateSwitch, type ComposerDisplayState } from './DisplayStateSwitch';
import { useComposerChrome } from './ComposerChromeContext';
import { useHubProjection } from './useHubProjection';

/**
 * Permanent Undo / Redo pair pinned to the right of the Composer bottom status
 * bar (handoff §9.7 / component-consistency §2). Standard Lucide `Undo2 /
 * Redo2` in matched 28px radius-md controls; a disabled control keeps its slot
 * (no layout shift); tooltip + aria name the next transaction and the shortcut.
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
}: {
	containerRef: React.RefObject<Element | null>;
	displayState: ComposerDisplayState;
	onDisplayState: (next: ComposerDisplayState) => void;
	canEdit: boolean;
	readOnlyLabel: string;
}): React.ReactElement {
	const { runtime, config } = useComposerChrome();
	const hub = runtime.hub;
	const projection = useHubProjection(hub);
	const hasReviewCandidates = hasReviewableCandidates(projection.candidates);
	const { undo } = projection;
	const c = config.chrome.undo;

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
		<div className="pk-composer-statusbar" data-chrome="true" aria-label={config.chrome.displayStates.groupLabel}>
			{canEdit && hasReviewCandidates ? (
				<DisplayStateSwitch value={displayState} onChange={onDisplayState} />
			) : canEdit ? null : (
				<span className="pk-composer-statusbar__badge">{readOnlyLabel}</span>
			)}
			<span className="pk-composer-statusbar__spacer" />
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
