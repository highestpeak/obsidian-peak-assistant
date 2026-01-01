/**
 * Test file for ChatConversationDoc.parse, buildMarkdown and appendMessagesToContent methods
 * 
 * This test file reads markdown test cases from separate .md files
 * Run with: npx tsx src/core/storage/vault/chat-docs/test/ChatConversationDoc.test.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ChatConversationDoc } from '../ChatConversationDoc';
import type { ChatConversationDocModel, ChatConversationTopicDoc, ChatMessageDoc } from '../ChatConversationDoc';
import type { ChatMessage } from '@/service/chat/types';

/**
 * Read test markdown file
 */
function readTestFile(filename: string): string {
	const filePath = join(__dirname, filename);
	return readFileSync(filePath, 'utf-8');
}

/**
 * Test parse and buildMarkdown roundtrip
 */
function testRoundtrip(name: string, markdown: string): boolean {
	console.log(`\n=== Test: ${name} ===`);
	
	try {
		// Step 1: Parse markdown
		const parsed: ChatConversationDocModel = ChatConversationDoc.parse(markdown);
		
		console.log('Parsed result:');
		console.log(`  Attachments: ${parsed.attachments.length}`);
		console.log(`  Short Summary: ${parsed.shortSummary ? 'Yes' : 'No'}`);
		console.log(`  Full Summary: ${parsed.fullSummary ? 'Yes' : 'No'}`);
		console.log(`  Topics: ${parsed.topics.length}`);
		console.log(`  Messages (NoTopic): ${parsed.messages.length}`);
		
		// Count total messages
		let totalMessages = parsed.messages.length;
		parsed.topics.forEach((topic, idx) => {
			console.log(`  Topic ${idx + 1} "${topic.title}": ${topic.messages.length} messages`);
			totalMessages += topic.messages.length;
		});
		console.log(`  Total messages: ${totalMessages}`);
		
		// Step 2: Build markdown from parsed model
		const rebuilt = ChatConversationDoc.buildMarkdown({
			docModel: parsed,
		});
		
		// Step 3: Parse again to verify roundtrip
		const reparsed = ChatConversationDoc.parse(rebuilt);
		
		// Verify roundtrip
		const attachmentsMatch = JSON.stringify(parsed.attachments) === JSON.stringify(reparsed.attachments);
		const shortSummaryMatch = parsed.shortSummary === reparsed.shortSummary;
		const fullSummaryMatch = parsed.fullSummary === reparsed.fullSummary;
		const topicsCountMatch = parsed.topics.length === reparsed.topics.length;
		const messagesCountMatch = parsed.messages.length === reparsed.messages.length;
		
		// Verify topics structure
		let topicsMatch = true;
		if (parsed.topics.length === reparsed.topics.length) {
			for (let i = 0; i < parsed.topics.length; i++) {
				const original = parsed.topics[i];
				const rebuilt = reparsed.topics[i];
				if (original.title !== rebuilt.title ||
					original.summary !== rebuilt.summary ||
					original.messages.length !== rebuilt.messages.length) {
					topicsMatch = false;
					break;
				}
			}
		} else {
			topicsMatch = false;
		}
		
		const passed = attachmentsMatch && shortSummaryMatch && fullSummaryMatch && 
			topicsCountMatch && messagesCountMatch && topicsMatch;
		
		console.log(`\nRoundtrip verification:`);
		console.log(`  Attachments: ${attachmentsMatch ? '✅' : '❌'}`);
		console.log(`  Short Summary: ${shortSummaryMatch ? '✅' : '❌'}`);
		console.log(`  Full Summary: ${fullSummaryMatch ? '✅' : '❌'}`);
		console.log(`  Topics count: ${topicsCountMatch ? '✅' : '❌'}`);
		console.log(`  Messages count: ${messagesCountMatch ? '✅' : '❌'}`);
		console.log(`  Topics structure: ${topicsMatch ? '✅' : '❌'}`);
		console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}`);
		
		if (!passed) {
			console.log('\nOriginal parsed:');
			console.log(JSON.stringify(parsed, null, 2));
			console.log('\nReparsed:');
			console.log(JSON.stringify(reparsed, null, 2));
		}
		
		return passed;
	} catch (error) {
		console.error(`\n❌ ERROR: ${error}`);
		if (error instanceof Error) {
			console.error(error.stack);
		}
		return false;
	}
}

/**
 * Test unclosed code block handling
 */
function testUnclosedCodeBlock(name: string, markdown: string): boolean {
	console.log(`\n=== Test: ${name} ===`);
	
	try {
		// Parse markdown
		const parsed = ChatConversationDoc.parse(markdown);
		
		// Build markdown (should fix unclosed code blocks)
		const rebuilt = ChatConversationDoc.buildMarkdown({
			docModel: parsed,
		});
		
		// Count code blocks in rebuilt markdown
		const codeBlockMatches = rebuilt.match(/```/g);
		const codeBlockCount = codeBlockMatches ? codeBlockMatches.length : 0;
		const isEven = codeBlockCount % 2 === 0;
		
		console.log(`  Code block markers in rebuilt: ${codeBlockCount}`);
		console.log(`  All code blocks closed: ${isEven ? '✅' : '❌'}`);
		
		// Parse again to verify it's still valid
		const reparsed = ChatConversationDoc.parse(rebuilt);
		
		const passed = isEven && reparsed.topics.length > 0;
		
		console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}`);
		
		return passed;
	} catch (error) {
		console.error(`\n❌ ERROR: ${error}`);
		if (error instanceof Error) {
			console.error(error.stack);
		}
		return false;
	}
}

/**
 * Test appendMessagesToContent with different scenarios
 */
function testAppendMessages(name: string, initialContent: string, appendParams: {
	messages?: ChatMessage[];
	topics?: ChatConversationTopicDoc[];
}): boolean {
	console.log(`\n=== Test: ${name} ===`);
	
	try {
		// Parse initial content
		const initialParsed = ChatConversationDoc.parse(initialContent);
		const initialMessageCount = initialParsed.messages.length + 
			initialParsed.topics.reduce((sum, t) => sum + t.messages.length, 0);
		const initialTopicCount = initialParsed.topics.length;
		
		console.log(`  Initial: ${initialTopicCount} topics, ${initialMessageCount} total messages`);
		
		// Calculate expected counts
		const newMessagesCount = appendParams.messages?.length || 0;
		const newTopicsCount = appendParams.topics?.length || 0;
		const newTopicsMessagesCount = (appendParams.topics || []).reduce((sum, t) => sum + t.messages.length, 0);
		
		// Count messages that are in topics (to avoid double counting)
		// Messages that appear in both messages array and topics should only be counted once
		let messagesAlreadyInTopics = 0;
		if (appendParams.topics && appendParams.messages && appendParams.messages.length > 0) {
			const messagesInTopics = new Set<string>();
			for (const topic of appendParams.topics) {
				for (const topicMsg of topic.messages) {
					const msgKey = `${topicMsg.role}|${topicMsg.content}|${topicMsg.title || ''}`;
					messagesInTopics.add(msgKey);
				}
			}
			
			// Count how many messages from messages array are already in topics
			for (const msg of appendParams.messages) {
				if (msg.role === 'user' || msg.role === 'assistant') {
					const msgKey = `${msg.role}|${msg.content}|${msg.title || ''}`;
					if (messagesInTopics.has(msgKey)) {
						messagesAlreadyInTopics++;
					}
				}
			}
		}
		
		// Expected messages = initial + new messages (excluding those already in topics) + messages only in topics
		// Since messages in topics are already counted in newTopicsMessagesCount,
		// we need to subtract the overlap to avoid double counting
		const expectedMessages = initialMessageCount + newMessagesCount + newTopicsMessagesCount - messagesAlreadyInTopics;
		const expectedTopics = initialTopicCount + newTopicsCount;
		
		// Append content
		const newContent = ChatConversationDoc.appendMessagesToContent(initialContent, appendParams);
		
		// Parse new content
		const newParsed = ChatConversationDoc.parse(newContent);
		const newMessageCount = newParsed.messages.length + 
			newParsed.topics.reduce((sum, t) => sum + t.messages.length, 0);
		const newTopicCount = newParsed.topics.length;
		
		console.log(`  After append: ${newTopicCount} topics, ${newMessageCount} total messages`);
		console.log(`  Expected: ${expectedTopics} topics, ${expectedMessages} messages`);
		
		// Verify
		const messagesMatch = newMessageCount === expectedMessages;
		const topicsMatch = newTopicCount === expectedTopics;
		
		console.log(`  Messages match: ${messagesMatch ? '✅' : '❌'}`);
		console.log(`  Topics match: ${topicsMatch ? '✅' : '❌'}`);
		
		if (!messagesMatch || !topicsMatch) {
			console.log(`  Details:`);
			console.log(`    Initial messages: ${initialMessageCount}`);
			console.log(`    New messages (NoTopic): ${newMessagesCount}`);
			console.log(`    New topics messages: ${newTopicsMessagesCount}`);
			console.log(`    Total expected: ${expectedMessages}, got: ${newMessageCount}`);
		}
		
		const passed = messagesMatch && topicsMatch;
		console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}`);
		
		return passed;
	} catch (error) {
		console.error(`\n❌ ERROR: ${error}`);
		if (error instanceof Error) {
			console.error(error.stack);
		}
		return false;
	}
}

