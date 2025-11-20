import { ParsedConversationFile } from 'src/service/chat/types';
import { formatTokenCount, formatDuration } from '../shared/date-utils';
import { createIcon } from 'src/core/IconHelper';

/**
 * Render conversation statistics in header
 */
export class StatsRenderer {
	constructor(
		private onScrollToTop: () => void,
		private onScrollToBottom: () => void,
		private onShowResources: () => void,
		private onShowSummary: (summary: string) => void,
		private onOpenSource: () => void
	) { }

	render(container: HTMLElement, conversation: ParsedConversationFile): void {
		const statsContainer = container.createDiv({ cls: 'peak-chat-view__header-stats' });

		const messageCount = conversation.messages.length;
		const messageStat = statsContainer.createDiv({ cls: 'peak-chat-view__stat-item' });
		messageStat.createSpan({ cls: 'peak-chat-view__stat-label', text: 'Messages' });
		messageStat.createSpan({ cls: 'peak-chat-view__stat-value', text: messageCount.toString() });

		const tokenUsage = conversation.meta.tokenUsageTotal || 0;
		const tokenStat = statsContainer.createDiv({ cls: 'peak-chat-view__stat-item' });
		tokenStat.createSpan({ cls: 'peak-chat-view__stat-label', text: 'Tokens' });
		tokenStat.createSpan({ cls: 'peak-chat-view__stat-value', text: formatTokenCount(tokenUsage) });

		const durationStat = statsContainer.createDiv({ cls: 'peak-chat-view__stat-item' });
		durationStat.createSpan({ cls: 'peak-chat-view__stat-label', text: 'Duration' });
		const durationText = formatDuration(conversation.meta.createdAtTimestamp, conversation.meta.updatedAtTimestamp);
		durationStat.createSpan({ cls: 'peak-chat-view__stat-value', text: durationText });

		const scrollButtons = statsContainer.createDiv({ cls: 'peak-chat-view__header-scroll-buttons' });

		const scrollTopBtn = scrollButtons.createEl('button', {
			cls: 'peak-chat-view__scroll-button',
			attr: {
				title: 'Scroll to top',
				'aria-label': 'Scroll to top'
			}
		});
		createIcon(scrollTopBtn, 'arrow-up', {
			size: 16,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});
		scrollTopBtn.addEventListener('click', () => this.onScrollToTop());

		const scrollBottomBtn = scrollButtons.createEl('button', {
			cls: 'peak-chat-view__scroll-button',
			attr: {
				title: 'Scroll to latest',
				'aria-label': 'Scroll to latest'
			}
		});
		createIcon(scrollBottomBtn, 'arrow-down', {
			size: 16,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});
		scrollBottomBtn.addEventListener('click', () => this.onScrollToBottom());

		const resourcesButton = statsContainer.createEl('button', {
			cls: 'peak-chat-view__resources-button',
			attr: {
				title: 'View conversation resources',
				'aria-label': 'View conversation resources'
			}
		});
		createIcon(resourcesButton, 'list', {
			size: 16,
			strokeWidth: 2,
			class: 'peak-icon'
		});
		resourcesButton.addEventListener('click', () => this.onShowResources());

		if (conversation.context?.summary) {
			const summaryButton = statsContainer.createEl('button', {
				cls: 'peak-chat-view__summary-button',
				attr: {
					title: 'View conversation summary',
					'aria-label': 'View conversation summary'
				}
			});
			createIcon(summaryButton, 'lightbulb', {
				size: 16,
				strokeWidth: 2,
				class: 'peak-icon'
			});
			summaryButton.addEventListener('click', () => {
				this.onShowSummary(conversation.context!.summary!);
			});
		}

		const openSourceButton = statsContainer.createEl('button', {
			cls: 'peak-chat-view__open-source-button',
			attr: {
				title: 'Open source document',
				'aria-label': 'Open source document'
			}
		});
		createIcon(openSourceButton, 'file-text', {
			size: 16,
			strokeWidth: 2,
			class: 'peak-icon'
		});
		openSourceButton.addEventListener('click', async () => {
			await this.onOpenSource();
		});
	}
}

