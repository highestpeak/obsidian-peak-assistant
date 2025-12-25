import React, { useEffect, useRef, useMemo } from 'react';
import { ChatMessage } from '@/service/chat/types';
import { useChatViewStore } from './store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/store/messageStore';
import { OpenLinkEvent, ViewEventType } from '@/core/eventBus';
import { SummaryModal } from './components/SummaryModal';
import { ResourcesModal } from './components/ResourcesModal';
import { MessageHeader } from './components/MessageViewHeader';
import { MessageItem } from './components/MessageViewItem';
import { ChatInputAreaComponent } from './components/ChatInputArea';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useScrollManager } from '../shared/scroll-utils';

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

    // Load full conversation data (with messages) when conversation is selected but doesn't have messages
    useEffect(() => {
        if (!activeConversation) return;

        // Check if conversation has messages loaded
        // If messages array is empty or undefined, we need to load the full conversation
        if (!activeConversation.messages || activeConversation.messages.length === 0) {
            (async () => {
                try {
                    // Load conversation with messages
                    const fullConversation = await manager.readConversation(activeConversation.meta.id, true);
                    // Update conversation in store
                    useProjectStore.getState().updateConversation(fullConversation);
                    useProjectStore.getState().setActiveConversation(fullConversation);
                } catch (error) {
                    console.error('[MessagesView] Failed to load conversation messages:', error);
                }
            })();
        }
    }, [activeConversation?.meta.id, manager]);

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

    // Clear streaming state when conversation changes
    useEffect(() => {
        const { clearStreaming } = useMessageStore.getState();
        clearStreaming();
    }, [activeConversation?.meta.id]);

    // Prepare messages list including streaming message if exists
    const messagesToRender = useMemo(() => {
        const result: Array<{ message?: ChatMessage; isStreaming: boolean; streamingContent: string; id: string; role: ChatMessage['role'] }> = [];

        if (activeConversation) {
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
        if (streamingMessageId && !activeConversation?.messages.find(m => m.id === streamingMessageId)) {
            result.push({
                isStreaming: true,
                streamingContent,
                id: streamingMessageId,
                role: 'assistant',
            });
        }

        return result;
    }, [activeConversation, streamingMessageId, streamingContent]);

    return (
        <div className="pktw-flex pktw-flex-col pktw-h-full pktw-relative pktw-overflow-hidden">
            {/* Header */}
            <div className="pktw-px-6 pktw-py-4 pktw-border-b pktw-border-border pktw-flex-shrink-0">
                <MessageHeader
                    onScrollToTop={() => scrollToTop(false)}
                    onScrollToBottom={() => scrollToBottom(false)}
                />
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
                    messagesToRender.map((item) => {
                        // Create a temporary message for streaming messages
                        const message: ChatMessage = item.message || {
                            id: item.id,
                            role: item.role,
                            content: item.streamingContent,
                            createdAtTimestamp: Date.now(),
                            createdAtZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            starred: false,
                            model: activeConversation?.meta.activeModel || 'gpt-4o',
                            provider: activeConversation?.meta.activeProvider || 'openai',
                        };

                        return (
                            <MessageItem
                                key={item.id}
                                message={message}
                                activeConversation={activeConversation}
                                activeProject={activeProject}
                                isStreaming={item.isStreaming}
                                streamingContent={item.streamingContent}
                                onScrollToBottom={scrollToBottom}
                            />
                        );
                    })
                )}
                    </div>
                </div>
            </div>

            {/* Footer - Input Area */}
            <div className="pktw-flex-shrink-0">
                <ChatInputAreaComponent
                    onScrollToBottom={scrollToBottom}
                />
            </div>

            {/* Modals */}
            <SummaryModal />
            <ResourcesModal />
        </div>
    );
};
