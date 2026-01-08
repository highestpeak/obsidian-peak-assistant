import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../../view/chat-view/store/chatViewStore';
import type { LLMOutputControlSettings } from '@/core/providers/types';
import { getLLMOutputControlSettingKeys } from '@/core/providers/types';
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/component/shared-ui/popover';
import { Settings2 } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { OutputControlSettingsList } from '@/ui/component/mine/LLMOutputControlSettings';
import { HoverButton } from '@/ui/component/mine';

/**
 * LLM output control settings component.
 * Displays a popover with settings for temperature, topP, topK, presencePenalty, frequencyPenalty.
 */
export const LLMOutputControlSettingsPopover: React.FC = () => {
	const { manager } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);

	// Get current settings: conversation override + global default (merged)
	// Use primitive values as dependencies, but get latest values from store inside useMemo
	// to avoid stale closure issues while preventing circular reference problems.
	const conversationId = activeConversation?.meta.id;
	const outputControlOverride = activeConversation?.meta.outputControlOverride;
	
	const currentSettings = useMemo<LLMOutputControlSettings>(() => {
		// Get latest values from store to avoid stale closure
		const latestActiveConversation = useProjectStore.getState().activeConversation;
		if (!manager || !latestActiveConversation) return {};

		// Start with global default settings
		const globalDefault = manager.getSettings().defaultOutputControl || {};
		
		// Merge with conversation override (override takes priority)
		const override = latestActiveConversation.meta.outputControlOverride || {};
		
		return { ...globalDefault, ...override };
	}, [conversationId, outputControlOverride]);


	// Use conversation ID as dependency, but get latest values from store inside callback
	// to avoid stale closure issues while preventing circular reference problems.
	const saveSettings = useCallback(
		async (settings: LLMOutputControlSettings) => {
			// Get latest values from store to avoid stale closure
			const latestActiveConversation = useProjectStore.getState().activeConversation;
			if (!manager || !latestActiveConversation) return;

			// Get global default settings
			const globalDefault = manager.getSettings().defaultOutputControl || {};
			
			// Calculate override: only include values that differ from global default
			const override: LLMOutputControlSettings = {};
			const allKeys = getLLMOutputControlSettingKeys();

			for (const key of allKeys) {
				const settingValue = settings[key];
				const defaultValue = globalDefault[key];
				// Include in override if value is set and different from default
				if (settingValue !== undefined && settingValue !== defaultValue) {
					override[key] = settingValue as any;
				}
			}

			const convId = latestActiveConversation.meta.id;
			
			// Update conversation meta with override (empty object means no override)
			await manager.updateConversationOutputControl({
				conversationId: String(convId),
				outputControlOverride: Object.keys(override).length > 0 ? override : undefined,
			});

			// Reload conversation to get updated meta
			const updatedConv = await manager.readConversation(convId, false);
			if (updatedConv) {
				useProjectStore.getState().setActiveConversation(updatedConv);
				useProjectStore.getState().updateConversation(updatedConv);
				useChatViewStore.getState().setConversation(updatedConv);
			}
		},
		[conversationId]
	);

	return (
		<HoverButton
			icon={Settings2}
			menuId="output-control-settings"
			menuClassName="pktw-w-[560px] pktw-p-1 pktw-bg-white pktw-border pktw-z-50"
			hoverMenuContent={
				<OutputControlSettingsList
					settings={currentSettings}
					onChange={saveSettings}
					variant="compact"
					useLocalState={true}
				/>
			}
		/>
	);
};

