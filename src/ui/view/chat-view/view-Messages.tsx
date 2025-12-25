import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import { ChatMessage, ChatConversation, ChatProject } from '@/service/chat/types';
import { useChatViewStore } from './store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/store/messageStore';
import { OpenLinkEvent, ViewEventType } from '@/core/eventBus';
import { SummaryModal } from './components/SummaryModal';
import { ResourcesModal } from './components/ResourcesModal';
import { MessageHeader } from './components/MessageViewHeader';
import { ChatInputAreaComponent } from './components/ChatInputArea';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useScrollManager } from '../shared/scroll-utils';
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
	Message,
	MessageBranch,
	MessageBranchContent,
	MessageBranchSelector,
	MessageContent,
	MessageResponse,
	MessageActions,
	MessageAction,
	Sources,
	SourcesTrigger,
	SourcesContent,
	Source,
	Reasoning,
	ReasoningTrigger,
	ReasoningContent,
	Suggestions,
	Suggestion,
} from '@/ui/component/ai-elements';
import { Star, Copy, RefreshCw } from 'lucide-react';
import { useSuggestions } from './hooks/useSuggestions';

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
    const suggestions = useSuggestions();

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

    // Handle message actions
    const handleToggleStar = useCallback(async (messageId: string, starred: boolean) => {
        if (!activeConversation) return;
        const updatedConv = await manager.toggleStar({
            messageId,
            conversation: activeConversation,
            project: activeProject,
            starred,
        });
        useChatViewStore.getState().setConversation(updatedConv);
    }, [activeConversation, activeProject, manager]);

    const handleRegenerate = useCallback(async (messageId: string) => {
        if (!activeConversation) return;
        
        const messageIndex = activeConversation.messages.findIndex(m => m.id === messageId);
        if (messageIndex === -1 || messageIndex === 0) return;
        
        const assistantMessage = activeConversation.messages[messageIndex];
        if (assistantMessage.role !== 'assistant') return;
        
        let userMessageIndex = -1;
        for (let i = messageIndex - 1; i >= 0; i--) {
            if (activeConversation.messages[i].role === 'user') {
                userMessageIndex = i;
                break;
            }
        }
        
        if (userMessageIndex === -1) return;
        
        const userMessage = activeConversation.messages[userMessageIndex];
        
        try {
            const result = await manager.blockChat({
                conversation: activeConversation,
                project: activeProject,
                userContent: userMessage.content,
            });
            useChatViewStore.getState().setConversation(result.conversation);
            scrollToBottom();
        } catch (error) {
            console.error('Failed to regenerate message:', error);
        }
    }, [activeConversation, activeProject, manager, scrollToBottom]);

    return (
        <div className="pktw-flex pktw-flex-col pktw-h-full pktw-relative pktw-overflow-hidden">
            {/* Header */}
            <div className="pktw-px-6 pktw-py-4 pktw-border-b pktw-border-border pktw-flex-shrink-0">
                <MessageHeader
                    onScrollToTop={() => scrollToTop(false)}
                    onScrollToBottom={() => scrollToBottom(false)}
                />
            </div>

            {/* Body - Messages List using new component structure */}
            <Conversation>
                <ConversationContent>
                {(!activeConversation && !pendingConversation) || messagesToRender.length === 0 ? (
                    <>
                        <div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]">
                            <div className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">
                                Ready when you are.
                            </div>
                        </div>
                        {/* Suggestions when no messages */}
                        {suggestions.length > 0 && (
                            <Suggestions className="pktw-px-4">
                                {suggestions.map((suggestion, index) => (
                                    <Suggestion
                                        key={index}
                                        suggestion={suggestion}
                                        onClick={(suggestion) => {
                                            // Set input value when suggestion is clicked
                                            const inputArea = document.querySelector('textarea[name="message"]') as HTMLTextAreaElement;
                                            if (inputArea) {
                                                inputArea.value = suggestion;
                                                inputArea.dispatchEvent(new Event('input', { bubbles: true }));
                                                inputArea.focus();
                                            }
                                        }}
                                    />
                                ))}
                            </Suggestions>
                        )}
                    </>
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

                            const messageRole = message.role as 'user' | 'assistant' | 'system';
                            const displayContent = item.isStreaming ? item.streamingContent : message.content;

                            // Extract sources from resources if available
                            const sources = message.resources?.map((resource) => ({
                                href: resource.source,
                                title: resource.source.split('/').pop() || resource.source,
                            }));

                        return (
                                <MessageBranch key={item.id} defaultBranch={0}>
                                    <MessageBranchContent>
                                        <Message from={messageRole}>
                                            {/* Sources */}
                                            {sources && sources.length > 0 && (
                                                <Sources>
                                                    <SourcesTrigger count={sources.length} />
                                                    <SourcesContent>
                                                        {sources.map((source) => (
                                                            <Source
                                                                href={source.href}
                                                                key={source.href}
                                                                title={source.title}
                                                            />
                                                        ))}
                                                    </SourcesContent>
                                                </Sources>
                                            )}

                                            {/* Reasoning/Thinking */}
                                            {message.thinking && (
                                                <Reasoning>
                                                    <ReasoningTrigger />
                                                    <ReasoningContent>{message.thinking}</ReasoningContent>
                                                </Reasoning>
                                            )}

                                            {/* Message Content */}
                                            <MessageContent>
                                                <MessageResponse>{displayContent}</MessageResponse>
                                            </MessageContent>

                                            {/* Message Actions (only show when not streaming) */}
                                            {!item.isStreaming && (
                                                <MessageActions>
                                                    <MessageAction
                                                        tooltip={message.starred ? 'Unstar message' : 'Star message'}
                                                        onClick={() => handleToggleStar(message.id, !message.starred)}
                                                    >
                                                        <Star size={14} fill={message.starred ? 'currentColor' : 'none'} />
                                                    </MessageAction>
                                                    <MessageAction
                                                        tooltip="Copy message"
                                                        onClick={async () => {
                                                            try {
                                                                await navigator.clipboard.writeText(message.content);
                                                            } catch (err) {
                                                                console.error('Failed to copy:', err);
                                                            }
                                                        }}
                                                    >
                                                        <Copy size={14} />
                                                    </MessageAction>
                                                    {message.role === 'assistant' && (
                                                        <MessageAction
                                                            tooltip="Regenerate response"
                                                            onClick={() => handleRegenerate(message.id)}
                                                        >
                                                            <RefreshCw size={14} />
                                                        </MessageAction>
                                                    )}
                                                </MessageActions>
                                            )}
                                        </Message>
                                    </MessageBranchContent>

                                    {/* Branch Selector (for future multi-version support) */}
                                    <MessageBranchSelector from={messageRole} />
                                </MessageBranch>
                        );
                    })
                )}
                </ConversationContent>
                <ConversationScrollButton />
            </Conversation>

            {/* Footer - Input Area */}
            <div className="pktw-flex-shrink-0">
                <ChatInputAreaComponent onScrollToBottom={scrollToBottom} />
            </div>

            {/* Modals */}
            <SummaryModal />
            <ResourcesModal />
        </div>
    );
};