/**
 * Test buildMarkdown with different docModel configurations
 */
function testBuildMarkdown(name: string, docModel: ChatConversationDocModel): boolean {
	console.log(`\n=== Test: ${name} ===`);
	
	try {
		// Build markdown
		const built = ChatConversationDoc.buildMarkdown({ docModel });
		
		// Parse back
		const parsed = ChatConversationDoc.parse(built);
		
		// Verify
		const attachmentsMatch = JSON.stringify(docModel.attachments) === JSON.stringify(parsed.attachments);
		const shortSummaryMatch = docModel.shortSummary === parsed.shortSummary;
		const fullSummaryMatch = docModel.fullSummary === parsed.fullSummary;
		const topicsCountMatch = docModel.topics.length === parsed.topics.length;
		const messagesCountMatch = docModel.messages.length === parsed.messages.length;
		
		console.log(`  Attachments: ${attachmentsMatch ? '✅' : '❌'}`);
		console.log(`  Short Summary: ${shortSummaryMatch ? '✅' : '❌'}`);
		console.log(`  Full Summary: ${fullSummaryMatch ? '✅' : '❌'}`);
		console.log(`  Topics count: ${topicsCountMatch ? '✅' : '❌'}`);
		console.log(`  Messages count: ${messagesCountMatch ? '✅' : '❌'}`);
		
		const passed = attachmentsMatch && shortSummaryMatch && fullSummaryMatch && 
			topicsCountMatch && messagesCountMatch;
		
		console.log(`\n${passed ? '✅ PASSED' : '❌ FAILED'}`);
		
		return passed;
	} catch (error) {
		console.error(`\n❌ ERROR: ${error}`);
		if (error instanceof Error) {
			console.error(error.stack);
		}
		return false;
	}
}

