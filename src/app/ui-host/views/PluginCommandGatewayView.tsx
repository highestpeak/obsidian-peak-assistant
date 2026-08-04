import React from 'react';
import type { IconName } from 'obsidian';
import { ReactItemViewHost } from '@/app/ui-host/ReactItemViewHost';
import { createReactElementWithServices } from '@/app/ui-host/ReactElementFactory';
import { PLUGIN_COMMAND_GATEWAY_VIEW_TYPE } from '@/app/ui-host/views/types';
import { PluginCommandGatewayView as PluginCommandGatewaySurface } from '@/ui/view/command-gateway/PluginCommandGatewayView';

export { PLUGIN_COMMAND_GATEWAY_VIEW_TYPE };

export class PluginCommandGatewayView extends ReactItemViewHost {
	protected readonly viewType = PLUGIN_COMMAND_GATEWAY_VIEW_TYPE;
	protected readonly displayText = 'Command Gateway';
	public readonly icon: IconName = 'shield-check';
	protected readonly rootClasses = [
		'peak-design-root',
		'pktw-root',
		'peak-plugin-command-gateway-view',
	] as const;

	protected renderElement(): React.ReactElement {
		const pluginCommandGateway = this.appContext.runtimeRegistry
			.getPluginCommandGatewayRuntime();
		return createReactElementWithServices(
			PluginCommandGatewaySurface,
			{ pluginCommandGateway },
			this.appContext,
		);
	}
}
