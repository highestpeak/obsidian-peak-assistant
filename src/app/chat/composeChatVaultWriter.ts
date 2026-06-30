// T11N: Composition root for the chat-message vault-writer port.
// Called once from `AppContext`'s constructor — keeps adapter
// construction in app-owned code so service / UI never instantiate the
// concrete adapter directly.

import type { App } from 'obsidian';
import type { ChatVaultWriterPort } from '@/core/ports/ChatVaultWriterPort';
import { AppChatVaultWriterAdapter } from './AppChatVaultWriterAdapter';

export function composeChatVaultWriter(app: App): ChatVaultWriterPort {
	return new AppChatVaultWriterAdapter(app);
}