// Main test execution
console.log('Starting ChatConversationDoc tests...\n');
console.log('='.repeat(60));

let allPassed = true;

// Test 1: Full sections with all features
try {
	const fullSectionsMarkdown = readTestFile('case1-full-sections.md');
	allPassed = testRoundtrip('Case 1: Full sections with all features (CJK, multiple topics, multiple messages)', fullSectionsMarkdown) && allPassed;
} catch (error) {
	console.error(`\n❌ Failed to read case1-full-sections.md: ${error}`);
	allPassed = false;
}

// Test 2: Unclosed code blocks
try {
	const unclosedCodeBlockMarkdown = readTestFile('case2-unclosed-code-block.md');
	allPassed = testUnclosedCodeBlock('Case 2: Unclosed code block handling', unclosedCodeBlockMarkdown) && allPassed;
} catch (error) {
	console.error(`\n❌ Failed to read case2-unclosed-code-block.md: ${error}`);
	allPassed = false;
}

// Test 3: CJK characters
try {
	const cjkMarkdown = readTestFile('case3-cjk-characters.md');
	allPassed = testRoundtrip('Case 3: CJK characters (Chinese, Japanese, Korean)', cjkMarkdown) && allPassed;
} catch (error) {
	console.error(`\n❌ Failed to read case3-cjk-characters.md: ${error}`);
	allPassed = false;
}

