import React, { useEffect, useRef, useMemo } from 'react';
import { ChatMessage } from '@/service/chat/types';
import { useChatViewStore } from './store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/store/messageStore';
import { OpenLinkEvent, ViewEventType } from '@/core/eventBus';
import { SummaryModal } from './components/SummaryModal';
import { MessageHeader } from './components/MessageViewHeader';
import { MessageItem } from './components/MessageViewItem';
import { ChatInputAreaComponent } from './components/ChatInputArea';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useScrollManager, scrollToBottom as scrollToBottomUtil } from '../shared/scroll-utils';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { ArrowUp, ArrowDown } from 'lucide-react';

/**
 * Main component for rendering and managing the messages list view
 */
export const MessagesViewComponent: React.FC = () => {
	const { app, eventBus, manager } = useServiceContext();
    const store = useChatViewStore();
    const activeConversation = useProjectStore((state) => state.activeConversation);
    const activeProject = useProjectStore((state) => state.activeProject);
    const pendingConversation = store.pendingConversation;
    const streamingMessageId = useMessageStore((state) => state.streamingMessageId);
    const streamingContent = useMessageStore((state) => state.streamingContent);

    const bodyContainerRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);


    // Scroll management - all scroll logic centralized here
    const { scrollToTop, scrollToBottom, scrollToMessage } = useScrollManager({
        scrollRef: bodyScrollRef,
        containerRef: bodyContainerRef,
        eventBus,
        autoScrollOnMessagesChange: true,
        messagesCount: activeConversation?.messages.length,
        autoScrollOnStreaming: true,
        streamingContent,
    });

    // Handle open link events
    useEffect(() => {
        if (!eventBus) return;

        const unsubscribeOpenLink = eventBus.on<OpenLinkEvent>(
            ViewEventType.OPEN_LINK,
            async (event) => {
                await app.workspace.openLinkText(event.path, '', true);
            }
        );

        return () => {
            unsubscribeOpenLink();
        };
    }, [eventBus, app]);

    // // Clear streaming state when conversation changes
    // useEffect(() => {
    //     const { clearStreaming } = useMessageStore.getState();
    //     clearStreaming();
    // }, [activeConversation?.meta.id]);

    // Prepare messages list including streaming message if exists
    const messagesToRender = useMemo(() => {
        const result: Array<{ message?: ChatMessage; isStreaming: boolean; streamingContent: string; id: string; role: ChatMessage['role'] }> = [];

        if (activeConversation && activeConversation.messages && Array.isArray(activeConversation.messages)) {
            // Add all regular messages
            activeConversation.messages.forEach(message => {
                result.push({
                    message,
                    isStreaming: streamingMessageId === message.id,
                    streamingContent: streamingMessageId === message.id ? streamingContent : '',
                    id: message.id,
                    role: message.role,
                });
            });
        }

        // Add temporary streaming message if it doesn't exist in conversation yet
        // This happens when streaming just started and message hasn't been added to conversation
        if (streamingMessageId && activeConversation?.messages && Array.isArray(activeConversation.messages) && !activeConversation.messages.find(m => m.id === streamingMessageId)) {
            result.push({
                isStreaming: true,
                streamingContent,
                id: streamingMessageId,
                role: 'assistant',
            });
        }

        return result;
    }, [activeConversation, streamingMessageId, streamingContent]);

    // Auto scroll to bottom when conversation is opened/changed
    // Use scrollToBottomUtil from scroll utils with instant=true to handle content loading
    useEffect(() => {
        if (!activeConversation || messagesToRender.length === 0) return;
        // Use scrollToBottomUtil with instant=true to handle dynamic content loading
        scrollToBottomUtil(bodyScrollRef, true);
    }, [activeConversation?.meta.id, messagesToRender.length]); // Scroll when conversation ID or message count changes

    return (
        <div className="pktw-flex pktw-flex-col pktw-h-full pktw-relative pktw-overflow-hidden">
            {/* Header */}
            <div className="pktw-px-6 pktw-py-4 pktw-border-b pktw-border-border pktw-flex-shrink-0">
                <MessageHeader />
            </div>

            {/* Body - Messages List */}
            <div 
                className="pktw-flex-1 pktw-overflow-y-auto pktw-overflow-x-hidden pktw-relative pktw-min-h-0 pktw-w-full" 
                ref={bodyScrollRef}
                style={{ scrollBehavior: 'smooth' }}
            >
                <div className="pktw-w-full">
                    <div
                        ref={bodyContainerRef}
                        className="pktw-flex pktw-flex-col pktw-w-full pktw-max-w-none pktw-m-0 pktw-px-4 pktw-py-6 pktw-gap-0 pktw-box-border"
                    >
                {!activeConversation && !pendingConversation ? (
                    <div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]">
                        <div className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">Ready when you are.</div>
                    </div>
                ) : messagesToRender.length === 0 ? (
                    <div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]">
                        <div className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">Ready when you are.</div>
                    </div>
                ) : (
                    messagesToRender.map((item, index) => {
                        // Use existing message if available, otherwise create temporary one for streaming
                        const message: ChatMessage = item.message ?? {
                            id: item.id,
                            role: item.role,
                            content: item.streamingContent,
                            createdAtTimestamp: Date.now(),
                            createdAtZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            starred: false,
                            // todo replace with default model and provider
                            model: activeConversation?.meta.activeModel || 'gpt-4o',
                            provider: activeConversation?.meta.activeProvider || 'openai',
                        };

                        const isLastMessage = index === messagesToRender.length - 1;

                        return (
                            <MessageItem
                                key={item.id}
                                message={message}
                                activeConversation={activeConversation}
                                activeProject={activeProject}
                                isStreaming={item.isStreaming}
                                streamingContent={item.streamingContent}
                                isLastMessage={isLastMessage}
                                onScrollToBottom={scrollToBottom}
                            />
                        );
                    })
                )}
                    </div>
                </div>
            </div>

            {/* Footer - Input Area with scroll buttons */}
            <div className="pktw-flex-shrink-0 pktw-relative">
                {/* Scroll buttons - positioned above input area on the right */}
                <div className="pktw-absolute pktw-top-0 pktw-right-6 pktw-flex pktw-items-center pktw-gap-1 pktw-z-10" style={{ transform: 'translateY(-100%)', marginBottom: '8px' }}>
                    <IconButton
                        size="lg"
                        onClick={() => scrollToTop(false)}
                        title="Scroll to top"
                    >
                        <ArrowUp className="pktw-w-4 pktw-h-4" />
                    </IconButton>
                    <IconButton
                        size="lg"
                        onClick={() => scrollToBottom(false)}
                        title="Scroll to latest"
                    >
                        <ArrowDown className="pktw-w-4 pktw-h-4" />
                    </IconButton>
                </div>
                <ChatInputAreaComponent
                    onScrollToBottom={scrollToBottom}
                />
            </div>

            {/* Modals */}
            <SummaryModal />
        </div>
    );
};
