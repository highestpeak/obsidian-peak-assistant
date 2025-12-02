import { App } from 'obsidian';
import { AIModelId } from 'src/service/chat/types-models';
import { ParsedConversationFile } from 'src/service/chat/types';
import { createIcon } from 'src/core/IconHelper';
import { AIServiceManager, AIServiceSettings } from 'src/service/chat/service-manager';

/**
 * Model selector component for choosing AI models
 */
export class ModelSelector {
	private buttonEl?: HTMLElement;
	private menuEl?: HTMLElement;
	private isMenuOpen = false;

	constructor(
		private app: App,
		private aiSettings: AIServiceSettings,
		private conversation: ParsedConversationFile | null,
		private onModelChange: (provider: string, modelId: AIModelId) => Promise<void>
	) {}

	/**
	 * Render model selector button in header
	 */
	async render(container: HTMLElement): Promise<void> {
		container.empty();
		this.buttonEl = container.createDiv({ cls: 'peak-model-selector' });
		
		const manager = await this.getManager();
		const currentModel = this.conversation?.meta.activeModel || manager.getSettings().defaultModelId;
		const currentModelName = await this.getModelDisplayName(currentModel);
		
		const button = this.buttonEl.createEl('button', {
			cls: 'peak-model-selector-button',
		});
		
		const textSpan = button.createSpan({ text: currentModelName });
		
		const icon = createIcon(button, 'chevron-down', {
			size: 14,
			strokeWidth: 2,
			class: 'peak-icon peak-model-selector-icon'
		});
		icon.style.marginLeft = '6px';
		
		button.addEventListener('click', (e) => {
			e.stopPropagation();
			this.toggleMenu();
		});

		// Close menu when clicking outside
		document.addEventListener('click', this.handleOutsideClick);
	}

	/**
	 * Get AIServiceManager instance
	 */
	private async getManager(): Promise<AIServiceManager> {
		const manager = new AIServiceManager(this.app, this.aiSettings);
		await manager.init();
		return manager;
	}

	/**
	 * Get display name for a model
	 */
	private async getModelDisplayName(modelId: AIModelId): Promise<string> {
		const manager = await this.getManager();
		const allModels = await manager.getAllAvailableModels();
		const model = allModels.find(m => m.id === modelId);
		return model?.displayName || modelId;
	}

	/**
	 * Toggle model selection menu
	 */
	private async toggleMenu(): Promise<void> {
		if (this.isMenuOpen) {
			this.closeMenu();
		} else {
			await this.openMenu();
		}
	}

	/**
	 * Open model selection menu
	 */
	private async openMenu(): Promise<void> {
		if (!this.buttonEl) return;

		// Close existing menu if any
		this.closeMenu();

		this.menuEl = document.body.createDiv({ cls: 'peak-model-selector-menu' });
		this.isMenuOpen = true;

		// Position menu below button first (before async operations)
		const buttonRect = this.buttonEl.getBoundingClientRect();
		this.menuEl.style.position = 'fixed';
		this.menuEl.style.top = `${buttonRect.bottom + 4}px`;
		this.menuEl.style.left = `${buttonRect.left}px`;
		this.menuEl.style.minWidth = `${buttonRect.width}px`;
		this.menuEl.style.zIndex = '10000';

		// Show loading state
		const loadingEl = this.menuEl.createDiv({ cls: 'peak-model-selector-item' });
		loadingEl.createDiv({ cls: 'peak-model-selector-item-name', text: 'Loading models...' });

		try {
			// Get available models from all configured providers
			const manager = await this.getManager();
			const models = await manager.getAllAvailableModels();
			const currentModel = this.conversation?.meta.activeModel || manager.getSettings().defaultModelId;

			// Clear loading state
			this.menuEl.empty();

			if (models.length === 0) {
				const emptyEl = this.menuEl.createDiv({ cls: 'peak-model-selector-item' });
				emptyEl.createDiv({ cls: 'peak-model-selector-item-name', text: 'No models available' });
				return;
			}

			// Sort models by display name
			models.sort((a, b) => a.displayName.localeCompare(b.displayName));

			// Render all models
			models.forEach((model) => {
				const item = this.menuEl!.createDiv({
					cls: `peak-model-selector-item ${model.id === currentModel ? 'is-selected' : ''}`,
				});

				const nameEl = item.createDiv({ cls: 'peak-model-selector-item-name' });
				nameEl.textContent = model.displayName;

				if (model.id === currentModel) {
					const checkIcon = createIcon(item, 'check', {
						size: 14,
						strokeWidth: 3,
						class: 'peak-icon peak-model-selector-check'
					});
				}

				item.addEventListener('click', async () => {
					await this.onModelChange(model.provider, model.id);
					this.closeMenu();
				});
			});
		} catch (error) {
			console.error('[ModelSelector] Error loading models:', error);
			// Clear loading state and show error
			this.menuEl.empty();
			const errorEl = this.menuEl.createDiv({ cls: 'peak-model-selector-item' });
			errorEl.createDiv({ cls: 'peak-model-selector-item-name', text: 'Error loading models' });
		}
	}

	/**
	 * Close model selection menu
	 */
	private closeMenu(): void {
		if (this.menuEl) {
			this.menuEl.remove();
			this.menuEl = undefined;
		}
		this.isMenuOpen = false;
	}

	/**
	 * Handle clicks outside the menu
	 */
	private handleOutsideClick = (e: MouseEvent): void => {
		if (this.isMenuOpen && this.menuEl && this.buttonEl) {
			const target = e.target as HTMLElement;
			if (!this.menuEl.contains(target) && !this.buttonEl.contains(target)) {
				this.closeMenu();
			}
		}
	};



	/**
	 * Update conversation reference
	 */
	async updateConversation(conversation: ParsedConversationFile | null): Promise<void> {
		this.conversation = conversation;
		if (this.buttonEl) {
			const manager = await this.getManager();
			const currentModel = this.conversation?.meta.activeModel || manager.getSettings().defaultModelId;
			const currentModelName = await this.getModelDisplayName(currentModel);
			const button = this.buttonEl.querySelector('.peak-model-selector-button') as HTMLElement;
			if (button) {
				// Update text while preserving icon
				const icon = button.querySelector('.peak-model-selector-icon');
				button.textContent = currentModelName;
				if (icon && icon.parentElement === button) {
					button.appendChild(icon);
				} else if (icon) {
					// Icon was removed, recreate it
					const newIcon = createIcon(button, 'chevron-down', {
						size: 14,
						strokeWidth: 2,
						class: 'peak-icon peak-model-selector-icon'
					});
					newIcon.style.marginLeft = '6px';
				} else {
					// No icon, create it
					const newIcon = createIcon(button, 'chevron-down', {
						size: 14,
						strokeWidth: 2,
						class: 'peak-icon peak-model-selector-icon'
					});
					newIcon.style.marginLeft = '6px';
				}
			}
		}
	}

	/**
	 * Cleanup
	 */
	destroy(): void {
		this.closeMenu();
		document.removeEventListener('click', this.handleOutsideClick);
	}
}