// Test 4: Append messages only
try {
	const appendBase = readTestFile('case4-append-messages.md');
	
	// Test 4a: Append messages only
	const newMessages: ChatMessage[] = [
		{
			id: 'msg1',
			role: 'user',
			content: 'New user message',
			title: 'New message',
			createdAtTimestamp: Date.now(),
			createdAtZone: '',
			starred: false,
			model: '',
			provider: '',
		},
		{
			id: 'msg2',
			role: 'assistant',
			content: 'New assistant response',
			title: 'New response',
			createdAtTimestamp: Date.now(),
			createdAtZone: '',
			starred: false,
			model: '',
			provider: '',
		},
	];
	allPassed = testAppendMessages('Case 4a: Append messages only', appendBase, { messages: newMessages }) && allPassed;
	
	// Test 4b: Append topics only
	const newTopic: ChatConversationTopicDoc = {
		title: 'New Topic',
		summary: 'This is a new topic summary',
		messages: [
			{ role: 'user', content: 'Topic message 1', title: 'Topic msg 1' },
			{ role: 'assistant', content: 'Topic response 1', title: 'Topic resp 1' },
		],
	};
	allPassed = testAppendMessages('Case 4b: Append topics only', appendBase, { topics: [newTopic] }) && allPassed;
	
	// Test 4c: Append both topics and messages
	allPassed = testAppendMessages('Case 4c: Append topics and messages', appendBase, { 
		topics: [newTopic],
		messages: newMessages,
	}) && allPassed;
	
	// Test 4d: Mixed topic assignment (some messages in topics, some in NoTopic)
	const mixedMessages: ChatMessage[] = [
		{
			id: 'msg1',
			role: 'user',
			content: 'Message for topic',
			title: 'Topic message',
			createdAtTimestamp: Date.now(),
			createdAtZone: '',
			starred: false,
			model: '',
			provider: '',
		},
		{
			id: 'msg2',
			role: 'assistant',
			content: 'Response for topic',
			title: 'Topic response',
			createdAtTimestamp: Date.now(),
			createdAtZone: '',
			starred: false,
			model: '',
			provider: '',
		},
		{
			id: 'msg3',
			role: 'user',
			content: 'Message for NoTopic',
			title: 'NoTopic message',
			createdAtTimestamp: Date.now(),
			createdAtZone: '',
			starred: false,
			model: '',
			provider: '',
		},
	];
	
	// Create a topic that contains msg1 and msg2
	const mixedTopic: ChatConversationTopicDoc = {
		title: 'Mixed Topic',
		summary: 'This topic contains some of the messages',
		messages: [
			{ role: 'user', content: 'Message for topic', title: 'Topic message' },
			{ role: 'assistant', content: 'Response for topic', title: 'Topic response' },
		],
	};
	
	// Test: msg1 and msg2 should go to topic, msg3 should go to NoTopic
	allPassed = testAppendMessages('Case 4d: Mixed topic assignment (some in topic, some in NoTopic)', appendBase, {
		topics: [mixedTopic],
		messages: mixedMessages,
	}) && allPassed;
	
	// Test 4e: Move existing NoTopic messages to topics
	// This tests the scenario where existing messages in NoTopic are moved to new topics
	const moveToTopicBase = readTestFile('case4-append-messages.md');
	
	// Parse base to get the actual existing message
	const baseParsed = ChatConversationDoc.parse(moveToTopicBase);
	if (baseParsed.messages.length === 0) {
		console.log('\n=== Test: Case 4e: Move existing NoTopic messages to topics ===');
		console.log('  ⚠️  SKIPPED: No existing NoTopic messages to test');
		allPassed = true && allPassed; // Skip this test if no messages
	} else {
		// Use the first existing message from NoTopic
		const existingMessage = baseParsed.messages[0];
		
		// Create a topic that contains a message that already exists in NoTopic
		const topicWithExistingMessage: ChatConversationTopicDoc = {
			title: 'Topic Moving Existing Message',
			summary: 'This topic moves an existing NoTopic message',
			messages: [
				{ role: existingMessage.role, content: existingMessage.content, title: existingMessage.title },
			],
		};
	
		const initialNoTopicCount = baseParsed.messages.length;
		
		// Append topic (no new messages)
		const movedContent = ChatConversationDoc.appendMessagesToContent(moveToTopicBase, {
			topics: [topicWithExistingMessage],
		});
		
		// Parse result
		const movedParsed = ChatConversationDoc.parse(movedContent);
		const finalNoTopicCount = movedParsed.messages.length;
		const finalTopicCount = movedParsed.topics.length;
		
		// Verify: message should be moved from NoTopic to topic
		const messageMoved = finalNoTopicCount < initialNoTopicCount;
		const topicAdded = finalTopicCount > baseParsed.topics.length;
		
		console.log(`\n=== Test: Case 4e: Move existing NoTopic messages to topics ===`);
		console.log(`  Initial NoTopic messages: ${initialNoTopicCount}`);
		console.log(`  Final NoTopic messages: ${finalNoTopicCount}`);
		console.log(`  Initial topics: ${baseParsed.topics.length}`);
		console.log(`  Final topics: ${finalTopicCount}`);
		console.log(`  Message moved from NoTopic: ${messageMoved ? '✅' : '❌'}`);
		console.log(`  Topic added: ${topicAdded ? '✅' : '❌'}`);
		
		if (!messageMoved) {
			console.log(`  Details: Expected NoTopic count to decrease from ${initialNoTopicCount} to ${finalNoTopicCount}`);
			console.log(`  Existing message: ${JSON.stringify(existingMessage)}`);
		}
		
		const passed4e = messageMoved && topicAdded;
		console.log(`\n${passed4e ? '✅ PASSED' : '❌ FAILED'}`);
		allPassed = passed4e && allPassed;
	}
} catch (error) {
	console.error(`\n❌ Failed to read case4-append-messages.md: ${error}`);
	allPassed = false;
}

