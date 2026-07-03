// B2.chat — useStreamChat routes each conversation turn through runChatConversation.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const HOOK_PATH = path.resolve(process.cwd(), 'src/ui/view/chat-view/hooks/useStreamChat.ts');
const source = fs.readFileSync(HOOK_PATH, 'utf8');

function stripComments(input: string): string {
	return input.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function testHookImportsRunner(): void {
	assert.ok(
		source.includes(`from '@/service/chat/ChatConversationRun'`),
		'useStreamChat.ts must import runChatConversation from ChatConversationRun',
	);
	assert.ok(
		source.includes('runChatConversation'),
		'useStreamChat.ts must reference runChatConversation',
	);
	console.log('PASS: hookImportsRunner');
}

function testStreamChatWrapsWithEnvelope(): void {
	const stripped = stripComments(source);
	assert.match(
		stripped,
		/runChatConversation<StreamChatResult>\s*\(\s*\{[\s\S]*?trigger:\s*['"]manual['"][\s\S]*?send:\s*async\s*\(\)\s*=>\s*\{/,
		'streamChat callback body must be wrapped by runChatConversation({ trigger: "manual", send: async () => { ... } })',
	);
	console.log('PASS: streamChatWrapsWithEnvelope');
}

function testEnvelopePayloadIsReturned(): void {
	const stripped = stripComments(source);
	assert.match(
		stripped,
		/return\s+result\.payload\s*;/,
		'wrapped call must return result.payload so the StreamChatResult shape is unchanged',
	);
	console.log('PASS: envelopePayloadIsReturned');
}

testHookImportsRunner();
testStreamChatWrapsWithEnvelope();
testEnvelopePayloadIsReturned();
console.log('b2-chat-wire-in: all guards passed');
