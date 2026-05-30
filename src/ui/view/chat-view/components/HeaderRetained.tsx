import React, { useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { IconButton } from '@/ui/components/primitives';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { CHAT_STRINGS } from '../chatStrings';

/**
 * HeaderRetained — minimal chat header per the 2026-05-29 retained design.
 *
 * Anatomy: [conversation title] [spacer] [Open source] [Refresh title].
 * Deliberately omits model picker, mode toggle, system-prompt and resources
 * popovers — those moved into the run-chip + per-message More popover in the
 * retained spec. Existing affordances live in MessageViewHeader (legacy);
 * the chat view now mounts this component instead.
 */
export const HeaderRetained: React.FC = () => {
	const { app, manager } = useServiceContext();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const [isRegenerating, setIsRegenerating] = useState(false);

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
					label={isRegenerating ? CHAT_STRINGS.header.refreshLabelBusy : CHAT_STRINGS.header.refreshLabel}
					title={isRegenerating ? CHAT_STRINGS.header.refreshLabelBusy : CHAT_STRINGS.header.refreshLabel}
					onClick={handleRefresh}
					disabled={isRegenerating}
				>
					<RefreshCw className={isRegenerating ? 'pktw-animate-spin' : undefined} />
				</IconButton>
			</div>
		</div>
	);
};