// Test 5: Build markdown with different configurations
console.log('\n' + '='.repeat(60));
console.log('=== Test buildMarkdown with different configurations ===');
console.log('='.repeat(60));

// Test 5a: Empty document
allPassed = testBuildMarkdown('Case 5a: Empty document', {
	attachments: [],
	shortSummary: '',
	fullSummary: '',
	topics: [],
	messages: [],
}) && allPassed;

// Test 5b: Document with only summaries
allPassed = testBuildMarkdown('Case 5b: Only summaries', {
	attachments: [],
	shortSummary: 'Short summary',
	fullSummary: 'Full summary',
	topics: [],
	messages: [],
}) && allPassed;

// Test 5c: Document with topics only
allPassed = testBuildMarkdown('Case 5c: Topics only', {
	attachments: [],
	shortSummary: '',
	fullSummary: '',
	topics: [
		{
			title: 'Topic 1',
			summary: 'Topic summary',
			messages: [
				{ role: 'user', content: 'Message 1' },
				{ role: 'assistant', content: 'Response 1' },
			],
		},
	],
	messages: [],
}) && allPassed;

// Test 5d: Document with NoTopic messages only
allPassed = testBuildMarkdown('Case 5d: NoTopic messages only', {
	attachments: [],
	shortSummary: '',
	fullSummary: '',
	topics: [],
	messages: [
		{ role: 'user', content: 'NoTopic message 1' },
		{ role: 'assistant', content: 'NoTopic response 1' },
	],
}) && allPassed;

// Test 5e: Complete document
allPassed = testBuildMarkdown('Case 5e: Complete document', {
	attachments: ['file1.md', 'file2.png'],
	shortSummary: 'Short summary',
	fullSummary: 'Full summary',
	topics: [
		{
			title: 'Topic 1',
			summary: 'Topic 1 summary',
			messages: [
				{ role: 'user', content: 'Topic 1 message' },
			],
		},
	],
	messages: [
		{ role: 'user', content: 'NoTopic message' },
	],
}) && allPassed;

// Test 6: MD5 hash and message deduplication edge cases
console.log('\n' + '='.repeat(60));
console.log('=== Test MD5 hash and message deduplication edge cases ===');
console.log('='.repeat(60));

// Test 6a: Same content, different titles should be treated as different messages
try {
	const baseContent = ChatConversationDoc.buildMarkdown({
		docModel: {
			attachments: [],
			shortSummary: '',
			fullSummary: '',
			topics: [],
			messages: [],
		},
	});
	
	const sameContentDifferentTitles: ChatMessage[] = [
		{
			id: 'msg1',
			role: 'user',
			content: 'Same content',
			title: 'Title 1',
			createdAtTimestamp: Date.now(),
			createdAtZone: '',
			starred: false,
			model: '',
			provider: '',
		},
		{
			id: 'msg2',
			role: 'user',
			content: 'Same content',
			title: 'Title 2',
			createdAtTimestamp: Date.now(),
			createdAtZone: '',
			starred: false,
			model: '',
			provider: '',
		},
	];
	
	const result1 = ChatConversationDoc.appendMessagesToContent(baseContent, {
		messages: sameContentDifferentTitles,
	});
	const parsed1 = ChatConversationDoc.parse(result1);
	
	const test6aPassed = parsed1.messages.length === 2;
	console.log(`\n=== Test: Case 6a: Same content, different titles ===`);
	console.log(`  Messages with same content but different titles: ${parsed1.messages.length}`);
	console.log(`  Expected: 2, Got: ${parsed1.messages.length}`);
	console.log(`\n${test6aPassed ? '✅ PASSED' : '❌ FAILED'}`);
	allPassed = test6aPassed && allPassed;
} catch (error) {
	console.error(`\n❌ Case 6a failed: ${error}`);
	allPassed = false;
}

