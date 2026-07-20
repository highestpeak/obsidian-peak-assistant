import { useCallback, useEffect } from 'react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/core/config/settingsTypes';
import { getLLMOutputControlSettingKeys } from '@/core/providers/types';
import { normalizeModelSelection } from '@/core/types/chat-studio';

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
 * Conversation meta sync: pulls chatMode / attachment / outputControl / model
 * from the active conversation on switch, and writes store changes back to the
 * conversation. Mounted at the ChatView root so it runs for all chat sub-views.
 */
export const useChatSession = () => {
    const {
        setAttachmentHandlingMode,
        setLlmOutputControlSettings,
        setSelectedModel,
        setChatMode,
    } = useChatViewStore();

    const { manager } = useServiceContext();
    const activeConversation = useChatDataStore((state) => state.activeConversation);

    // Sync chatMode from conversation metadata when opening an existing conversation.
    //
    // 2026-07 F.B: mode routing was retired. `chatMode` now only survives on the
    // store for history restore — no downstream consumer branches on it. We still
    // hydrate the field from persisted `conversationType.kind` so old conversations
    // don't look like they lost state; new conversations always land as 'agent'.
    useEffect(() => {
        if (!activeConversation) return;
        const convKind = activeConversation.meta.conversationType?.kind;
        if (convKind === 'chat' || convKind === 'agent' || convKind === 'plan') {
            setChatMode(convKind);
        }
    }, [activeConversation?.meta.id, setChatMode]);

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

        // Model hydration (chat-studio §8.5 / RUN gate 2): the persisted
        // ModelSelection is the truth. Auto stays Auto — we do NOT hydrate a
        // concrete model into the store (the old flow wrote the hydrated model
        // back and silently destroyed the Auto choice). Fixed selections
        // hydrate the display store; persistence only happens through the
        // explicit model selector action, never as a hydration side effect.
        const selection = normalizeModelSelection(activeConversation.meta.modelSelection, {
            activeModel: activeConversation.meta.activeModel,
            activeProvider: activeConversation.meta.activeProvider,
        });
        if (selection.mode === 'fixed') {
            const providerKind = activeConversation.meta.activeProvider || selection.profileId;
            setSelectedModel(providerKind, selection.modelId);
        } else {
            useChatViewStore.getState().clearSelectedModel();
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
                    await manager.conv.updateConversationAttachmentHandling({
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
                await manager.conv.updateConversationOutputControl({
                    conversationId: String(convId),
                    outputControlOverride: Object.keys(override).length > 0 ? override : undefined,
                });

                // Reload meta only, preserving messages + staleness guard
                await reloadConversationMetaOnly(manager, convId);
            }
        );
        return () => unsubscribe();
    }, [manager, activeConversation]);

    // NOTE (chat-studio RUN gate 2): the legacy selectedModel→conversation
    // writeback subscription was removed. It persisted whatever hydration put
    // in the store, which turned every reload into a forced fixed-model write
    // and made Auto unrecoverable. Model persistence now flows exclusively
    // through ComposerModelSelector → updateConversationModelSelection.
};

