import React, { useState } from 'react';
import { ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import { IconButton, Modal } from '@/ui/components/primitives';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useChatViewStore } from '../store/chatViewStore';
import { CHAT_STRINGS } from '../chatStrings';

/**
 * HeaderRetained — minimal chat header per the 2026-05-29 retained design.
 *
 * Anatomy: [conversation title] [spacer] [Open source] [Delete] [Refresh title].
 * Deliberately omits model picker, mode toggle, system-prompt and resources
 * popovers — those moved into the run-chip + per-message More popover in the
 * retained spec.
 *
 * Delete-conversation reattaches the affordance that used to live inside the
 * legacy OpenMenuButton (orphaned by PR-Chat-1). PR-Chat-2 wires it to a
 * confirm modal using the PR-0 Modal primitive.
 */
export const HeaderRetained: React.FC = () => {
	const { app, manager } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const [isRegenerating, setIsRegenerating] = useState(false);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [deleting, setDeleting] = useState(false);

	if (!activeConversation) return null;

	const title = activeConversation.meta.title || activeConversation.meta.id;
	const hasSource = Boolean(activeConversation.file);

	const handleOpenSource = async () => {
		if (!activeConversation.file) return;
		await openSourceFile(app, activeConversation.file);
	};

	const handleRefresh = async () => {
		if (isRegenerating) return;
		setIsRegenerating(true);
		try {
			await manager.regenerateConversationTitle(activeConversation.meta.id);
		} catch (err) {
			console.error('[HeaderRetained] Regenerate title failed:', err);
		} finally {
			setIsRegenerating(false);
		}
	};

	const handleConfirmDelete = async () => {
		if (deleting) return;
		setDeleting(true);
		const convId = activeConversation.meta.id;
		try {
			await manager.conv.deleteConversation(convId);
			useChatDataStore.getState().deleteConversation(convId);
			useChatViewStore.getState().setHome();
			setConfirmingDelete(false);
		} catch (err) {
			console.error('[HeaderRetained] Delete failed:', err);
		} finally {
			setDeleting(false);
		}
	};

	return (
		<div className="pkchat-header">
			<span className="pkchat-header__title" title={title}>{title}</span>
			<div className="pkchat-header__spacer" />
			<div className="pkchat-header__actions">
				{hasSource && (
					<IconButton
						label={CHAT_STRINGS.header.openSourceLabel}
						title={CHAT_STRINGS.header.openSourceLabel}
						onClick={handleOpenSource}
					>
						<ExternalLink />
					</IconButton>
				)}
				<IconButton
					label={CHAT_STRINGS.header.deleteConversationLabel}
					title={CHAT_STRINGS.header.deleteConversationLabel}
					onClick={() => setConfirmingDelete(true)}
				>
					<Trash2 />
				</IconButton>
				<IconButton
					label={isRegenerating ? CHAT_STRINGS.header.refreshLabelBusy : CHAT_STRINGS.header.refreshLabel}
					title={isRegenerating ? CHAT_STRINGS.header.refreshLabelBusy : CHAT_STRINGS.header.refreshLabel}
					onClick={handleRefresh}
					disabled={isRegenerating}
				>
					<RefreshCw className={isRegenerating ? 'pktw-animate-spin' : undefined} />
				</IconButton>
			</div>

			<Modal
				open={confirmingDelete}
				onOpenChange={(open) => {
					if (!open && !deleting) setConfirmingDelete(false);
				}}
			>
				<Modal.Content width="narrow">
					<Modal.Header>
						<Modal.Title>{CHAT_STRINGS.header.deleteConversationConfirmTitle}</Modal.Title>
						<Modal.Close />
					</Modal.Header>
					<Modal.Body>
						<span style={{ color: 'var(--pk-text-secondary)' }}>
							{CHAT_STRINGS.header.deleteConversationConfirmBody}
						</span>
					</Modal.Body>
					<Modal.Footer>
						<button
							type="button"
							className="pkchat-msg__inline-followup__cancel"
							onClick={() => setConfirmingDelete(false)}
							disabled={deleting}
						>
							{CHAT_STRINGS.header.deleteConversationConfirmCancel}
						</button>
						<button
							type="button"
							className="pkchat-msg__inline-followup__submit"
							onClick={handleConfirmDelete}
							disabled={deleting}
							style={{ background: 'var(--pk-error)' }}
						>
							{deleting ? CHAT_STRINGS.header.refreshLabelBusy : CHAT_STRINGS.header.deleteConversationConfirmCta}
						</button>
					</Modal.Footer>
				</Modal.Content>
			</Modal>
		</div>
	);
};