// Test 6b: Same role + content + title should be deduplicated
try {
	const baseContent = ChatConversationDoc.buildMarkdown({
		docModel: {
			attachments: [],
			shortSummary: '',
			fullSummary: '',
			topics: [],
			messages: [],
		},
	});
	
	const duplicateMessage: ChatMessage = {
		id: 'msg1',
		role: 'user',
		content: 'Duplicate message',
		title: 'Same title',
		createdAtTimestamp: Date.now(),
		createdAtZone: '',
		starred: false,
		model: '',
		provider: '',
	};
	
	// Create a topic with this message
	const topicWithMessage: ChatConversationTopicDoc = {
		title: 'Topic with message',
		summary: '',
		messages: [
			{ role: 'user', content: 'Duplicate message', title: 'Same title' },
		],
	};
	
	// Append both the message and the topic (message should not appear in NoTopic)
	const result2 = ChatConversationDoc.appendMessagesToContent(baseContent, {
		messages: [duplicateMessage],
		topics: [topicWithMessage],
	});
	const parsed2 = ChatConversationDoc.parse(result2);
	
	const test6bPassed = parsed2.messages.length === 0 && parsed2.topics.length === 1;
	console.log(`\n=== Test: Case 6b: Message deduplication (same role+content+title) ===`);
	console.log(`  NoTopic messages: ${parsed2.messages.length} (expected: 0)`);
	console.log(`  Topics: ${parsed2.topics.length} (expected: 1)`);
	console.log(`\n${test6bPassed ? '✅ PASSED' : '❌ FAILED'}`);
	allPassed = test6bPassed && allPassed;
} catch (error) {
	console.error(`\n❌ Case 6b failed: ${error}`);
	allPassed = false;
}

// Test 6c: Long content with special characters
try {
	const baseContent = ChatConversationDoc.buildMarkdown({
		docModel: {
			attachments: [],
			shortSummary: '',
			fullSummary: '',
			topics: [],
			messages: [],
		},
	});
	
	// Create a long message with special characters that could break the key format
	const longContent = 'This is a very long message with special characters: | \\n \\t "quotes" \'single quotes\' and even more content. '.repeat(10);
	const longMessage: ChatMessage = {
		id: 'msg1',
		role: 'user',
		content: longContent,
		title: 'Long message',
		createdAtTimestamp: Date.now(),
		createdAtZone: '',
		starred: false,
		model: '',
		provider: '',
	};
	
	const result3 = ChatConversationDoc.appendMessagesToContent(baseContent, {
		messages: [longMessage],
	});
	const parsed3 = ChatConversationDoc.parse(result3);
	
	// Allow small difference due to whitespace normalization (trim, etc.)
	const parsedContent = parsed3.messages[0]?.content || '';
	const contentMatches = parsedContent === longContent || 
		parsedContent.trim() === longContent.trim();
	const test6cPassed = parsed3.messages.length === 1 && 
		parsed3.messages[0] &&
		contentMatches;
	console.log(`\n=== Test: Case 6c: Long content with special characters ===`);
	console.log(`  Messages: ${parsed3.messages.length} (expected: 1)`);
	if (parsed3.messages[0]) {
		const lengthMatch = parsedContent.length === longContent.length;
		console.log(`  Content preserved: ${contentMatches ? '✅' : '❌'}`);
		console.log(`  Original length: ${longContent.length}, Parsed length: ${parsedContent.length}`);
		if (!lengthMatch) {
			console.log(`  Note: Length difference may be due to whitespace normalization`);
		}
	} else {
		console.log(`  Content preserved: ❌ (message not found)`);
	}
	console.log(`\n${test6cPassed ? '✅ PASSED' : '❌ FAILED'}`);
	allPassed = test6cPassed && allPassed;
} catch (error) {
	console.error(`\n❌ Case 6c failed: ${error}`);
	allPassed = false;
}

