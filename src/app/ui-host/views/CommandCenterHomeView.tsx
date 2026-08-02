import React from 'react';
import type { IconName, WorkspaceLeaf } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import type { AppContext } from '@/app/context/AppContext';
import { CommandCenterHome } from '@/ui/view/command-center';
import { COMMAND_CENTER_HOME_VIEW_TYPE } from '@/app/ui-host/views/types';

export { COMMAND_CENTER_HOME_VIEW_TYPE };

export class CommandCenterHomeView extends ReactItemViewHost {
	protected readonly viewType = COMMAND_CENTER_HOME_VIEW_TYPE;
	protected readonly displayText = 'Peak Home';
	readonly icon: IconName = 'house';
	protected readonly rootClasses = ['peak-design-root', 'pktw-root', 'peak-command-center-home-view'] as const;

	constructor(leaf: WorkspaceLeaf, appContext: AppContext) {
		super(leaf, appContext);
	}

	protected renderElement(): React.ReactElement {
		const runtime = this.appContext.runtimeRegistry.tryGetCommandCenterRuntime();
		if (!runtime) return <div className="pk-cc-home-runtime-missing">Command Center is still loading.</div>;
		return <CommandCenterHome runtime={runtime} />;
	}
}
