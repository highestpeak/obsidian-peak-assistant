// T11I source-scan guard for the ChatRuntimeStatePort extraction.
// SystemPromptSlot and service-conversation must read chat UI toggles
// (chatMode / enableWebSearch / enableVaultSearch) through the port
// rather than calling `useChatViewStore.getState()` directly.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PORT = path.resolve(ROOT, 'src/service/chat/ChatRuntimeStatePort.ts');
const ADAPTER = path.resolve(ROOT, 'src/app/chat/ChatRuntimeStateAdapter.ts');
const SLOT = path.resolve(ROOT, 'src/service/chat/context/slots/SystemPromptSlot.ts');
const CONV = path.resolve(ROOT, 'src/service/chat/service-conversation.ts');
const MGR = path.resolve(ROOT, 'src/service/chat/service-manager.ts');

function readNoComments(p: string): string {
	const src = fs.readFileSync(p, 'utf8');
	return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function testPortFileShape(): void {
	assert.ok(fs.existsSync(PORT));
	const src = readNoComments(PORT);
	for (const fn of ['getChatMode', 'isWebSearchEnabled', 'isVaultSearchEnabled']) {
		assert.ok(src.includes(fn), `ChatRuntimeStatePort must declare ${fn}`);
	}
	assert.ok(
		!/import[^;]*from\s+['"]@\/ui/.test(src),
		'ChatRuntimeStatePort.ts must not import @/ui/*',
	);
	console.log('PASS: portFileShape');
}

function testAdapterShape(): void {
	assert.ok(fs.existsSync(ADAPTER));
	const src = readNoComments(ADAPTER);
	assert.ok(/useChatViewStore/.test(src), 'adapter must wrap useChatViewStore');
	assert.ok(/implements\s+ChatRuntimeStatePort/.test(src));
	console.log('PASS: adapterShape');
}

function testSlotHasNoUiImport(): void {
	const src = readNoComments(SLOT);
	assert.ok(
		!/from\s+['"]@\/ui\//.test(src),
		'SystemPromptSlot.ts must not import @/ui/*',
	);
	assert.ok(
		!/useChatViewStore\.getState\(/.test(src),
		'SystemPromptSlot.ts must not call useChatViewStore.getState() — go through ChatRuntimeStatePort',
	);
	assert.ok(
		/ChatRuntimeStatePort/.test(src),
		'SystemPromptSlot.ts must import ChatRuntimeStatePort',
	);
	console.log('PASS: slotHasNoUiImport');
}

function testConvHasNoUiImport(): void {
	const src = readNoComments(CONV);
	assert.ok(
		!/from\s+['"]@\/ui\//.test(src),
		'service-conversation.ts must not import @/ui/*',
	);
	assert.ok(
		!/useChatViewStore\.getState\(/.test(src),
		'service-conversation.ts must not call useChatViewStore.getState() — go through ChatRuntimeStatePort',
	);
	console.log('PASS: convHasNoUiImport');
}

function testMgrThreadsPort(): void {
	const src = readNoComments(MGR);
	assert.ok(/ChatRuntimeStatePort/.test(src), 'AIServiceManager must reference ChatRuntimeStatePort');
	// Must forward to SystemPromptSlot and ConversationService in both init() and refreshDefaultServices()
	const slotForwardCount = (src.match(/new\s+SystemPromptSlot\([^)]*this\.chatRuntimeState/g) ?? []).length;
	assert.strictEqual(slotForwardCount, 2, `expected 2 SystemPromptSlot construction sites forwarding chatRuntimeState; got ${slotForwardCount}`);
	const convForwardCount = (src.match(/new\s+ConversationService\([\s\S]*?this\.chatRuntimeState[\s\S]*?\)/g) ?? []).length;
	assert.strictEqual(convForwardCount, 2, `expected 2 ConversationService construction sites forwarding chatRuntimeState; got ${convForwardCount}`);
	console.log('PASS: mgrThreadsPort');
}

try {
	testPortFileShape();
	testAdapterShape();
	testSlotHasNoUiImport();
	testConvHasNoUiImport();
	testMgrThreadsPort();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
