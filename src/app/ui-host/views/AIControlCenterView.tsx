import React from 'react';
import type { IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { AI_CONTROL_CENTER_VIEW_TYPE } from '@/app/ui-host/views/types';
import { AIControlCenterRuntime } from '@/app/ai-control-center/AIControlCenterRuntime';
import { getAICustomPromptsFolder } from '@/core/config/folderPaths';
import { AIControlCenter } from '@/ui/view/ai-control-center/AIControlCenter';

export { AI_CONTROL_CENTER_VIEW_TYPE };

export class AIControlCenterView extends ReactItemViewHost {
	protected readonly viewType = AI_CONTROL_CENTER_VIEW_TYPE;
	protected readonly displayText = 'AI Control Center';
	protected readonly icon: IconName = 'sparkles';
	protected readonly rootClasses = ['peak-design-root', 'pktw-root', 'peak-ai-control-center-view'] as const;

	protected renderElement(): React.ReactElement {
		const runtime = new AIControlCenterRuntime({
			app: this.appContext.app,
			manager: this.appContext.manager,
			copilotActions: this.appContext.runtimeRegistry.tryGetCopilotActionRuntime(),
			resolveCustomPromptFolder: () => this.appContext.settings.customPromptsFolder
				?? getAICustomPromptsFolder(this.appContext.settings.ai.rootFolder),
		});
		return createReactElementWithServices(AIControlCenter, { runtime }, this.appContext);
	}
}
