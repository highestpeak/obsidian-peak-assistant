import React from 'react';
import { Modal } from 'obsidian';
import type { AppContext } from '@/app/context/AppContext';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { KeyboardMapContent } from '@/ui/keyboard/KeyboardMapContent';
import type {
	PeakKeyboardMapContext,
	PeakKeyboardNavigationPort,
} from '@/ui/keyboard/KeyboardNavigationPort';

export class KeyboardMapModal extends Modal {
	private renderer: ReactRenderer | null = null;
	private unregisterLayer: (() => void) | null = null;

	constructor(
		private readonly appContext: AppContext,
		private readonly runtime: PeakKeyboardNavigationPort,
		private readonly context: PeakKeyboardMapContext,
	) {
		super(appContext.app);
	}

	onOpen(): void {
		this.modalEl.addClass('peak-design-root');
		this.modalEl.addClass('pk-keyboard-map-modal');
		this.contentEl.empty();
		this.contentEl.style.padding = '0';
		this.renderer = new ReactRenderer(this.containerEl);
		this.renderer.render(
			React.createElement(KeyboardMapContent, {
				context: this.context,
				contextEntries: this.runtime.getKeyboardMap(this.context),
				allEntries: this.runtime.getKeyboardMap({
					surfaceId: null,
					zoneId: null,
				}),
				onClose: () => this.close(),
				onOpenHotkeys: (commandId) => {
					const ownerDocument = this.contentEl.ownerDocument;
					this.close();
					const app = this.appContext.app as typeof this.appContext.app & {
						commands: {
							executeCommandById: (id: string) => unknown;
							commands?: Record<string, { name?: string }>;
						};
					};
					app.commands.executeCommandById('app:hotkey-options');
					const fullId = `${this.appContext.plugin.manifest.id}:${commandId}`;
					const commandName = app.commands.commands?.[fullId]?.name ?? commandId;
					ownerDocument.defaultView?.setTimeout(() => {
						const input = ownerDocument.querySelector<HTMLInputElement>(
							'.modal.mod-settings .search-input-container input',
						);
						if (!input) return;
						input.value = commandName;
						const InputEventCtor = ownerDocument.defaultView?.InputEvent;
						if (InputEventCtor) input.dispatchEvent(new InputEventCtor('input', { bubbles: true }));
						input.focus({ preventScroll: true });
					}, 0);
				},
			}),
		);
		this.unregisterLayer = this.runtime.registerEscapeLayer({
			id: 'keyboard-map',
			ownerDocument: this.contentEl.ownerDocument,
			trigger: this.context.trigger,
			contains: (target) => {
				const NodeCtor = this.contentEl.ownerDocument.defaultView?.Node;
				return Boolean(NodeCtor && target instanceof NodeCtor && this.modalEl.contains(target));
			},
			close: () => this.close(),
		});
	}

	onClose(): void {
		this.unregisterLayer?.();
		this.unregisterLayer = null;
		this.renderer?.unmount();
		this.renderer = null;
		this.contentEl.empty();
		const trigger = this.context.trigger;
		if (trigger?.isConnected) trigger.focus({ preventScroll: true });
	}
}
