import { useCallback, useEffect } from 'react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { getLLMOutputControlSettingKeys } from '@/core/providers/types';

/**
 * Reload conversation meta only (no messages), preserving existing messages.
 * Returns early if the active conversation has changed since the call started (staleness guard).
 */
async function reloadConversationMetaOnly(
    manager: ReturnType<typeof useServiceContext>['manager'],
    expectedConvId: string,
) {
    const currentActive = useChatDataStore.getState().activeConversation;
    if (currentActive?.meta.id !== expectedConvId) return; // stale — conversation switched

    const updatedConv = await manager.readConversation(expectedConvId, false);
    if (!updatedConv) return;

    // Re-check after await — conversation may have switched during the async gap
    const stillActive = useChatDataStore.getState().activeConversation;
    if (stillActive?.meta.id !== expectedConvId) return;

    // Preserve existing messages (readConversation(id, false) returns messages: [])
    updatedConv.messages = stillActive.messages;

    useChatDataStore.getState().setActiveConversation(updatedConv);
    useChatDataStore.getState().updateConversation(updatedConv);
}

/**
 * Every Chat Conversation is considered as a Chat Session.
 * Provides access to chat session data from the store.
 */
export const useChatSession = () => {
    const {
        fileChanges,
        promptsSuggest,
        suggestionTags,

        setAttachmentHandlingMode,
        setLlmOutputControlSettings,
        setSelectedModel
    } = useChatViewStore();

    const { manager } = useServiceContext();
    const activeConversation = useChatDataStore((state) => state.activeConversation);

    // Initialize attachment handling mode from active conversation
    useEffect(() => {
        if (!activeConversation) {
            return;
        }
        const effectiveMode = activeConversation.meta.attachmentHandlingOverride ?? manager.getSettings().attachmentHandlingDefault ?? DEFAULT_AI_SERVICE_SETTINGS.attachmentHandlingDefault!;
        setAttachmentHandlingMode(effectiveMode);

        // Priority: conversation override > global default
        const globalDefault = manager.getSettings().defaultOutputControl || {};
        const override = activeConversation?.meta.outputControlOverride || {};
        setLlmOutputControlSettings({ ...globalDefault, ...override });

        // Priority: conversation model > default model
        const globalDefaultModel = manager?.getSettings().defaultModel;
        const overrideModel = activeConversation?.meta.activeModel ? {
            provider: activeConversation.meta.activeProvider || globalDefaultModel?.provider || DEFAULT_AI_SERVICE_SETTINGS.defaultModel.provider!,
            modelId: activeConversation.meta.activeModel || globalDefaultModel?.modelId || DEFAULT_AI_SERVICE_SETTINGS.defaultModel.modelId!,
        } : undefined;
        if (overrideModel) {
            setSelectedModel(overrideModel.provider, overrideModel.modelId);
        } else if (globalDefaultModel) {
            setSelectedModel(globalDefaultModel.provider, globalDefaultModel.modelId);
        }
    }, [activeConversation, manager, setAttachmentHandlingMode, setLlmOutputControlSettings, setSelectedModel]);

    // Listen to attachmentHandlingMode changes in the store and update manager/backend when changed
    useEffect(() => {
        const unsubscribe = useChatViewStore.subscribe(
            async (state, prevState) => {
                if (state.attachmentHandlingMode === prevState.attachmentHandlingMode) {
                    return;
                }
                const mode = state.attachmentHandlingMode;
                if (activeConversation) {
                    await manager.updateConversationAttachmentHandling({
                        conversationId: activeConversation.meta.id,
                        attachmentHandlingOverride: mode,
                    });
                }
            }
        );
        return () => unsubscribe();
    }, [manager, activeConversation]);

    // Listen to llmOutputControlSettings changes in the store and update manager/backend when changed
    useEffect(() => {
        const unsubscribe = useChatViewStore.subscribe(
            async (state, prevState) => {
                if (state.llmOutputControlSettings === prevState.llmOutputControlSettings) {
                    return;
                }
                if (!activeConversation) {
                    return;
                }
                const settings = state.llmOutputControlSettings;
                // Get global default settings
                const globalDefault = manager.getSettings().defaultOutputControl || {};

                // Calculate override: only include values that differ from global default
                const override: Record<string, any> = {};
                const allKeys = getLLMOutputControlSettingKeys();

                for (const key of allKeys) {
                    const settingValue = settings[key];
                    const defaultValue = globalDefault[key];
                    // Include in override if value is set and different from default
                    if (settingValue !== undefined && settingValue !== defaultValue) {
                        override[key] = settingValue;
                    }
                }

                const convId = activeConversation.meta.id;

                // Update conversation meta with override (empty object means no override)
                await manager.updateConversationOutputControl({
                    conversationId: String(convId),
                    outputControlOverride: Object.keys(override).length > 0 ? override : undefined,
                });

                // Reload meta only, preserving messages + staleness guard
                await reloadConversationMetaOnly(manager, convId);
            }
        );
        return () => unsubscribe();
    }, [manager, activeConversation]);

    useEffect(() => {
        const unsubscribe = useChatViewStore.subscribe(
            async (state, prevState) => {
                if (state.selectedModel === prevState.selectedModel) {
                    return;
                }
                if (!activeConversation) {
                    return;
                }

                // Update conversation model
                await manager.updateConversationModel({
                    conversationId: activeConversation.meta.id,
                    modelId: state.selectedModel?.modelId!,
                    provider: state.selectedModel?.provider!,
                });

                // Reload meta only, preserving messages + staleness guard
                await reloadConversationMetaOnly(manager, activeConversation.meta.id);
            }
        );
        return () => unsubscribe();
    }, [manager, activeConversation]);

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
        handleSuggestionTagClick,
    };
};

