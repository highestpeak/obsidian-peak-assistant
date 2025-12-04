import { App, IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';
import { ReactRenderer } from '../react/ReactRenderer';
import { ProjectListViewComponent } from './project-list-view/ProjectListView';
import { useProjectStore } from '../store/projectStore';
import { EventBus, ViewEventType, SelectionChangedEvent } from 'src/core/eventBus';
import React from 'react';

export const PROJECT_LIST_VIEW_TYPE = 'peak-project-list-view';

/**
 * Left sidebar view displaying projects and conversations list
 */
export class ProjectListView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private eventBus: EventBus;
	private unsubscribeHandlers: (() => void)[] = [];

	constructor(leaf: WorkspaceLeaf, private readonly manager: AIServiceManager) {
		super(leaf);
		this.eventBus = EventBus.getInstance(this.app);
	}

	getViewType(): string {
		return PROJECT_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Projects & Conversations';
	}

	getIcon(): IconName {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-project-list-view');

		// Create React renderer - containerEl structure: [header, content]
		// We render into the content area (children[1])
		this.reactRenderer = new ReactRenderer(this.containerEl);

		// Subscribe to data refreshed events
		this.unsubscribeHandlers.push(
			this.eventBus.on(ViewEventType.DATA_REFRESHED, () => {
				this.updateView();
			})
		);

		// Initial render
		this.render();
	}

	private render(): void {
		if (!this.reactRenderer) return;

		this.reactRenderer.render(
			React.createElement(ProjectListViewComponent, {
				manager: this.manager,
				app: this.app,
			})
		);
	}

	async onClose(): Promise<void> {
		// Unsubscribe from events
		this.unsubscribeHandlers.forEach(unsubscribe => unsubscribe());
		this.unsubscribeHandlers = [];

		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		this.containerEl.empty();
	}


	/**
	 * Update view when data changes externally
	 * Preserves expanded state and active selections
	 */
	async updateView(): Promise<void> {
		// Just re-render React component, data loading is handled by React component
		this.render();
	}

}


