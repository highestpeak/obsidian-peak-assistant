import * as React from 'react';
import { History as HistoryIcon, MessageSquare, Plus, Copy, Sparkles, Terminal } from 'lucide-react';
import type { ComposerActionDescriptor, ComposerContextSnapshot } from '@/core/composer';
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

	if (openPanel === 'instruction') {
		return (
			<div className="pk-block-action-row is-instruction" data-chrome="true" role="toolbar" aria-label={a.instruction}>
				<Terminal size={13} className="pk-block-action-row__spark" />
				<input
					className="pk-block-action-row__instruction"
					placeholder={a.instructionPlaceholder}
					value={instruction}
					autoFocus
					onChange={(ev) => setInstruction(ev.target.value)}
					onKeyDown={(ev) => {
						if (ev.key === 'Escape') onOpenPanel('instruction');
						if (ev.key !== 'Enter' || !instruction.trim()) return;
						const target = aiActions.find((d) => d.acceptsInstruction && !d.disabledReason);
						if (target) onInvoke(target, instruction.trim());
						setInstruction('');
						onOpenPanel('instruction');
					}}
				/>
				<CapsuleButton
					label={a.instructionRun}
					disabled={!instruction.trim()}
					onClick={() => {
						const target = aiActions.find((d) => d.acceptsInstruction && !d.disabledReason);
						if (target && instruction.trim()) onInvoke(target, instruction.trim());
						setInstruction('');
						onOpenPanel('instruction');
					}}
				/>
			</div>
		);
	}

	return (
		<div className="pk-block-action-row" data-chrome="true" role="toolbar" aria-label="Block actions">
			<span className="pk-action-core">
				<CapsuleButton
					label={a.insertBelow}
					icon={<Plus size={13} />}
					disabled={!onInsertBelow}
					disabledReason={writeDisabledReason}
					onClick={onInsertBelow}
					data-action="insert"
				/>
				<CapsuleButton
					label={a.copy}
					icon={<Copy size={13} />}
					onClick={() => onOpenPanel('copy')}
					data-action="easy-copy"
				/>
				<CapsuleButton
					label={a.comment}
					icon={<MessageSquare size={13} />}
					disabled={!canComment}
					disabledReason={writeDisabledReason}
					onClick={() => onOpenPanel('comment')}
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
								data-ai-quick={d.title}
							/>
						))}
					</span>
				</>
			)}
			<span className="pk-action-divider" role="separator" />
			<span className="pk-action-tail">
				<button
					type="button"
					className="pk-action-capsule pk-action-history"
					aria-label={a.history}
					title={a.history}
					onClick={() => onOpenPanel('history')}
				>
					<HistoryIcon size={13} />
				</button>
				{hasInstruction && (
					<CapsuleButton label={a.instruction} icon={<Terminal size={13} />} onClick={() => onOpenPanel('instruction')} />
				)}
			</span>
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
		<button
			type="button"
			className="pk-action-capsule"
			disabled={disabled}
			title={disabled ? disabledReason : undefined}
			aria-disabled={disabled || undefined}
			onClick={onClick}
			{...rest}
		>
			{icon}
			<span>{label}</span>
		</button>
	);
}
