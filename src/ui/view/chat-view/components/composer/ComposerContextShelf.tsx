import React from 'react';
import { CornerUpLeft, FileText, Folder, Link2, Workflow, X, PencilLine } from 'lucide-react';
import { useComposerStore } from '../../store/composerStore';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import type { ExplicitContextRef } from '@/core/types/chat-studio';
import { vaultReferenceDisplayName } from '@/ui/component/prompt-input/promptMenuSelection';
import { ResourcePreviewHover } from '@/ui/component/mine';

/**
 * Explicit context shelf (chat-studio §8.2). Renders ONLY when the active
 * draft carries explicit context: reply anchor, workflow chip, vault/url/file
 * refs, or an edit-and-resend revision marker. The project base is NOT shown
 * here — page scope + the Sources popover own that (§8.1).
 */

function refIcon(kind: ExplicitContextRef['kind']): React.ReactNode {
	if (kind === 'vault-folder') return <Folder />;
	if (kind === 'url') return <Link2 />;
	return <FileText />;
}

const ShelfChip: React.FC<{
	icon: React.ReactNode;
	label: string;
	tooltip?: string;
	removeLabel: string;
	onRemove: () => void;
	previewPath?: string;
	/** 'accent' tints reply/assistant chips (mock context-chip.is-reply). */
	variant?: 'default' | 'accent';
}> = ({ icon, label, tooltip, removeLabel, onRemove, previewPath, variant = 'default' }) => {
	const chip = <span
		className="pkchat-shelf__chip"
		data-variant={variant === 'accent' ? 'accent' : undefined}
		title={tooltip ?? label}
	>
		<span className="pkchat-shelf__chip-ico" aria-hidden>{icon}</span>
		<span className="pkchat-shelf__chip-label">{label}</span>
		<button
			type="button"
			className="pkchat-shelf__chip-x"
			aria-label={removeLabel}
			title={removeLabel}
			onClick={onRemove}
		>
			<X />
		</button>
	</span>;
	if (!previewPath) return chip;
	return (
		<ResourcePreviewHover filePath={previewPath} previewClassName="pktw-z-[100]">
			{chip}
		</ResourcePreviewHover>
	);
};

export const ComposerContextShelf: React.FC = () => {
	const strings = useChatStudioStrings();
	const activeKey = useComposerStore((s) => s.activeKey);
	const draft = useComposerStore((s) => s.drafts[activeKey]);
	if (!draft) return null;

	const hasContent = draft.replyAnchor || draft.workflowId || draft.revisionOfMessageId || draft.explicitRefs.length > 0;
	if (!hasContent) return null;

	const store = () => useComposerStore.getState();

	return (
		<div className="pkchat-shelf" role="group" aria-label={strings.composer.sourcesLabel}>
			{draft.replyAnchor && (
				<ShelfChip
					icon={<CornerUpLeft />}
					label={`${strings.composer.replyingToLabel}: ${draft.replyAnchor.preview}`}
					removeLabel={strings.messages.actionDelete}
					onRemove={() => store().setReplyAnchor(null)}
					variant="accent"
				/>
			)}
			{draft.revisionOfMessageId && (
				<ShelfChip
					icon={<PencilLine />}
					label={strings.messages.actionEditResend}
					removeLabel={strings.messages.actionDelete}
					onRemove={() => store().updateDraft({ revisionOfMessageId: null })}
					variant="accent"
				/>
			)}
			{draft.workflowId && (
				<ShelfChip
					icon={<Workflow />}
					label={`/${draft.workflowId}`}
					removeLabel={strings.messages.actionDelete}
					onRemove={() => store().updateDraft({ workflowId: null })}
				/>
			)}
			{draft.explicitRefs.map((ref) => (
				<ShelfChip
					key={ref.id}
					icon={refIcon(ref.kind)}
					label={ref.kind === 'vault-file' || ref.kind === 'vault-folder'
						? vaultReferenceDisplayName(ref.uri)
						: ref.title}
					tooltip={ref.uri}
					previewPath={ref.kind === 'vault-file' || ref.kind === 'upload' ? ref.uri : undefined}
					removeLabel={strings.messages.actionDelete}
					onRemove={() => store().removeExplicitRef(ref.id)}
				/>
			))}
		</div>
	);
};
