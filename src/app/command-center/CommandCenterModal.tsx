import React from 'react';
import type { AppContext } from '@/app/context/AppContext';
import { ReactModalHost, type ReactModalShellOptions } from '@/app/ui-host/ReactModalHost';
import type { CommandCenterRuntimePort } from '@/core/command-center';
import { CommandCenterSurface } from '@/ui/view/command-center';

export class CommandCenterModal extends ReactModalHost {
	private previouslyFocused: HTMLElement | null = null;

	protected readonly shell: ReactModalShellOptions = {
		contentClasses: ['peak-command-center', 'peak-design-root', 'pktw-root'],
		modalClasses: ['peak-command-center-modal'],
		width: 'min(640px, calc(100vw - 48px))',
		maxWidth: 'calc(100vw - 48px)',
		maxHeight: 'calc(100vh - 72px)',
	};

	constructor(
		appContext: AppContext,
		private readonly runtime: CommandCenterRuntimePort,
		private readonly initialMode: 'launcher' | 'customize' = 'launcher',
	) {
		super(appContext);
	}

	onOpen(): void {
		this.previouslyFocused = this.contentEl.ownerDocument.activeElement as HTMLElement | null;
		super.onOpen();
	}

	onClose(): void {
		const ownerWindow = this.contentEl.ownerDocument.defaultView;
		super.onClose();
		const focusTarget = this.previouslyFocused;
		this.previouslyFocused = null;
		if (focusTarget?.isConnected) (ownerWindow ?? window).setTimeout(() => focusTarget.focus(), 0);
	}

	protected renderElement(): React.ReactElement {
		return <CommandCenterSurface runtime={this.runtime} initialMode={this.initialMode} onClose={() => this.close()} />;
	}
}
