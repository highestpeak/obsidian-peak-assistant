// T11N: Concrete Obsidian implementation of `ChatVaultWriterPort`. The
// only place in the codebase that closes over `app.vault.createFolder` +
// `app.vault.create` for the chat-message save-to-vault surface.

import { normalizePath, type App } from 'obsidian';
import type { ChatVaultWriterPort } from '@/service/chat/ports/ChatVaultWriterPort';

export class AppChatVaultWriterAdapter implements ChatVaultWriterPort {
	constructor(private readonly app: App) {}

	async saveChatMessageToFolder(
		folder: string,
		fileNameWithExt: string,
		content: string,
	): Promise<string> {
		const folderPath = normalizePath(folder);
		if (!this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}
		const filePath = normalizePath(`${folderPath}/${fileNameWithExt}`);
		await this.app.vault.create(filePath, content);
		return filePath;
	}
}
