import * as React from 'react';
import {
	CornerDownLeft,
	History as HistoryIcon,
	MessageSquare,
	Plus,
	Copy,
	Sparkles,
	WandSparkles,
	X,
} from 'lucide-react';
import type { ComposerActionDescriptor, ComposerContextSnapshot } from '@/core/composer';
import { Button, IconButton } from '@/ui/components/primitives';
import { useComposerChrome } from './ComposerChromeContext';
import { InsertTypeMenu } from './InsertTypeMenu';

/**
 * Single flattened block action row (WP4, handoff §6.4 / consistency §1).
 *
 * One row, one grammar: deterministic actions first (在下方插入 / 复制 / 评论),
 * one divider, then the AI actions PROJECTED by the capability port (sparkle
 * marks the region — same compact pill capsule geometry, no second toolbar, no
 * "AI 建议 · N" opener), then History (clock-arrow icon, never Undo) and 指令.
 * 指令 morphs THIS shell into an instruction input; it only renders when the
 * projection offers an instruction-accepting capability (no fake buttons —
 * stub projection ⇒ no AI region, no 指令). Disabled actions carry a reason.
 */
export type BlockPanelKind =
	| 'insert-menu'
	| 'insert-draft'
	| 'copy'
	| 'comment'
	| 'history'
	| 'instruction'
	| 'vault-library';

export interface BlockActionRowProps {
	snapshot: ComposerContextSnapshot;
	onInsertBelow?: () => void;
	onSelectInsertType?: (typeId: string) => void;
	copySurface?: (dismissPreview: () => void) => React.ReactNode;
	historySurface?: (dismissPreview: () => void) => React.ReactNode;
	onOpenPanel: (panel: BlockPanelKind) => void;
	onPreviewPanel: (panel: BlockPanelKind, open: boolean) => void;
	openPanel: BlockPanelKind | null;
	panelPinned: boolean;
	/** Reason when deterministic write actions are unavailable (no hub). */
	writeDisabledReason?: string;
	/** Capabilities that remain available for 指令 but do not render as quick pills. */
	hiddenQuickCapabilityIds?: readonly string[];
	onInvoke: (descriptor: ComposerActionDescriptor, instruction?: string) => void;
}

