import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { ChatMessage } from '@/service/chat/types';
import { useChatViewStore } from './store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/view/chat-view/store/messageStore';
import { OpenLinkEvent, ViewEventType } from '@/core/eventBus';
import { SummaryModal } from './components/SummaryModal';
import { MessageHeader } from './components/MessageViewHeader';
import { MessageItem } from './components/MessageViewItem';
import { ChatInputAreaComponent } from './components/ChatInputArea';
import { FileChangesList } from './components/FileChangesList';
import { SuggestionTags, SuggestionTag } from '../../component/prompt-input/SuggestionTags';
import { FileChange } from '@/service/chat/types';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useScrollManager, scrollToBottom as scrollToBottomUtil } from '../shared/scroll-utils';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { ExternalPromptInfo } from '@/ui/component/prompt-input/menu/PromptMenu';

/**
 * Mock prompt data for testing
 */
const mockPrompts: ExternalPromptInfo[] = [
	{
		promptId: 'chat-general',
		promptNameForDisplay: 'General Chat',
		promptCategory: 'chat',
		promptDesc: 'General conversation and discussion'
	},
    {
		promptId: 'chat-general2',
		promptNameForDisplay: 'General Chat 2 Test',
		promptCategory: 'chat',
		promptDesc: 'General conversation and discussion 2 test General conversation and discussion 2 test General conversation and discussion 2 test '
	},
	{
		promptId: 'search-web',
		promptNameForDisplay: 'Web Search',
		promptCategory: 'search',
		promptDesc: 'Search and retrieve information from the web'
	},
	{
		promptId: 'code-review',
		promptNameForDisplay: 'Code Review',
		promptCategory: 'app',
		promptDesc: 'Review and analyze code for improvements'
	},
	{
		promptId: 'document-summary',
		promptNameForDisplay: 'Document Summary',
		promptCategory: 'document',
		promptDesc: 'Summarize documents and extract key points'
	},
	{
		promptId: 'creative-writing',
		promptNameForDisplay: 'Creative Writing',
		promptCategory: 'creative',
		promptDesc: 'Assist with creative writing and storytelling'
	},
	{
		promptId: 'data-analysis',
		promptNameForDisplay: 'Data Analysis',
		promptCategory: 'analysis',
		promptDesc: 'Analyze data and provide insights'
	},
	{
		promptId: 'learning-plan',
		promptNameForDisplay: 'Learning Plan',
		promptCategory: 'education',
		promptDesc: 'Create personalized learning plans'
	},
	{
		promptId: 'problem-solving',
		promptNameForDisplay: 'Problem Solving',
		promptCategory: 'logic',
		promptDesc: 'Help solve complex problems step by step'
	}
];

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

    // Reasoning state
    const reasoningContent = useMessageStore((state) => state.reasoningContent);
    const isReasoningActive = useMessageStore((state) => state.isReasoningActive);

    // Tool state
    const currentToolCalls = useMessageStore((state) => state.currentToolCalls);
    const isToolSequenceActive = useMessageStore((state) => state.isToolSequenceActive);

    const bodyContainerRef = useRef<HTMLDivElement>(null);
    const bodyScrollRef = useRef<HTMLDivElement>(null);

    // File changes state - mock data for development
    const [fileChanges, setFileChanges] = useState<FileChange[]>([
        {
            id: '1',
            filePath: 'src/components/Button.tsx',
            addedLines: 21,
            removedLines: 33,
            accepted: false,
            extension: 'tsx'
        },
        {
            id: '2',
            filePath: 'src/utils/helpers.ts',
            addedLines: 5,
            removedLines: 2,
            accepted: false,
            extension: 'ts'
        },
        {
            id: '3',
            filePath: 'src/styles/main.css',
            addedLines: 10,
            removedLines: 15,
            accepted: false,
            extension: 'css'
        },
        {
            id: '4',
            filePath: 'README.md',
            addedLines: 3,
            removedLines: 1,
            accepted: false,
            extension: 'md'
        },
        {
            id: '5',
            filePath: 'package.json',
            addedLines: 2,
            removedLines: 0,
            accepted: false,
            extension: 'json'
        },
        {
            id: '6',
            filePath: 'src/hooks/useAuth.ts',
            addedLines: 45,
            removedLines: 12,
            accepted: false,
            extension: 'ts'
        },
        {
            id: '7',
            filePath: 'public/images/logo.png',
            addedLines: 0,
            removedLines: 0,
            accepted: false,
            extension: 'png'
        },
        {
            id: '8',
            filePath: 'src/types/api.ts',
            addedLines: 8,
            removedLines: 3,
            accepted: false,
            extension: 'ts'
        },
        {
            id: '9',
            filePath: '.gitignore',
            addedLines: 1,
            removedLines: 0,
            accepted: false,
            extension: 'gitignore'
        },
        {
            id: '10',
            filePath: 'src/components/forms/InputField.tsx',
            addedLines: 67,
            removedLines: 23,
            accepted: false,
            extension: 'tsx'
        },
        {
            id: '11',
            filePath: 'src/services/authService.ts',
            addedLines: 12,
            removedLines: 8,
            accepted: false,
            extension: 'ts'
        },
        {
            id: '12',
            filePath: 'tailwind.config.js',
            addedLines: 5,
            removedLines: 2,
            accepted: false,
            extension: 'js'
        },
        {
            id: '13',
            filePath: 'src/pages/dashboard/Dashboard.tsx',
            addedLines: 89,
            removedLines: 34,
            accepted: false,
            extension: 'tsx'
        },
        {
            id: '14',
            filePath: 'src/utils/date-utils.ts',
            addedLines: 0,
            removedLines: 5,
            accepted: false,
            extension: 'ts'
        },
        {
            id: '15',
            filePath: 'src/styles/components/_buttons.scss',
            addedLines: 15,
            removedLines: 7,
            accepted: false,
            extension: 'scss'
        },
        {
            id: '16',
            filePath: 'docker-compose.yml',
            addedLines: 3,
            removedLines: 1,
            accepted: false,
            extension: 'yml'
        },
        {
            id: '17',
            filePath: 'src/components/icons/SvgIcon.tsx',
            addedLines: 28,
            removedLines: 0,
            accepted: false,
            extension: 'tsx'
        },
        {
            id: '18',
            filePath: 'jest.config.js',
            addedLines: 4,
            removedLines: 2,
            accepted: false,
            extension: 'js'
        },
        {
            id: '19',
            filePath: 'src/hooks/useLocalStorage.ts',
            addedLines: 0,
            removedLines: 18,
            accepted: false,
            extension: 'ts'
        },
        {
            id: '20',
            filePath: 'public/favicon.ico',
            addedLines: 0,
            removedLines: 0,
            accepted: false,
            extension: 'ico'
        },
        {
            id: '21',
            filePath: 'src/constants/config.ts',
            addedLines: 6,
            removedLines: 3,
            accepted: false,
            extension: 'ts'
        },
        {
            id: '22',
            filePath: 'src/components/layout/Header.tsx',
            addedLines: 42,
            removedLines: 16,
            accepted: false,
            extension: 'tsx'
        }
    ]);


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

    // File changes handlers
    const handleAcceptAll = useCallback(() => {
        setFileChanges(prev => prev.map(change => ({ ...change, accepted: true })));
    }, []);

    const handleDiscardAll = useCallback(() => {
        setFileChanges(prev => prev.map(change => ({ ...change, accepted: false })));
    }, []);

    const handleAcceptChange = useCallback((id: string) => {
        setFileChanges(prev => prev.map(change =>
            change.id === id ? { ...change, accepted: true } : change
        ));
    }, []);

    const handleDiscardChange = useCallback((id: string) => {
        setFileChanges(prev => prev.map(change =>
            change.id === id ? { ...change, accepted: false } : change
        ));
    }, []);

    // Suggestion tag data
    const suggestionTags: SuggestionTag[] = [
        {
            id: 'transfer',
            label: 'Transfer To Project',
            color: 'blue',
            tooltip: 'Move this conversation to a project',
            action: 'transfer'
        },
        {
            id: 'update',
            label: 'Update Articles',
            color: 'green',
            tooltip: 'Update related articles in the knowledge base',
            action: 'update'
        },
        {
            id: 'review',
            label: 'Code Review',
            color: 'purple',
            tooltip: 'Request code review for changes',
            action: 'review'
        }
    ];

    // Suggestion tag handlers
    const handleTagClick = useCallback((tagType: string) => {
        console.log('Tag clicked:', tagType);
        // TODO: Implement actual tag actions
        switch (tagType) {
            case 'transfer':
                // Handle transfer to project
                break;
            case 'update':
                // Handle update articles
                break;
            case 'review':
                // Handle code review
                break;
        }
    }, []);

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
                                reasoningContent={item.isStreaming ? reasoningContent : (message.reasoning ? message.reasoning.content : '')}
                                isReasoningActive={item.isStreaming ? isReasoningActive : false}
                                currentToolCalls={item.isStreaming ? currentToolCalls : (message.toolCalls || [])}
                                isToolSequenceActive={item.isStreaming ? isToolSequenceActive : false}
                                isLastMessage={isLastMessage}
                                onScrollToBottom={scrollToBottom}
                            />
                        );
                    })
                )}
                    </div>
                </div>

                {/* File Changes List - positioned after messages, before footer */}
                <FileChangesList
                    changes={fileChanges}
                    onAcceptAll={handleAcceptAll}
                    onDiscardAll={handleDiscardAll}
                    onAcceptChange={handleAcceptChange}
                    onDiscardChange={handleDiscardChange}
                />
            </div>

            {/* Scroll buttons - positioned between body and footer, outside scroll area */}
            <div className="pktw-flex-shrink-0 pktw-flex pktw-justify-between pktw-items-center pktw-px-6 pktw-pt-6 pktw-border-b pktw-border-borde">
                {/* Tags on the left */}
                <SuggestionTags
                    tags={suggestionTags}
                    onTagClick={handleTagClick}
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
                        onClick={() => scrollToBottom(false)}
                        title="Scroll to latest"
                        className="hover:pktw-bg-gray-200"
                    >
                        <ArrowDown className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground group-hover:pktw-text-black" />
                    </IconButton>
                </div>
            </div>

            {/* Footer - Input Area */}
            <div className="pktw-flex-shrink-0">
                <ChatInputAreaComponent
                    prompts={mockPrompts}
                    onScrollToBottom={scrollToBottom}
                />
            </div>

            {/* Modals */}
            <SummaryModal />
        </div>
    );
};
