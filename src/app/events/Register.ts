import type MyPlugin from 'main';
import { ViewManager } from '../view/ViewManager';

/**
 * Registers workspace-level reactive events.
 */
export function registerCoreEvents(plugin: MyPlugin, viewManager: ViewManager): void {
	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', (leaf) => {
			viewManager.getViewSwitchConsistentHandler().handleActiveLeafChange(leaf);
		})
	);
}

