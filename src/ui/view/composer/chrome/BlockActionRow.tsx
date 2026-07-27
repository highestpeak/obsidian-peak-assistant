import * as React from 'react';
import { CornerDownLeft, History as HistoryIcon, MessageSquare, Plus, Copy, Sparkles, Terminal, X } from 'lucide-react';
import type { ComposerActionDescriptor, ComposerContextSnapshot } from '@/core/composer';
import { Button, IconButton } from '@/ui/components/primitives';
import { useComposerChrome } from './ComposerChromeContext';

/**
 * Single flattened block action row (WP4, handoff §6.4 / consistency §1).
 *
 * One row, one grammar: deterministic actions first (在下方插入 / 复制 / 评论),
 * one divider, then the AI actions PROJECTED by the capability port (sparkle
 * marks the region — same 28px pill capsule geometry, no second toolbar, no
 * "AI 建议 · N" opener), then History (clock-arrow icon, never Undo) and 指令.
 * 指令 morphs THIS shell into an instruction input; it only renders when the
 * projection offers an instruction-accepting capability (no fake buttons —
 * stub projection ⇒ no AI region, no 指令). Disabled actions carry a reason.
 */
export type BlockPanelKind = 'copy' | 'comment' | 'history' | 'instruction';

export interface BlockActionRowProps {
	snapshot: ComposerContextSnapshot;
	onInsertBelow?: () => void;
	onOpenPanel: (panel: BlockPanelKind) => void;
	openPanel: BlockPanelKind | null;
	/** Reason when deterministic write actions are unavailable (no hub). */
	writeDisabledReason?: string;
	onInvoke: (descriptor: ComposerActionDescriptor, instruction?: string) => void;
}

export function BlockActionRow({
	snapshot,
	onInsertBelow,
	onOpenPanel,
	openPanel,
	writeDisabledReason,
	onInvoke,
}: BlockActionRowProps): React.ReactElement {
	const chrome = useComposerChrome();
	const { projection, config } = chrome;
	const a = config.chrome.actions;
	const canComment = Boolean(chrome.runtime.comments);
	const aiActions = projection.actionsFor(snapshot, 'block-row');
	const hasInstruction = aiActions.some((d) => d.acceptsInstruction && !d.disabledReason);
	const [instruction, setInstruction] = React.useState('');
	const inputRef = React.useRef<HTMLInputElement | null>(null);
	const instructionOpen = openPanel === 'instruction';
	const actionTabIndex = instructionOpen ? -1 : 0;
	React.useEffect(() => {
		if (!instructionOpen) {
			setInstruction('');
			if (inputRef.current === inputRef.current?.ownerDocument.activeElement) inputRef.current.blur();
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
		>
			<div
				className="pk-block-action-row__shell"
				role="toolbar"
				aria-label={instructionOpen ? a.instruction : 'Block actions'}
			>
			<span className="pk-block-action-row__options" aria-hidden={instructionOpen || undefined}>
				<span className="pk-action-core">
					<CapsuleButton
						label={a.insertBelow}
						icon={<Plus size={13} />}
						disabled={!onInsertBelow}
						disabledReason={writeDisabledReason}
						onClick={onInsertBelow}
						tabIndex={actionTabIndex}
						data-action="insert"
					/>
					<CapsuleButton
						label={a.copy}
						icon={<Copy size={13} />}
						onClick={() => onOpenPanel('copy')}
						tabIndex={actionTabIndex}
						data-action="easy-copy"
					/>
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
				{aiActions.length > 0 && (
					<>
						<span className="pk-action-divider" role="separator" />
						<span className="pk-action-ai">
							<Sparkles size={13} className="pk-block-action-row__spark" aria-hidden />
							{aiActions.map((d) => (
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
					<IconButton
						label={a.history}
						className="pk-action-capsule pk-action-history"
						tabIndex={actionTabIndex}
						onClick={() => onOpenPanel('history')}
					>
						<HistoryIcon size={13} />
					</IconButton>
					{hasInstruction && (
						<CapsuleButton
							label={a.instruction}
							icon={<Terminal size={13} />}
							onClick={() => onOpenPanel('instruction')}
							tabIndex={actionTabIndex}
						/>
					)}
				</span>
			</span>
			<span className="pk-block-action-row__instruction-shell" aria-hidden={!instructionOpen || undefined}>
				<Terminal size={13} className="pk-block-action-row__spark" aria-hidden />
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
		</div>
	);
}

/** 28px pill capsule — the one shared geometry for deterministic AND AI actions. */
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
