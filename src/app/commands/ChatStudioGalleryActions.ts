import { Notice } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import {
	CHAT_STUDIO_GALLERY_LABEL,
	CHAT_STUDIO_GALLERY_TITLE,
	createChatStudioGalleryFixture,
} from '@/ui/view/chat-view/dev/chatStudioGalleryFixture';

function recordGalleryDebugTrace(runId: string): void {
	const port = AppContext.tryGetDebugTracePort();
	if (!port) return;
	const originalMode = port.currentMode();
	if (originalMode === 'off') port.setMode('redacted');

	try {
		const run = port.startRun({
			surface: 'chat',
			capabilityId: 'chat-studio.component-gallery',
			runId,
			summary: {
				fixture: true,
				purpose: 'Visual QA for reasoning, agent run, and diagnostic trace',
			},
		});

		const context = run.startSpan({ kind: 'context.assemble', name: 'context.assemble' });
		context.setParams({ sourceCount: 2, explicitReferenceCount: 1 });

		const search = context.child({ kind: 'tool.call', name: 'vault_search' });
		search.setInput({ raw: 'Chat Studio message component design', contentType: 'query' });
		search.setOutput({ raw: '2 verified Vault results', contentType: 'text/plain' });
		search.addMetric('resultCount', 2);
		search.finish();

		const read = context.child({ kind: 'tool.call', name: 'vault_read_note' });
		read.setInput({ raw: 'kb/product/Chat Studio 设计说明.md', contentType: 'text/plain' });
		read.setOutput({ raw: 'Loaded message and right-index design requirements.', contentType: 'text/plain' });
		read.finish();

		context.addDecision({
			decision: 'keep',
			reason: 'The source directly defines the visual and ordering contract.',
			target: 'kb/product/Chat Studio 设计说明.md',
		});
		context.finish();

		const prompt = run.startSpan({ kind: 'context.compact', name: 'context-pipeline:assemble' });
		prompt.setInput({ raw: 'Assemble the two verified sources.', contentType: 'text/markdown' });
		prompt.setOutput({ raw: 'Prompt assembled within the context budget.', contentType: 'text/plain' });
		prompt.addMetric('sourceCount', 2);
		prompt.finish();

		const model = run.startSpan({ kind: 'model.call', name: 'openrouter/openai/gpt-5.1' });
		model.setParams({ streaming: true, finishReason: 'stop' });
		model.setOutput({ raw: 'Completed the component-gallery response.', contentType: 'text/markdown' });
		model.finish();

		run.finish('completed', { toolCount: 3, artifactCount: 8 });
	} finally {
		if (originalMode === 'off') port.setMode('off');
	}
}

/**
 * Rebuild and open the isolated Chat Studio QA conversation. The only
 * destructive step is replacing a prior conversation that carries our exact
 * custom fixture marker; normal user conversations cannot match it.
 */
export async function openChatStudioComponentGallery(): Promise<void> {
	const ctx = AppContext.getInstance();
	const manager = ctx.manager;

	try {
		const existing = await manager.conv.listConversations(null, 250);
		const priorFixtures = existing.filter((conversation) => {
			const type = conversation.meta.conversationType;
			return type?.kind === 'custom' && type.label === CHAT_STUDIO_GALLERY_LABEL;
		});
		for (const fixture of priorFixtures) {
			await manager.conv.deleteConversation(fixture.meta.id);
		}

		const now = Date.now();
		// Receipts need the real conversation id, while initial messages do not.
		const messageFixture = createChatStudioGalleryFixture('pending-gallery', now);
		const created = await manager.conv.createConversation({
			title: CHAT_STUDIO_GALLERY_TITLE,
			initialMessages: messageFixture.messages,
			modelId: 'openai/gpt-5.1',
			provider: 'openrouter',
			conversationType: { kind: 'custom', label: CHAT_STUDIO_GALLERY_LABEL },
		});
		const fixture = createChatStudioGalleryFixture(created.meta.id, now);

		for (const receipt of fixture.artifactReceipts) {
			await manager.conv.saveArtifactReceipt(receipt);
		}
		for (const receipt of fixture.turnReceipts) {
			await manager.conv.saveTurnReceipt(receipt);
		}
		recordGalleryDebugTrace(fixture.debugRunId);

		// Debug traces are intentionally session-only. Attach the run id to the
		// in-memory copy after the durable conversation has been created.
		// Use the source fixture for the live gallery so optional in-memory preview
		// URIs remain available. Durable storage intentionally keeps only the
		// canonical resource source/id/kind fields; rebuilding the gallery restores
		// these visual-only previews without widening the production schema.
		const hydratedMessages = fixture.messages.map((message) => (
			message.id === fixture.debugMessageId
				? { ...message, debugRunId: fixture.debugRunId }
				: message
		));
		const hydratedConversation = { ...created, messages: hydratedMessages };

		await ctx.viewManager.openChatStudio();
		const refreshed = await manager.conv.listConversations(null, 250);
		const conversations = refreshed.map((conversation) => (
			conversation.meta.id === hydratedConversation.meta.id
				? hydratedConversation
				: conversation
		));
		const data = useChatDataStore.getState();
		data.setConversations(conversations);
		data.setMessages(hydratedMessages);
		useChatViewStore.getState().setConversation(hydratedConversation);

		new Notice('Chat Studio component gallery rebuilt and opened.', 5000);
	} catch (error) {
		console.error('[ChatStudioGallery] Failed to build component gallery:', error);
		const detail = error instanceof Error ? error.message : String(error);
		new Notice(`Could not build Chat Studio component gallery: ${detail}`, 8000);
	}
}
