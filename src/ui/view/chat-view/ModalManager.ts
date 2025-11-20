import { ParsedConversationFile } from 'src/service/chat/types';
import { getFileTypeFromPath, FileType } from '../shared/file-utils';
import { createIcon } from 'src/core/IconHelper';
import { App, TFile } from 'obsidian';

/**
 * Manage modals for chat view
 */
export class ModalManager {
	constructor(private app: App) {}

	/**
	 * Show summary modal
	 */
	showSummaryModal(summary: string): void {
		const modal = document.createElement('div');
		modal.className = 'peak-summary-modal';
		
		const overlay = document.createElement('div');
		overlay.className = 'peak-summary-modal-overlay';
		
		const content = document.createElement('div');
		content.className = 'peak-summary-modal-content';
		
		const header = document.createElement('div');
		header.className = 'peak-summary-modal-header';
		const title = document.createElement('h3');
		title.textContent = 'Conversation Summary';
		const closeBtn = document.createElement('button');
		closeBtn.className = 'peak-summary-modal-close';
		closeBtn.textContent = '×';
		header.appendChild(title);
		header.appendChild(closeBtn);
		
		const body = document.createElement('div');
		body.className = 'peak-summary-modal-body';
		const summaryText = document.createElement('p');
		summaryText.textContent = summary;
		summaryText.style.whiteSpace = 'pre-wrap';
		body.appendChild(summaryText);
		
		content.appendChild(header);
		content.appendChild(body);
		modal.appendChild(overlay);
		modal.appendChild(content);
		
		const closeModal = () => {
			modal.remove();
			window.removeEventListener('keydown', handleKeyDown, true);
			document.removeEventListener('keydown', handleKeyDown, true);
			modal.removeEventListener('keydown', handleKeyDown, true);
		};
		
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && document.body.contains(modal)) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				closeModal();
				return false;
			}
		};
		
		window.addEventListener('keydown', handleKeyDown, true);
		document.addEventListener('keydown', handleKeyDown, true);
		modal.addEventListener('keydown', handleKeyDown, true);
		
		overlay.addEventListener('click', closeModal);
		closeBtn.addEventListener('click', closeModal);
		
		document.body.appendChild(modal);
		
		content.setAttribute('tabindex', '-1');
		content.focus();
	}

	/**
	 * Show resources modal
	 */
	showResourcesModal(conversation: ParsedConversationFile | null): void {
		if (!conversation) return;

		const resources = this.collectConversationResources(conversation);
		
		const modal = document.createElement('div');
		modal.className = 'peak-resources-modal';
		
		const overlay = document.createElement('div');
		overlay.className = 'peak-resources-modal-overlay';
		
		const content = document.createElement('div');
		content.className = 'peak-resources-modal-content';
		
		const header = document.createElement('div');
		header.className = 'peak-resources-modal-header';
		const title = document.createElement('h3');
		title.textContent = 'Conversation Resources';
		const closeBtn = document.createElement('button');
		closeBtn.className = 'peak-resources-modal-close';
		closeBtn.textContent = '×';
		header.appendChild(title);
		header.appendChild(closeBtn);
		
		const body = document.createElement('div');
		body.className = 'peak-resources-modal-body';
		
		if (resources.length === 0) {
			const emptyText = document.createElement('div');
			emptyText.className = 'peak-resources-modal-empty';
			emptyText.textContent = 'No resources attached to this conversation.';
			body.appendChild(emptyText);
		} else {
			const pdfs = resources.filter(r => r.type === 'pdf');
			const images = resources.filter(r => r.type === 'image');
			const files = resources.filter(r => r.type === 'file');
			
			if (pdfs.length > 0) {
				const pdfSection = document.createElement('div');
				pdfSection.className = 'peak-resources-modal-section';
				const pdfTitle = document.createElement('h4');
				pdfTitle.textContent = `PDF Files (${pdfs.length})`;
				pdfSection.appendChild(pdfTitle);
				
				const pdfList = document.createElement('div');
				pdfList.className = 'peak-resources-modal-list';
				for (const resource of pdfs) {
					const item = this.createResourceItem(resource.path, 'pdf');
					pdfList.appendChild(item);
				}
				pdfSection.appendChild(pdfList);
				body.appendChild(pdfSection);
			}
			
			if (images.length > 0) {
				const imageSection = document.createElement('div');
				imageSection.className = 'peak-resources-modal-section';
				const imageTitle = document.createElement('h4');
				imageTitle.textContent = `Images (${images.length})`;
				imageSection.appendChild(imageTitle);
				
				const imageList = document.createElement('div');
				imageList.className = 'peak-resources-modal-list';
				for (const resource of images) {
					const item = this.createResourceItem(resource.path, 'image');
					imageList.appendChild(item);
				}
				imageSection.appendChild(imageList);
				body.appendChild(imageSection);
			}
			
			if (files.length > 0) {
				const fileSection = document.createElement('div');
				fileSection.className = 'peak-resources-modal-section';
				const fileTitle = document.createElement('h4');
				fileTitle.textContent = `Other Files (${files.length})`;
				fileSection.appendChild(fileTitle);
				
				const fileList = document.createElement('div');
				fileList.className = 'peak-resources-modal-list';
				for (const resource of files) {
					const item = this.createResourceItem(resource.path, 'file');
					fileList.appendChild(item);
				}
				fileSection.appendChild(fileList);
				body.appendChild(fileSection);
			}
		}
		
		content.appendChild(header);
		content.appendChild(body);
		modal.appendChild(overlay);
		modal.appendChild(content);
		
		const closeModal = () => {
			modal.remove();
			window.removeEventListener('keydown', handleKeyDown, true);
			document.removeEventListener('keydown', handleKeyDown, true);
			modal.removeEventListener('keydown', handleKeyDown, true);
		};
		
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && document.body.contains(modal)) {
				e.preventDefault();
				e.stopPropagation();
				e.stopImmediatePropagation();
				closeModal();
				return false;
			}
		};
		
		window.addEventListener('keydown', handleKeyDown, true);
		document.addEventListener('keydown', handleKeyDown, true);
		modal.addEventListener('keydown', handleKeyDown, true);
		
		overlay.addEventListener('click', closeModal);
		closeBtn.addEventListener('click', closeModal);
		
		document.body.appendChild(modal);
		
		content.setAttribute('tabindex', '-1');
		content.focus();
	}

	/**
	 * Collect all resources from conversation messages
	 */
	private collectConversationResources(conversation: ParsedConversationFile): Array<{ path: string; type: FileType }> {
		const resourceMap = new Map<string, { path: string; type: FileType }>();
		
		for (const message of conversation.messages) {
			if (message.attachments && message.attachments.length > 0) {
				for (const attachmentPath of message.attachments) {
					if (!resourceMap.has(attachmentPath)) {
						const type = getFileTypeFromPath(attachmentPath);
						resourceMap.set(attachmentPath, { path: attachmentPath, type });
					}
				}
			}
		}
		
		return Array.from(resourceMap.values());
	}

	/**
	 * Create a resource item element
	 */
	private createResourceItem(path: string, type: FileType): HTMLElement {
		const item = document.createElement('div');
		item.className = 'peak-resources-modal-item';
		
		const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
		const file = this.app.vault.getAbstractFileByPath(normalizedPath);
		
		const iconContainer = document.createElement('div');
		iconContainer.className = 'peak-resources-modal-item-icon';
		
		let iconName: string;
		if (type === 'pdf') {
			iconName = 'file-text';
		} else if (type === 'image') {
			iconName = 'image';
		} else {
			iconName = 'file';
		}
		
		createIcon(iconContainer, iconName as any, {
			size: 18,
			strokeWidth: 2,
			class: 'peak-icon'
		});
		
		const textContainer = document.createElement('div');
		textContainer.className = 'peak-resources-modal-item-text';
		const fileName = document.createElement('div');
		fileName.className = 'peak-resources-modal-item-name';
		fileName.textContent = path.split('/').pop() || path;
		textContainer.appendChild(fileName);
		
		const pathText = document.createElement('div');
		pathText.className = 'peak-resources-modal-item-path';
		pathText.textContent = path;
		textContainer.appendChild(pathText);
		
		item.appendChild(iconContainer);
		item.appendChild(textContainer);
		
		if (file && file instanceof TFile) {
			item.style.cursor = 'pointer';
			item.addEventListener('click', async () => {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(file);
			});
		} else {
			item.style.cursor = 'pointer';
			item.addEventListener('click', async () => {
				await this.app.workspace.openLinkText(path, '', true);
			});
		}
		
		return item;
	}
}
