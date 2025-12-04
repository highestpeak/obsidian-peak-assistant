import { App, Menu } from 'obsidian';
import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { useProjectStore } from '../../store/projectStore';
import { EventBus, SelectionChangedEvent } from 'src/core/eventBus';
import React from 'react';

interface MenuItem {
	title: string;
	icon: string;
	onClick: () => void | Promise<void>;
}

/**
 * Notify that the selection has changed and dispatch event to update chat view
 */
export async function notifySelectionChange(
	app: App,
	conversation?: ParsedConversationFile | null
): Promise<void> {
	const { setActiveConversation, setActiveProject } = useProjectStore.getState();

	// Update activeConversation if provided
	if (conversation !== undefined) {
		setActiveConversation(conversation);
	}

	// Get current state after update
	const currentConv = conversation !== undefined ? conversation : useProjectStore.getState().activeConversation;

	// Set activeProject based on conversation's projectId
	setActiveProject(currentConv?.meta.projectId ?? null);

	// Get final state for event
	const { activeProject, activeConversation } = useProjectStore.getState();

	// Dispatch selection changed event
	const eventBus = EventBus.getInstance(app);
	eventBus.dispatch(new SelectionChangedEvent({
		conversationId: activeConversation?.meta.id ?? null,
		projectId: activeProject?.meta.id ?? null,
	}));
}

/**
 * Load and sort projects, then update store
 */
export async function hydrateProjects(manager: AIServiceManager): Promise<void> {
	const projectsList = await manager.listProjects();
	projectsList.sort((a, b) => {
		const timeA = a.meta.createdAtTimestamp || 0;
		const timeB = b.meta.createdAtTimestamp || 0;
		return timeB - timeA;
	});
	const { setProjects } = useProjectStore.getState();
	setProjects(projectsList);
}

/**
 * Show context menu with menu items
 */
export function showContextMenu(
	e: React.MouseEvent,
	menuItems: MenuItem[]
): void {
	e.preventDefault();
	e.stopPropagation();

	const menu = new Menu();
	menuItems.forEach(({ title, icon, onClick }) => {
		menu.addItem((item) => {
			item.setTitle(title);
			item.setIcon(icon);
			item.onClick(onClick);
		});
	});

	menu.showAtPosition({ x: e.clientX, y: e.clientY });
}

