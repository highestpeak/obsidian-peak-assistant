import React, { useCallback, useRef } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { ScrollToMessageEvent } from '@/core/eventBus';
import { cn } from '@/ui/react/lib/utils';
import { Star } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useScrollManager } from '../shared/scroll-utils';

/**
 * Right sidebar view displaying conversation message history for quick navigation
 */
export const MessageHistoryViewComponent: React.FC = () => {
	const { eventBus } = useServiceContext();
	// Directly subscribe to activeConversation from projectStore
	const activeConversation = useProjectStore((state) => state.activeConversation);

	const messageListContainerRef = useRef<HTMLDivElement>(null);

	// Scroll management - all scroll logic centralized here
	const { scrollToMessage: scrollToMessageInView } = useScrollManager({
		scrollRef: messageListContainerRef,
		containerRef: messageListContainerRef,
		eventBus,
		autoScrollOnMessagesChange: true,
		messagesCount: activeConversation?.messages.length,
	});

	const scrollToMessage = useCallback((messageId: string) => {
		// Dispatch event to scroll to message in main view
		eventBus.dispatch(new ScrollToMessageEvent({ messageId }));
	}, [eventBus]);

	if (!activeConversation) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground pktw-text-sm">
				No conversation selected
			</div>
		);
	}

	if (activeConversation.messages.length === 0) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-h-full">
				<div className="pktw-p-4 pktw-border-b pktw-border-border">
					<h3 className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-m-0">
						{activeConversation.meta.title}
					</h3>
				</div>
				<div className="pktw-flex pktw-items-center pktw-justify-center pktw-flex-1 pktw-text-muted-foreground pktw-text-sm">
					No messages yet
				</div>
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden">
			{/* Header */}
			<div className="pktw-p-4 pktw-border-b pktw-border-border">
				<h3 className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-m-0">
					{activeConversation.meta.title}
				</h3>
			</div>

			{/* Message List */}
			<div 
				ref={messageListContainerRef}
				className="pktw-flex-1 pktw-overflow-y-auto pktw-p-2"
			>
				{activeConversation.messages.map((message) => (
					<div
						key={message.id}
						data-message-id={message.id}
						data-message-role={message.role}
						className={cn(
							'pktw-p-2 pktw-rounded pktw-cursor-pointer pktw-transition-colors pktw-mb-1',
							'hover:pktw-bg-muted'
						)}
						onClick={() => scrollToMessage(message.id)}
					>
						{/* Message header with role and star indicator */}
						<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-1">
							<span className="pktw-text-xs pktw-font-medium pktw-text-muted-foreground pktw-uppercase">
								{message.role}
							</span>
							{message.starred && (
								<Star className="pktw-w-3 pktw-h-3 pktw-fill-yellow-400 pktw-text-yellow-400" />
							)}
						</div>

						{/* Message preview (truncated) */}
						<div className="pktw-text-xs pktw-text-foreground pktw-line-clamp-3">
							{message.content.length > 100
								? message.content.substring(0, 100) + '...'
								: message.content}
						</div>
					</div>
				))}
			</div>
		</div>
	);
};

