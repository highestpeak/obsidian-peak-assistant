import { useCallback } from 'react';
import { useChatSessionStore } from '../store/chatSessionStore';

/**
 * Every Chat Conversation is considered as a Chat Session.
 * Provides access to chat session data from the store.
 */
export const useChatSession = () => {
    const {
        fileChanges,
        promptsSuggest,
        suggestionTags
    } = useChatSessionStore();

    // Suggestion tag handlers
    const handleSuggestionTagClick = useCallback((tagType: string) => {
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

    return {
        fileChanges,
        promptsSuggest,
        suggestionTags,
        handleSuggestionTagClick
    };
};

