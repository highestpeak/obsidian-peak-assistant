import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { ChatMessage } from '@/service/chat/types';
import { useChatViewStore } from './store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/store/messageStore';
import { ScrollToMessageEvent, OpenLinkEvent, ViewEventType } from '@/core/eventBus';
import { SummaryModal } from './components/SummaryModal';
import { ResourcesModal } from './components/ResourcesModal';
import { MessageHeader } from './components/MessageViewHeader';
import { MessageItem } from './components/MessageViewItem';
import { ChatInputAreaComponent } from './components/ChatInputArea';
import { useServiceContext } from '@/ui/context/ServiceContext';

/**
 * Main component for rendering and managing the messages list view
 */
export const MessagesViewComponent: React.FC = () => {
	const { app, eventBus } = useServiceContext();
    const store = useChatViewStore();
    const activeConversation = useProjectStore((state) => state.activeConversation);
    const activeProject = useProjectStore((state) => state.activeProject);
    const pendingConversation = store.pendingConversation;
    const streamingMessageId = useMessageStore((state) => state.streamingMessageId);
    const streamingContent = useMessageStore((state) => state.streamingContent);

    const [pendingScrollMessageId, setPendingScrollMessageId] = useState<string | null>(null);

    const bodyContainerRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);

    // Scroll functions
    // Use requestAnimationFrame to ensure DOM has been updated and layout is complete
    // This is important when content is dynamically loaded or updated
    const scrollToTop = useCallback((instant: boolean = false) => {
        if (!bodyScrollRef.current) return;
        if (instant) {
            bodyScrollRef.current.scrollTop = 0;
            return;
        }
        // Double requestAnimationFrame ensures browser has completed all rendering
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                bodyScrollRef.current?.scrollTo({
                    top: 0,
                    behavior: 'smooth'
                });
            });
        });
    }, []);

    const scrollToBottom = useCallback((instant: boolean = false) => {
        if (!bodyScrollRef.current) return;
        if (instant) {
            bodyScrollRef.current.scrollTop = bodyScrollRef.current.scrollHeight;
            return;
        }
        // Double requestAnimationFrame ensures browser has completed all rendering
        // This is especially important for scrollHeight calculation when content is dynamic
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!bodyScrollRef.current) return;
                bodyScrollRef.current.scrollTo({
                    top: bodyScrollRef.current.scrollHeight,
                    behavior: 'smooth'
                });
            });
        });
    }, []);

    const scrollToMessage = useCallback((messageId: string, attempts = 3) => {
        if (!bodyContainerRef.current) return;
        const messageEl = bodyContainerRef.current.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
        if (messageEl) {
            messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Wait for scroll and DOM update, then apply highlight
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Find the message bubble within the message container
                    const messageBubble = messageEl.querySelector('[data-message-bubble]') as HTMLElement;
                    if (messageBubble) {
                        // Determine highlight color based on message role
                        const messageRole = messageEl.getAttribute('data-message-role');
                        const isUserMessage = messageRole === 'user';
                        
                        // User messages use red outline, assistant messages use accent color
                        const outlineClasses = isUserMessage
                            ? ['pktw-outline', 'pktw-outline-2', 'pktw-outline-red-500', 'pktw-outline-offset-0']
                            : ['pktw-outline', 'pktw-outline-2', 'pktw-outline-[var(--interactive-accent)]', 'pktw-outline-offset-0'];
                        
                        messageBubble.classList.add(...outlineClasses);
                        setTimeout(() => {
                            messageBubble.classList.remove(...outlineClasses);
                        }, 800);
                    }
                });
            });
            return;
        }

        if (attempts > 0) {
            setTimeout(() => {
                scrollToMessage(messageId, attempts - 1);
            }, 60);
        }
    }, []);

    // Scroll to bottom - when streaming content changes
    useEffect(() => {
        if (streamingContent) {
            scrollToBottom();
        }
    }, [streamingContent, scrollToBottom]);

    // scroll to message - Listen to scroll to message events
    useEffect(() => {
        if (!eventBus) return;

        const unsubscribeScroll = eventBus.on<ScrollToMessageEvent>(
            ViewEventType.SCROLL_TO_MESSAGE,
            (event) => {
                setPendingScrollMessageId(event.messageId);
            }
        );

        const unsubscribeOpenLink = eventBus.on<OpenLinkEvent>(
            ViewEventType.OPEN_LINK,
            async (event) => {
                await app.workspace.openLinkText(event.path, '', true);
            }
        );

        return () => {
            unsubscribeScroll();
            unsubscribeOpenLink();
        };
    }, [eventBus, app]);

    // scroll to message - Apply pending scroll when message is available
    useEffect(() => {
        if (!pendingScrollMessageId) return;

        // Wait for message to render, then scroll
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                scrollToMessage(pendingScrollMessageId);
                setPendingScrollMessageId(null);
            });
        });
    }, [pendingScrollMessageId, scrollToMessage]);

    // Scroll to bottom after messages render
    useEffect(() => {
        if (activeConversation && activeConversation.messages.length > 0) {
            scrollToBottom();
        }
    }, [activeConversation?.messages.length, scrollToBottom]);


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
                            attachments: [],
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