// Test 6d: Empty content message (should be filtered out during parsing)
// Note: Empty content messages are intentionally filtered out during parsing
// as they don't provide meaningful information. This test verifies this behavior.
try {
	const baseContent = ChatConversationDoc.buildMarkdown({
		docModel: {
			attachments: [],
			shortSummary: '',
			fullSummary: '',
			topics: [],
			messages: [],
		},
	});
	
	const emptyContentMessage: ChatMessage = {
		id: 'msg1',
		role: 'user',
		content: '',
		title: 'Empty content',
		createdAtTimestamp: Date.now(),
		createdAtZone: '',
		starred: false,
		model: '',
		provider: '',
	};
	
	const result4 = ChatConversationDoc.appendMessagesToContent(baseContent, {
		messages: [emptyContentMessage],
	});
	const parsed4 = ChatConversationDoc.parse(result4);
	
	// Empty content messages are filtered out during parsing (by design)
	const test6dPassed = parsed4.messages.length === 0;
	console.log(`\n=== Test: Case 6d: Empty content message (filtered out) ===`);
	console.log(`  Messages: ${parsed4.messages.length} (expected: 0, empty messages are filtered)`);
	console.log(`  Note: Empty content messages are intentionally filtered during parsing`);
	console.log(`\n${test6dPassed ? '✅ PASSED' : '❌ FAILED'}`);
	allPassed = test6dPassed && allPassed;
} catch (error) {
	console.error(`\n❌ Case 6d failed: ${error}`);
	if (error instanceof Error) {
		console.error(error.stack);
	}
	allPassed = false;
}

// Test 6e: Messages with same content hash but different actual content (collision test)
// Note: This is extremely unlikely with MD5, but we test the behavior
try {
	const baseContent = ChatConversationDoc.buildMarkdown({
		docModel: {
			attachments: [],
			shortSummary: '',
			fullSummary: '',
			topics: [],
			messages: [],
		},
	});
	
	// Two different messages with same role and title but different content
	const msg1: ChatMessage = {
		id: 'msg1',
		role: 'user',
		content: 'Message 1',
		title: 'Same title',
		createdAtTimestamp: Date.now(),
		createdAtZone: '',
		starred: false,
		model: '',
		provider: '',
	};
	
	const msg2: ChatMessage = {
		id: 'msg2',
		role: 'user',
		content: 'Message 2',
		title: 'Same title',
		createdAtTimestamp: Date.now(),
		createdAtZone: '',
		starred: false,
		model: '',
		provider: '',
	};
	
	// Create topic with msg1
	const topicWithMsg1: ChatConversationTopicDoc = {
		title: 'Topic',
		summary: '',
		messages: [
			{ role: 'user', content: 'Message 1', title: 'Same title' },
		],
	};
	
	// Append both messages and topic
	// msg1 should go to topic, msg2 should go to NoTopic
	const result5 = ChatConversationDoc.appendMessagesToContent(baseContent, {
		messages: [msg1, msg2],
		topics: [topicWithMsg1],
	});
	const parsed5 = ChatConversationDoc.parse(result5);
	
	const test6ePassed = parsed5.messages.length === 1 && 
		parsed5.topics.length === 1 &&
		parsed5.messages[0].content === 'Message 2';
	console.log(`\n=== Test: Case 6e: Different content with same role+title ===`);
	console.log(`  NoTopic messages: ${parsed5.messages.length} (expected: 1)`);
	console.log(`  Topics: ${parsed5.topics.length} (expected: 1)`);
	console.log(`  Remaining message content: "${parsed5.messages[0].content}" (expected: "Message 2")`);
	console.log(`\n${test6ePassed ? '✅ PASSED' : '❌ FAILED'}`);
	allPassed = test6ePassed && allPassed;
} catch (error) {
	console.error(`\n❌ Case 6e failed: ${error}`);
	allPassed = false;
}

// Summary
console.log('\n' + '='.repeat(60));
console.log(allPassed ? '✅ All tests passed!' : '❌ Some tests failed!');
console.log('='.repeat(60));

process.exit(allPassed ? 0 : 1);
