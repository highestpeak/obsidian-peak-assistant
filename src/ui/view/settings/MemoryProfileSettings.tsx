import React, { useState, useCallback, useEffect } from 'react';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { AIServiceManager } from '@/service/chat/service-manager';
import { cn } from '@/ui/react/lib/utils';
import { Input } from '@/ui/component/shared-ui/input';

interface MemoryProfileSettingsProps {
	settings: AIServiceSettings;
	aiServiceManager: AIServiceManager;
	onUpdate: (updates: Partial<AIServiceSettings>) => Promise<void>;
}

/**
 * React component for Memory and Profile settings.
 */
export function MemoryProfileSettingsComponent({ settings, aiServiceManager, onUpdate }: MemoryProfileSettingsProps) {
	const [memoryEnabled, setMemoryEnabled] = useState(
		settings.memoryEnabled ?? DEFAULT_AI_SERVICE_SETTINGS.memoryEnabled ?? true
	);
	const [memoryFilePath, setMemoryFilePath] = useState(
		settings.memoryFilePath || DEFAULT_AI_SERVICE_SETTINGS.memoryFilePath || 'ChatFolder/User-Memory.md'
	);
	const [profileEnabled, setProfileEnabled] = useState(
		settings.profileEnabled ?? DEFAULT_AI_SERVICE_SETTINGS.profileEnabled ?? true
	);
	const [profileFilePath, setProfileFilePath] = useState(
		settings.profileFilePath || DEFAULT_AI_SERVICE_SETTINGS.profileFilePath || 'ChatFolder/User-Profile.md'
	);
	const [promptRewriteEnabled, setPromptRewriteEnabled] = useState(
		settings.promptRewriteEnabled ?? DEFAULT_AI_SERVICE_SETTINGS.promptRewriteEnabled ?? false
	);

	// Sync state with settings when they change externally
	useEffect(() => {
		setMemoryEnabled(settings.memoryEnabled ?? DEFAULT_AI_SERVICE_SETTINGS.memoryEnabled ?? true);
		setMemoryFilePath(settings.memoryFilePath || DEFAULT_AI_SERVICE_SETTINGS.memoryFilePath || 'ChatFolder/User-Memory.md');
		setProfileEnabled(settings.profileEnabled ?? DEFAULT_AI_SERVICE_SETTINGS.profileEnabled ?? true);
		setProfileFilePath(settings.profileFilePath || DEFAULT_AI_SERVICE_SETTINGS.profileFilePath || 'ChatFolder/User-Profile.md');
		setPromptRewriteEnabled(settings.promptRewriteEnabled ?? DEFAULT_AI_SERVICE_SETTINGS.promptRewriteEnabled ?? false);
	}, [settings]);

	const handleMemoryEnabledChange = useCallback(async (value: boolean) => {
		setMemoryEnabled(value);
		await onUpdate({ memoryEnabled: value });
		aiServiceManager?.updateSettings({ ...settings, memoryEnabled: value });
		aiServiceManager?.refreshDefaultServices();
		await aiServiceManager?.init();
	}, [settings, aiServiceManager, onUpdate]);

	const handleMemoryFilePathChange = useCallback(async (value: string) => {
		const next = value?.trim() || DEFAULT_AI_SERVICE_SETTINGS.memoryFilePath || 'ChatFolder/User-Memory.md';
		setMemoryFilePath(next);
		await onUpdate({ memoryFilePath: next });
		aiServiceManager?.updateSettings({ ...settings, memoryFilePath: next });
		aiServiceManager?.refreshDefaultServices();
		await aiServiceManager?.init();
	}, [settings, aiServiceManager, onUpdate]);

	const handleProfileEnabledChange = useCallback(async (value: boolean) => {
		setProfileEnabled(value);
		await onUpdate({ profileEnabled: value });
		aiServiceManager?.updateSettings({ ...settings, profileEnabled: value });
		aiServiceManager?.refreshDefaultServices();
		await aiServiceManager?.init();
	}, [settings, aiServiceManager, onUpdate]);

	const handleProfileFilePathChange = useCallback(async (value: string) => {
		const next = value?.trim() || DEFAULT_AI_SERVICE_SETTINGS.profileFilePath || 'ChatFolder/User-Profile.md';
		setProfileFilePath(next);
		await onUpdate({ profileFilePath: next });
		aiServiceManager?.updateSettings({ ...settings, profileFilePath: next });
		aiServiceManager?.refreshDefaultServices();
		await aiServiceManager?.init();
	}, [settings, aiServiceManager, onUpdate]);

	const handlePromptRewriteEnabledChange = useCallback(async (value: boolean) => {
		setPromptRewriteEnabled(value);
		await onUpdate({ promptRewriteEnabled: value });
	}, [onUpdate]);

	return (
		<div className="pktw-space-y-6">
			{/* Memory Settings */}
			<div className="pktw-space-y-4">
				<div className="pktw-flex pktw-items-center pktw-justify-between">
					<div className="pktw-flex-1">
						<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">
							Enable Memory Mode
						</div>
						<div className="pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed">
							Automatically extract and update user memories from conversations
						</div>
					</div>
					<label className="pktw-relative pktw-inline-block pktw-w-11 pktw-h-6 pktw-cursor-pointer pktw-ml-4">
						<input
							type="checkbox"
							checked={memoryEnabled}
							onChange={(e) => handleMemoryEnabledChange(e.target.checked)}
							className="pktw-opacity-0 pktw-w-0 pktw-h-0"
						/>
						<span className={cn(
							"pktw-absolute pktw-cursor-pointer pktw-top-0 pktw-left-0 pktw-right-0 pktw-bottom-0 pktw-transition-all pktw-duration-300 pktw-rounded-full",
							memoryEnabled ? "pktw-bg-accent" : "pktw-bg-border"
						)}>
							<span className={cn(
								"pktw-absolute pktw-content-[''] pktw-h-[18px] pktw-w-[18px] pktw-left-[3px] pktw-bottom-[3px] pktw-bg-white pktw-transition-all pktw-duration-300 pktw-rounded-full",
								memoryEnabled && "pktw-translate-x-[20px]"
							)}></span>
						</span>
					</label>
				</div>

				<div className="pktw-space-y-2">
					<div className="pktw-text-sm pktw-font-medium pktw-text-foreground">Memory File Path</div>
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-mb-2">
						Path to user memory file (relative to vault root)
					</div>
					<Input
						type="text"
						placeholder={DEFAULT_AI_SERVICE_SETTINGS.memoryFilePath || 'ChatFolder/User-Memory.md'}
						value={memoryFilePath}
						onChange={(e) => handleMemoryFilePathChange(e.target.value)}
					/>
				</div>
			</div>

			{/* Profile Settings */}
			<div className="pktw-space-y-4">
				<div className="pktw-flex pktw-items-center pktw-justify-between">
					<div className="pktw-flex-1">
						<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">
							Enable Profile Mode
						</div>
						<div className="pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed">
							Automatically update user profile based on conversation patterns
						</div>
					</div>
					<label className="pktw-relative pktw-inline-block pktw-w-11 pktw-h-6 pktw-cursor-pointer pktw-ml-4">
						<input
							type="checkbox"
							checked={profileEnabled}
							onChange={(e) => handleProfileEnabledChange(e.target.checked)}
							className="pktw-opacity-0 pktw-w-0 pktw-h-0"
						/>
						<span className={cn(
							"pktw-absolute pktw-cursor-pointer pktw-top-0 pktw-left-0 pktw-right-0 pktw-bottom-0 pktw-transition-all pktw-duration-300 pktw-rounded-full",
							profileEnabled ? "pktw-bg-accent" : "pktw-bg-border"
						)}>
							<span className={cn(
								"pktw-absolute pktw-content-[''] pktw-h-[18px] pktw-w-[18px] pktw-left-[3px] pktw-bottom-[3px] pktw-bg-white pktw-transition-all pktw-duration-300 pktw-rounded-full",
								profileEnabled && "pktw-translate-x-[20px]"
							)}></span>
						</span>
					</label>
				</div>

				<div className="pktw-space-y-2">
					<div className="pktw-text-sm pktw-font-medium pktw-text-foreground">Profile File Path</div>
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-mb-2">
						Path to user profile file (relative to vault root)
					</div>
					<Input
						type="text"
						placeholder={DEFAULT_AI_SERVICE_SETTINGS.profileFilePath || 'ChatFolder/User-Profile.md'}
						value={profileFilePath}
						onChange={(e) => handleProfileFilePathChange(e.target.value)}
					/>
				</div>
			</div>

			{/* Prompt Rewrite Settings */}
			<div className="pktw-flex pktw-items-center pktw-justify-between">
				<div className="pktw-flex-1">
					<div className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-mb-1">
						Enable Prompt Rewrite
					</div>
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed">
						Automatically improve low-quality user prompts using reference library
					</div>
				</div>
				<label className="pktw-relative pktw-inline-block pktw-w-11 pktw-h-6 pktw-cursor-pointer pktw-ml-4">
					<input
						type="checkbox"
						checked={promptRewriteEnabled}
						onChange={(e) => handlePromptRewriteEnabledChange(e.target.checked)}
						className="pktw-opacity-0 pktw-w-0 pktw-h-0"
					/>
					<span className={cn(
						"pktw-absolute pktw-cursor-pointer pktw-top-0 pktw-left-0 pktw-right-0 pktw-bottom-0 pktw-transition-all pktw-duration-300 pktw-rounded-full",
						promptRewriteEnabled ? "pktw-bg-accent" : "pktw-bg-border"
					)}>
						<span className={cn(
							"pktw-absolute pktw-content-[''] pktw-h-[18px] pktw-w-[18px] pktw-left-[3px] pktw-bottom-[3px] pktw-bg-white pktw-transition-all pktw-duration-300 pktw-rounded-full",
							promptRewriteEnabled && "pktw-translate-x-[20px]"
						)}></span>
					</span>
				</label>
			</div>
		</div>
	);
}
