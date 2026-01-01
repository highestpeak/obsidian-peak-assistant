import React, { useState, useEffect } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../store/chatViewStore';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { Book, Brain, ExternalLink, Folder } from 'lucide-react';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { cn } from '@/ui/react/lib/utils';
import { ConversationUpdatedEvent, ViewEventType } from '@/core/eventBus';
import { useTypewriterEffect } from '@/ui/view/shared/useTypewriterEffect';
import { TYPEWRITER_EFFECT_SPEED_MS } from '@/core/constant';
import { ResourcesPopover } from './ResourcesPopover';

interface MessageHeaderProps {
}

/**
 * Component for rendering message header with title, model selector, and stats
 */
export const MessageHeader: React.FC<MessageHeaderProps> = ({
}) => {
	const { app, eventBus } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const setShowSummaryModal = useChatViewStore((state) => state.setShowSummaryModal);
	const [displayTitle, setDisplayTitle] = useState(activeConversation?.meta.title || '');

	// Listen for conversation title updates
	useEffect(() => {
		const unsubscribe = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			(event) => {
				// Only trigger typewriter if this is the active conversation
				if (event.conversation.meta.id === activeConversation?.meta.id) {
					setDisplayTitle(event.conversation.meta.title);
				}
			}
		);

		return () => {
			unsubscribe();
		};
	}, [eventBus, activeConversation?.meta.id]);

	// Update display title when active conversation changes
	useEffect(() => {
		if (activeConversation?.meta.title) {
			setDisplayTitle(activeConversation.meta.title);
		}
	}, [activeConversation?.meta.id]); // Only reset on conversation change, not title change

	// Apply typewriter effect
	const typewriterTitle = useTypewriterEffect({
		text: displayTitle,
		speed: TYPEWRITER_EFFECT_SPEED_MS,
		enabled: true,
	});

	const handleOpenSource = async () => {
		if (activeConversation?.file) {
			await openSourceFile(app, activeConversation.file);
		}
	};
	return (
		<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-4 pktw-w-full">
			{/* Left side: Conversation name */}
			<div className="pktw-m-0 pktw-flex pktw-items-center pktw-gap-2 pktw-flex-nowrap pktw-flex-1 pktw-min-w-0">
				{activeConversation && activeProject ? (
					<>
						<Folder className="pktw-inline-flex pktw-items-center pktw-flex-shrink-0" size={18} />
						<span className="pktw-font-medium pktw-text-foreground pktw-leading-[1.5]" style={{ fontSize: 'var(--font-ui-medium)' }}>{activeProject.meta.name}</span>
						<span className="pktw-text-muted-foreground pktw-mx-1" style={{ fontSize: 'var(--font-ui-medium)' }}> / </span>
						<span className="pktw-font-medium pktw-text-foreground pktw-leading-[1.5]" style={{ fontSize: 'var(--font-ui-medium)' }}>{typewriterTitle}</span>
					</>
				) : activeConversation ? (
					<h2 className="pktw-m-0 pktw-font-medium pktw-text-foreground pktw-inline pktw-leading-[1.5]" style={{ fontSize: 'var(--font-ui-medium)' }}>{typewriterTitle}</h2>
				) : null}
			</div>

			{/* Right side: Action buttons */}
			<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-flex-shrink-0">
				{activeConversation && (
					<>
						{/* Action buttons */}
						<div className="pktw-flex pktw-items-center pktw-gap-1">
							{/* Resources button */}
							<ResourcesPopover />

							{/* Summary button */}
							<IconButton
								size="lg"
								onClick={() => setShowSummaryModal(true)}
								title="View conversation summary"
							>
								<Brain className="pktw-w-4 pktw-h-4" />
							</IconButton>

							{/* Open source button */}
							<IconButton
								size="lg"
								onClick={handleOpenSource}
								title="Open source document"
							>
								<ExternalLink className="pktw-w-4 pktw-h-4" />
							</IconButton>
						</div>
					</>
				)}
			</div>
		</div>
	);
};

