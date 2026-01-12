import React, { useEffect, useRef } from 'react';
import { useChatViewStore } from './store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/view/chat-view/store/messageStore';
import { OpenLinkEvent, ViewEventType } from '@/core/eventBus';
import { MessageHeader } from './components/messages/MessageViewHeader';
import { MessageListRenderer } from './components/messages/MessageListRenderer';
import { ChatInputAreaComponent } from './components/ChatInputArea';
import { FileChangesList } from './components/messages/FileChangesList';
import { SuggestionTags } from '../../component/prompt-input/SuggestionTags';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useScrollManager, scrollToBottom as scrollToBottomUtil } from '../shared/scroll-utils';
import { useAutoScroll } from './hooks/useAutoScroll';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { useChatSessionStore } from './store/chatSessionStore';
import { useChatSession } from './hooks';


/**
 * Main component for rendering and managing the messages list view
 */
export const MessagesViewComponent: React.FC = () => {
    const { app, eventBus } = useServiceContext();
    const pendingConversation = useChatViewStore().pendingConversation;
    const activeConversation = useProjectStore((state) => state.activeConversation);

    // Get computed session data from hook
    const {
        suggestionTags
    } = useChatSessionStore();

    const { handleSuggestionTagClick } = useChatSession();

    // Sync messages from activeConversation to messageStore
    const { setMessages, clearMessages } = useMessageStore();
    useEffect(() => {
        if (activeConversation?.messages) {
            setMessages(activeConversation.messages);
        } else {
            clearMessages();
        }
    }, [activeConversation?.meta.id, setMessages, clearMessages]);


    // Scroll management
    const bodyContainerRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);

    // Scroll management - all scroll logic centralized here
    const { scrollToTop, scrollToBottom } = useScrollManager({
        scrollRef: bodyScrollRef,
        containerRef: bodyScrollRef,
        eventBus,
        autoScrollOnMessagesChange: true,
        messagesCount: activeConversation?.messages.length,
        autoScrollOnStreaming: false, // Disable old streaming auto-scroll, handled by useAutoScroll
    });

    // Auto-scroll management for streaming content with user scroll detection
    const { resumeAutoScroll, isAutoScrollPaused } = useAutoScroll({
        scrollRef: bodyScrollRef,
        enabled: true,
        userScrollThreshold: 100,
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


    // Auto scroll to bottom when conversation is opened/changed
    useEffect(() => {
        if (!activeConversation) return;
        // Scroll to bottom when conversation changes
        scrollToBottomUtil(bodyScrollRef, true);
    }, [activeConversation?.meta.id]); // Scroll when conversation ID changes

    return (
        <div className="pktw-flex pktw-flex-col pktw-h-full pktw-relative pktw-overflow-hidden">

            {!activeConversation || pendingConversation ? (
                <div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]">
                    <div className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">Ready when you are.</div>
                </div>
            ) : null}

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
                <MessageListRenderer />

                {/* File Changes List - positioned after messages, before footer */}
                <FileChangesList />
            </div>

            {/* Footer Upper Area - positioned between body and footer, outside scroll area */}
            <div className="pktw-flex-shrink-0 pktw-flex pktw-justify-between pktw-items-center pktw-px-6 pktw-pt-6 pktw-border-b pktw-border-borde">
                {/* Tags on the left */}
                <SuggestionTags
                    tags={suggestionTags}
                    onTagClick={handleSuggestionTagClick}
                />

                {/* Scroll buttons on the right */}
                <div className="pktw-flex pktw-items-center pktw-gap-1">
                    <IconButton
                        size="lg"
                        onClick={() => scrollToTop(false)}
                        title="Scroll to top"
                        className="hover:pktw-bg-gray-200"
                    >
                        <ArrowUp className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground group-hover:pktw-text-black" />
                    </IconButton>
                    <IconButton
                        size="lg"
                        onClick={() => {
                            scrollToBottom(true);
                            resumeAutoScroll();
                        }}
                        title="Scroll to latest"
                        className="hover:pktw-bg-gray-200"
                    >
                        <ArrowDown className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground group-hover:pktw-text-black" />
                    </IconButton>
                </div>
            </div>

            {/* Footer - Input Area */}
            <div className="pktw-flex-shrink-0">
                <ChatInputAreaComponent />
            </div>

            {/* Modals */}
        </div>
    );
};
