import React from 'react';
import type { IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { MY_CONTENT_VIEW_TYPE } from '@/app/ui-host/views/types';
import { MyContentRuntime } from '@/app/my-content/MyContentRuntime';
import { MyContent } from '@/ui/view/my-content/MyContent';

export { MY_CONTENT_VIEW_TYPE };

export class MyContentView extends ReactItemViewHost {
	protected readonly viewType = MY_CONTENT_VIEW_TYPE;
	protected readonly displayText = 'My Content';
	protected readonly icon: IconName = 'folder-heart';
	protected readonly rootClasses = ['peak-design-root', 'pktw-root', 'peak-my-content-view'] as const;

	protected renderElement(): React.ReactElement {
		const runtime = new MyContentRuntime({
			app: this.appContext.app,
			registry: this.appContext.runtimeRegistry.getGeneratedOutputRegistry(),
			resolveAiRoot: () => this.appContext.settings.ai.rootFolder,
			getHubRuntime: () => this.appContext.runtimeRegistry.tryGetHubGenerationRuntime(),
		});
		return createReactElementWithServices(MyContent, { runtime }, this.appContext);
	}
}
