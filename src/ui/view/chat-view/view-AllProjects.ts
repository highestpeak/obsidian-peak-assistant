import { ParsedProjectFile } from 'src/service/chat/types';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { IChatView } from '../view-interfaces';

const PROJECTS_PAGE_SIZE = 20;

export class AllProjectsView {
	// dependencies
	private manager: AIServiceManager;
	private chatView: IChatView;
	// state
	private projects: ParsedProjectFile[] = [];
	private projectsPage: number = 0;
	private scrollObserver?: IntersectionObserver;

	constructor(
		manager: AIServiceManager,
		chatView: IChatView
	) {
		this.manager = manager;
		this.chatView = chatView;
	}

	/**
	 * Render complete view with header, body and footer
	 */
	async render(headerEl: HTMLElement, bodyEl: HTMLElement, footerEl: HTMLElement): Promise<void> {
		// Render header
		headerEl.empty();
		headerEl.createDiv({ cls: 'peak-chat-view__header-content' })
			.createDiv({ cls: 'peak-chat-view__title' })
			.createEl('h2', { text: 'All Projects' });

		// Load projects and render body
		this.projects = await this.manager.listProjects();
		this.projectsPage = 0;
		await this.renderInternal(bodyEl);

		// Render footer (empty for this view)
		footerEl.empty();
	}

	private async renderInternal(containerEl: HTMLElement): Promise<void> {
		containerEl.empty();
		containerEl.addClass('peak-chat-view__all-projects-container');

		const cardsContainer = containerEl.createDiv({ cls: 'peak-chat-view__projects-grid' });

		// Calculate how many projects to show based on current page
		const endIndex = (this.projectsPage + 1) * PROJECTS_PAGE_SIZE;
		const projectsToShow = this.projects.slice(0, endIndex);
		const hasMore = endIndex < this.projects.length;

		if (projectsToShow.length === 0) {
			const emptyState = containerEl.createDiv({ cls: 'peak-chat-view__empty-state' });
			emptyState.createEl('div', {
				cls: 'peak-chat-view__empty-text',
				text: 'No projects yet.'
			});
			return;
		}

		// Render project cards
		for (const project of projectsToShow) {
			const card = cardsContainer.createDiv({ cls: 'peak-chat-view__project-card' });

			// Project name
			const nameEl = card.createDiv({ cls: 'peak-chat-view__project-card-name' });
			nameEl.setText(project.meta.name);

			// Project summary
			const summaryEl = card.createDiv({ cls: 'peak-chat-view__project-card-summary' });
			const summary = project.context?.summary || 'No summary available.';
			summaryEl.setText(summary.length > 150 ? summary.substring(0, 150) + '...' : summary);

			// Click to open project
			card.style.cursor = 'pointer';
			card.addEventListener('click', async () => {
				await this.chatView.showProjectOverview(project);
			});
		}

		// Setup infinite scroll
		if (this.scrollObserver) {
			this.scrollObserver.disconnect();
			this.scrollObserver = undefined;
		}

		if (hasMore) {
			const sentinel = containerEl.createDiv({ cls: 'peak-chat-view__scroll-sentinel' });
			this.scrollObserver = new IntersectionObserver((entries) => {
				entries.forEach(entry => {
					if (entry.isIntersecting) {
						this.projectsPage++;
						this.scrollObserver?.disconnect();
						this.scrollObserver = undefined;
						void this.renderInternal(containerEl);
					}
				});
			}, { threshold: 0.1 });
			this.scrollObserver.observe(sentinel);
		}
	}

	destroy(): void {
		if (this.scrollObserver) {
			this.scrollObserver.disconnect();
			this.scrollObserver = undefined;
		}
	}
}

