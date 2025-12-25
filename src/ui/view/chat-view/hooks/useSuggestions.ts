import { useState, useEffect } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useProjectStore } from '@/ui/store/projectStore';
import { DEFAULT_CHAT_SUGGESTIONS } from '@/core/constant';

/**
 * Generate suggestions based on system settings, project context, and conversation history
 */
export function useSuggestions(): string[] {
	const { manager } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const [suggestions, setSuggestions] = useState<string[]>([]);

	useEffect(() => {
		const generateSuggestions = async () => {
			try {
				const defaultSuggestions: string[] = [];

				// Add project-specific suggestions if available
				if (activeProject?.meta.name) {
					defaultSuggestions.push(`Tell me about ${activeProject.meta.name}`);
					defaultSuggestions.push(`What are the key points in ${activeProject.meta.name}?`);
				}

				// Add conversation-specific suggestions based on recent messages
				if (activeConversation && activeConversation.messages.length > 0) {
					const lastMessage = activeConversation.messages[activeConversation.messages.length - 1];
					if (lastMessage.role === 'assistant') {
						// Suggest follow-up questions
						defaultSuggestions.push('Can you explain more?');
						defaultSuggestions.push('Give me an example');
					}
				}

				// Get system settings for context
				const settings = manager.getSettings();
				
				// Add general suggestions from constants
				const generalSuggestions = [...DEFAULT_CHAT_SUGGESTIONS];

				// Fill remaining slots with general suggestions
				while (defaultSuggestions.length < 4 && generalSuggestions.length > 0) {
					const suggestion = generalSuggestions.shift();
					if (suggestion && !defaultSuggestions.includes(suggestion)) {
						defaultSuggestions.push(suggestion);
					}
				}

				// Limit to 4 suggestions
				setSuggestions(defaultSuggestions.slice(0, 4));
			} catch (error) {
				console.warn('[useSuggestions] Failed to generate suggestions:', error);
				// Fallback to default suggestions
				setSuggestions(DEFAULT_CHAT_SUGGESTIONS.slice(0, 4));
			}
		};

		generateSuggestions();
	}, [manager, activeProject?.meta.id, activeConversation?.meta.id]);

	return suggestions;
}