export function BlockActionRow({
	snapshot,
	onInsertBelow,
	onSelectInsertType,
	copySurface,
	historySurface,
	onOpenPanel,
	onPreviewPanel,
	openPanel,
	panelPinned,
	writeDisabledReason,
	hiddenQuickCapabilityIds = [],
	onInvoke,
}: BlockActionRowProps): React.ReactElement {
	const chrome = useComposerChrome();
	const { projection, config } = chrome;
	const a = config.chrome.actions;
	const canComment = Boolean(chrome.runtime.comments);
	const aiActions = projection.actionsFor(snapshot, 'block-row');
	const hiddenQuickIds = new Set(hiddenQuickCapabilityIds);
	const quickAiActions = aiActions.filter((descriptor) => !hiddenQuickIds.has(descriptor.capabilityId));
	const hasInstruction = aiActions.some((d) => d.acceptsInstruction && !d.disabledReason);
	const [instruction, setInstruction] = React.useState('');
	const inputRef = React.useRef<HTMLInputElement | null>(null);
	const instructionOpen = openPanel === 'instruction';
	const surfaceBlockId = snapshot.target.kind === 'document' ? snapshot.documentId : snapshot.target.blockId;
	const insertOpen = openPanel === 'insert-menu';
	const copyOpen = openPanel === 'copy';
	const historyOpen = openPanel === 'history';
	const actionTabIndex = instructionOpen ? -1 : 0;
	const previewCloseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const clearPreviewClose = () => {
		if (!previewCloseTimer.current) return;
		clearTimeout(previewCloseTimer.current);
		previewCloseTimer.current = null;
	};
	const showPreview = (kind: BlockPanelKind) => {
		clearPreviewClose();
		onPreviewPanel(kind, true);
	};
	const hidePreview = (kind: BlockPanelKind, immediate = false) => {
		clearPreviewClose();
		if (immediate) {
			onPreviewPanel(kind, false);
			return;
		}
		previewCloseTimer.current = setTimeout(() => {
			previewCloseTimer.current = null;
			onPreviewPanel(kind, false);
		}, config.chrome.surfacePreviewCloseDelayMs);
	};
	React.useEffect(() => () => clearPreviewClose(), []);
	React.useEffect(() => {
		if (!instructionOpen) {
			setInstruction('');
			const input = inputRef.current;
			if (input && input === input.ownerDocument.activeElement) input.blur();
			return;
		}
		const frame = requestAnimationFrame(() => inputRef.current?.focus());
		return () => cancelAnimationFrame(frame);
	}, [instructionOpen]);
	const closeInstruction = () => {
		setInstruction('');
		onOpenPanel('instruction');
	};
	const submitInstruction = () => {
		const target = aiActions.find((d) => d.acceptsInstruction && !d.disabledReason);
		if (target && instruction.trim()) onInvoke(target, instruction.trim());
		closeInstruction();
	};

	return (
		<div
			className="pk-block-action-row"
			data-chrome="true"
			data-mode={instructionOpen ? 'instruction' : 'actions'}
			data-floating-surface={insertOpen || copyOpen || historyOpen || undefined}
			data-composer-surface-owner={surfaceBlockId}
			onKeyDown={(event) => {
				if (event.key !== 'Escape' || (!insertOpen && !copyOpen && !historyOpen)) return;
				event.preventDefault();
				if (openPanel) {
					if (panelPinned) onOpenPanel(openPanel);
					else hidePreview(openPanel, true);
				}
			}}
			>
				<div
					className="pk-block-action-row__interaction-zone"
					onPointerEnter={clearPreviewClose}
					onPointerLeave={() => {
						if (!openPanel || panelPinned) return;
						if (!insertOpen && !copyOpen && !historyOpen) return;
						hidePreview(openPanel);
					}}
					onFocusCapture={clearPreviewClose}
					onBlurCapture={(event) => {
						if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
						if (!openPanel || panelPinned) return;
						if (!insertOpen && !copyOpen && !historyOpen) return;
						hidePreview(openPanel);
					}}
				>
				<div
					className="pk-block-action-row__shell"
					role="toolbar"
				>
				<span className="pk-block-action-row__options" aria-hidden={instructionOpen || undefined}>
					<span className="pk-action-core">
						<span
							className="pk-insert-trigger"
							onPointerEnter={() => showPreview('insert-menu')}
							onFocusCapture={() => showPreview('insert-menu')}
						>
							<CapsuleButton
								label={a.insertBelow}
								icon={<Plus size={13} />}
								disabled={!onInsertBelow}
								disabledReason={writeDisabledReason}
								onClick={onInsertBelow}
								tabIndex={actionTabIndex}
								data-action="insert"
									aria-haspopup="menu"
									aria-expanded={insertOpen}
									data-active={insertOpen || undefined}
							/>
							</span>
						<span
							className="pk-action-surface-trigger"
							onPointerEnter={() => showPreview('copy')}
							onFocusCapture={() => showPreview('copy')}
						>
							<CapsuleButton
								label={a.copy}
								icon={<Copy size={13} />}
								onClick={() => onOpenPanel('copy')}
								tabIndex={actionTabIndex}
								data-action="easy-copy"
									aria-haspopup="menu"
									aria-expanded={copyOpen}
									data-active={copyOpen || undefined}
							/>
							</span>
						<CapsuleButton
							label={a.comment}
							icon={<MessageSquare size={13} />}
							disabled={!canComment}
							disabledReason={writeDisabledReason}
							onClick={() => onOpenPanel('comment')}
							tabIndex={actionTabIndex}
							data-action="comment"
						/>
					</span>
					{quickAiActions.length > 0 && (
						<>
							<span className="pk-action-divider" role="separator" />
							<span className="pk-action-ai">
								<Sparkles size={13} className="pk-block-action-row__spark" aria-hidden />
								{quickAiActions.map((d) => (
									<CapsuleButton
										key={d.capabilityId}
										label={d.title}
										disabled={Boolean(d.disabledReason)}
										disabledReason={d.disabledReason}
										onClick={() => onInvoke(d)}
										tabIndex={actionTabIndex}
										data-ai-quick={d.title}
									/>
								))}
							</span>
						</>
					)}
					<span className="pk-action-divider" role="separator" />
					<span className="pk-action-tail">
						<span
							className="pk-action-surface-trigger"
							onPointerEnter={() => showPreview('history')}
							onFocusCapture={() => showPreview('history')}
						>
							<IconButton
								label={a.history}
								className="pk-action-capsule pk-action-history"
								tabIndex={actionTabIndex}
								onClick={() => onOpenPanel('history')}
									aria-haspopup="dialog"
									aria-expanded={historyOpen}
									data-active={historyOpen || undefined}
							>
								<HistoryIcon size={13} />
							</IconButton>
							</span>
						{hasInstruction && (
							<CapsuleButton
								label={a.instruction}
								icon={<WandSparkles size={13} />}
								onClick={() => onOpenPanel('instruction')}
								tabIndex={actionTabIndex}
							/>
						)}
					</span>
				</span>
				<span className="pk-block-action-row__instruction-shell" aria-hidden={!instructionOpen || undefined}>
					<Sparkles size={13} className="pk-block-action-row__spark" aria-hidden />
					<HistoryIcon size={13} className="pk-block-action-row__instruction-history" aria-hidden />
					<input
						ref={inputRef}
						className="pk-block-action-row__instruction"
						placeholder={a.instructionPlaceholder}
						value={instruction}
						autoFocus={instructionOpen}
						tabIndex={instructionOpen ? 0 : -1}
						onChange={(ev) => setInstruction(ev.target.value)}
						onKeyDown={(ev) => {
							if (ev.key === 'Escape') {
								ev.preventDefault();
								closeInstruction();
								return;
							}
							if (ev.key !== 'Enter' || !instruction.trim()) return;
							ev.preventDefault();
							submitInstruction();
						}}
					/>
					<span className="pk-block-action-row__submit-hint" title={a.instructionSubmitHint} aria-hidden>
						<CornerDownLeft size={15} />
					</span>
					<IconButton
						label={a.instructionClose}
						className="pk-block-action-row__close"
						tabIndex={instructionOpen ? 0 : -1}
						onClick={closeInstruction}
					>
						<X size={13} />
					</IconButton>
					</span>
				</div>
				{insertOpen && onSelectInsertType && (
					<InsertTypeMenu
						className="pk-block-action-row__expanded-surface"
						onSelect={(typeId) => {
							hidePreview('insert-menu', true);
							onSelectInsertType(typeId);
						}}
					/>
				)}
				{copyOpen && copySurface && (
					<div className="pk-block-action-row__expanded-surface">
						{copySurface(() => hidePreview('copy', true))}
					</div>
				)}
				{historyOpen && historySurface && (
					<div className="pk-block-action-row__expanded-surface">
						{historySurface(() => hidePreview('history', true))}
					</div>
				)}
				</div>
			</div>
	);
}

/** Compact pill capsule — the one shared geometry for deterministic AND AI actions. */
function CapsuleButton({
	label,
	icon,
	disabled,
	disabledReason,
	onClick,
	...rest
}: {
	label: string;
	icon?: React.ReactNode;
	disabled?: boolean;
	disabledReason?: string;
	onClick?: () => void;
} & Record<string, unknown>): React.ReactElement {
	return (
		<Button
			variant="ghost"
			className="pk-action-capsule"
			disabled={disabled}
			title={disabled ? disabledReason : undefined}
			aria-disabled={disabled || undefined}
			onClick={onClick}
			{...rest}
		>
			{icon}
			<span>{label}</span>
		</Button>
	);
}
