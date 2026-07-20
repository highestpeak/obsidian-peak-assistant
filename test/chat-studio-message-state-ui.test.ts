/**
 * Regression guards for the Chat Studio message-state visual contract.
 *
 * These are source-level assertions on purpose: the repository's lightweight
 * test runner has no DOM, while the matching browser/Obsidian screenshots live
 * under output/playwright. The test protects the semantic split that the visual
 * QA depends on.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function read(relativePath: string): string {
	return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function testReasoningIsNotAgentTrace(): void {
	const config = JSON.parse(read('templates/config/chat-studio.json'));
	const messageItem = read('src/ui/view/chat-view/components/messages/MessageViewItem.tsx');
	const styles = read('src/styles/peak-components.css');

	assert.strictEqual(config.messages.reasoningTitle, 'Reasoning');
	assert.strictEqual(config.messages.reasoningHint, '');
	assert(messageItem.includes('className="pkchat-reasoning-content"'));
	assert(styles.includes('background: transparent !important;'));
	assert(styles.includes('border-left: 1px solid var(--pk-border-strong) !important;'));
	assert(!config.messages.reasoningTitle.includes('Agent'));
}

function testAgentRunOwnsToolTimeline(): void {
	const toolSummary = read('src/ui/view/chat-view/components/ToolCallSummary.tsx');
	const messageItem = read('src/ui/view/chat-view/components/messages/MessageViewItem.tsx');

	assert(toolSummary.includes('className="pkchat-agent-run"'));
	assert(toolSummary.includes('className="pkchat-agent-run__timeline"'));
	assert(toolSummary.includes("span.kind === 'tool.call'"));
	assert(messageItem.includes('debugRun={debugRun}'));
	assert(messageItem.includes('meta={agentRunMeta}'));
	assert(messageItem.includes(': message.toolCalls ?? []'), 'persisted agent steps render after reload');
	assert(toolSummary.includes("toolCalls.length > 1 || visualStatus === 'failed'"), 'multi-step runs are discoverable by default');
}

function testDiagnosticTraceUsesExactDebugRun(): void {
	const service = read('src/service/chat/service-conversation.ts');
	const toolSummary = read('src/ui/view/chat-view/components/ToolCallSummary.tsx');

	assert(service.includes('getDebugRun(runId: string): DebugRun | undefined'));
	assert(service.includes('return this.debugTracePort?.getRun(runId);'));
	assert(toolSummary.includes('<AgentTrace run={debugRun}'));
	assert(toolSummary.includes('className="pkchat-agent-trace__stack"'));
	assert(toolSummary.includes('data-depth={depth}'));
}

function testArtifactReceiptsRenderRealPreviews(): void {
	const receipt = read('src/ui/view/chat-view/components/messages/ArtifactReceiptCard.tsx');
	const messageItem = read('src/ui/view/chat-view/components/messages/MessageViewItem.tsx');
	const styles = read('src/styles/peak-components.css');

	assert(receipt.includes("preview?.kind === 'image'"));
	assert(receipt.includes("receipt.kind === 'video'"));
	assert(receipt.includes("receipt.kind === 'audio'"));
	assert(receipt.includes('pkchat-artifact-receipt__preview--text'));
	assert(receipt.includes('data-kind={receipt.kind}'));
	assert(receipt.includes('data-layout={layout}'));
	assert(receipt.includes("export type ArtifactReceiptLayout = 'visual' | 'rich' | 'compact'"));
	assert(receipt.includes('getArtifactReceiptLayout'));
	assert(messageItem.includes('className="pkchat-msg__artifact-media"'));
	assert(messageItem.includes('className="pkchat-msg__artifact-list"'));
	assert(messageItem.includes("? 'split'"));
	assert(messageItem.includes("? 'gallery'"));
	assert(messageItem.includes('data-count={visualArtifactReceipts.length}'));
	assert(messageItem.includes('galleryReceipts={visualArtifactReceipts}'));
	assert(styles.includes('.pkchat-msg__artifact-list .pkchat-artifact-receipt[data-layout="compact"]'));
	assert(styles.includes('grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));'));
	assert(styles.includes('grid-template-columns: repeat(auto-fit, minmax(min(230px, 100%), 1fr));'));
	assert(receipt.includes('pkchat-image-lightbox'));
	assert(receipt.includes('pkchat-image-lightbox__nav--previous'));
	assert(receipt.includes('pkchat-image-lightbox__nav--next'));
	assert(receipt.includes("event.key === 'ArrowLeft'"));
	assert(receipt.includes("event.key === 'ArrowRight'"));
	assert(!receipt.includes('pkchat-artifact-receipt__media-wave'), 'unplayable media stays a compact file row');
}

function testMermaidControlsDoNotInheritDiagramSizing(): void {
	const styles = read('src/styles/streamdown-shadow-host.css');
	assert(styles.includes('[data-streamdown="mermaid"] [aria-label="Mermaid chart"] > svg'));
	assert(!styles.includes('[data-streamdown="mermaid-block"] svg {'));
	assert(styles.includes('[data-streamdown="mermaid-block"] button > svg'));
	assert(styles.includes('width: 15px !important;'));
	assert(styles.includes('max-width: 26px !important;'));
}

function testRichContentAndContextPreviewRepairs(): void {
	const messageItem = read('src/ui/view/chat-view/components/messages/MessageViewItem.tsx');
	const shelf = read('src/ui/view/chat-view/components/composer/ComposerContextShelf.tsx');
	const streamdown = read('src/ui/component/mine/StreamdownIsolated.tsx');
	const streamdownStyles = read('src/styles/streamdown-shadow-host.css');

	assert(messageItem.includes("message.reasoning?.content"), 'persisted reasoning renders after reload');
	assert(messageItem.includes('<MessageAttachmentsList message={message} align="start" />'));
	assert(shelf.includes('<ResourcePreviewHover filePath={previewPath}'));
	assert(streamdown.includes('fullscreenMermaidFromEvent'));
	assert(streamdown.includes('setupMermaidFullscreenButtons'));
	assert(streamdown.includes("from './mermaidViewport'"));
	assert(streamdown.includes('handlePointerDown'));
	assert(streamdown.includes('handlePointerMove'));
	assert(streamdown.includes('onWheel={handleWheel}'));
	assert(streamdown.includes('zoomTo(viewportRef.current.scale'));
	assert(streamdown.includes("event.key === 'ArrowLeft'"));
	assert(streamdown.includes("event.key === '0'"));
	assert(streamdown.includes('pkchat-mermaid-fullscreen__toolbar'));
	assert(streamdown.includes('pkchat-mermaid-fullscreen__content'));
	assert(streamdown.includes("!candidate.closest('button')"));
	assert(streamdown.includes("button.addEventListener('click', listener, true)"));
	assert(streamdown.includes("button.getAttribute('aria-label')?.trim()"));
	assert(streamdown.includes('portalHostForDocument(mermaidFullscreen.ownerDocument)'));
	assert(streamdown.includes('setupReadableTableLinks'));
	assert(streamdown.includes('components={STREAMDOWN_COMPONENTS}'));
	assert(streamdown.includes("style={{ ...style, minWidth: '220px' }}"));
	assert(streamdown.includes("link.style.setProperty('text-overflow', 'ellipsis', 'important')"));
	assert(streamdown.includes("const cell = link.closest<HTMLElement>('td')"));
	assert(streamdown.includes("cell.style.setProperty('min-width', '220px', 'important')"));
	assert(streamdownStyles.includes('overflow-wrap: anywhere;'));
	assert(streamdownStyles.includes('td:has(a[href])'));
	assert(streamdownStyles.includes('td:has([data-streamdown="link"])'));
	assert(streamdownStyles.includes('[data-streamdown="table"] td button'));
	assert(streamdownStyles.includes('width: auto !important;'));
	assert(streamdownStyles.includes('button[data-streamdown="link"]'));
	assert(streamdownStyles.includes('text-overflow: ellipsis;'));
	assert(!streamdownStyles.includes('[data-streamdown="table-wrapper"] button,'));
	assert(streamdownStyles.includes('width: 100% !important;'));
	const fullscreenStyles = read('src/styles/peak-components.css');
	assert(fullscreenStyles.includes('.pkchat-mermaid-fullscreen__canvas.is-dragging'));
	assert(fullscreenStyles.includes('touch-action: none;'));
	assert(fullscreenStyles.includes('.pkchat-mermaid-fullscreen__toolbar'));
	assert(fullscreenStyles.includes('.pkchat-mermaid-fullscreen__content > svg'));
}

function testCodeWorkbenchMatchesShikiPalette(): void {
	const streamdown = read('src/ui/component/mine/StreamdownIsolated.tsx');
	const styles = read('src/styles/streamdown-shadow-host.css');

	assert(streamdown.includes('const codeBlockTheme = useLiveCodeBlockTheme();'));
	assert(streamdown.includes('shikiTheme={shikiTheme}'));
	assert(streamdown.includes('shikiTheme={codeBlockThemePair(codeBlockTheme)}'));
	assert(!streamdown.includes('shikiTheme={["one-dark-pro", "one-dark-pro"]}'));
	assert(styles.includes('--sd-code-shell: 215 28% 7%;'));
	assert(styles.includes('--sd-code-foreground: 210 17% 82%;'));
	assert(styles.includes('color: var(--shiki-dark) !important;'));
	assert(styles.includes('color: hsl(var(--sd-code-muted)) !important;'));
	assert(!styles.includes('--sd-code-shell: 220 20% 98%;'));
}

function run(): void {
	const tests: Array<[string, () => void]> = [
		['reasoning is separate from agent trace', testReasoningIsNotAgentTrace],
		['agent run owns the tool timeline', testAgentRunOwnsToolTimeline],
		['diagnostic trace uses the exact debug run', testDiagnosticTraceUsesExactDebugRun],
		['artifact receipts render real previews', testArtifactReceiptsRenderRealPreviews],
		['Mermaid controls stay independent from diagram sizing', testMermaidControlsDoNotInheritDiagramSizing],
		['rich content and context previews stay interactive', testRichContentAndContextPreviewRepairs],
		['code workbench matches the Shiki palette', testCodeWorkbenchMatchesShikiPalette],
	];

	let failures = 0;
	for (const [name, test] of tests) {
		try {
			test();
			console.log(`✓ ${name}`);
		} catch (error) {
			failures += 1;
			console.error(`✗ ${name}\n  ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
		}
	}
	if (failures > 0) process.exit(1);
	console.log(`\nAll ${tests.length} tests passed`);
}

run();
