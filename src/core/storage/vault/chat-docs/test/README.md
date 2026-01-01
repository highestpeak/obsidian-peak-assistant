# ChatConversationDoc Tests

This directory contains tests for the `ChatConversationDoc.parse`, `buildMarkdown`, and `appendMessagesToContent` methods.

## Test Structure

Each test case is stored in a separate markdown file with a `caseN-` prefix:
- `case1-full-sections.md` - Complete example with all sections
- `case2-unclosed-code-block.md` - Tests unclosed code block handling
- `case3-cjk-characters.md` - Tests CJK character handling
- `case4-append-messages.md` - Base document for testing `appendMessagesToContent`

## Running Tests

### Option 1: Using tsx (Recommended)

```bash
npx tsx src/core/storage/vault/chat-docs/test/ChatConversationDoc.test.ts
```

### Option 2: Using ts-node

```bash
npx ts-node src/core/storage/vault/chat-docs/test/ChatConversationDoc.test.ts
```

### Option 3: Compile and Run

```bash
# First, build the TypeScript files (using your build process)
npm run build

# Then run the compiled JavaScript (adjust path as needed)
node dist/core/storage/vault/chat-docs/test/ChatConversationDoc.test.js
```

## Test Cases

### Case 1: Full Sections (`case1-full-sections.md`)

Tests a complete conversation document with all sections:
- **Attachments section** - Multiple attachment references
- **Short Summary** - Brief conversation summary
- **Full Summary** - Detailed conversation summary
- **Multiple Topics** - Three topics, each with multiple messages
- **NoTopic section** - Messages not belonging to any topic
- **CJK characters** - English content (for base functionality testing)

This test verifies:
- Roundtrip parsing (parse → buildMarkdown → parse)
- All sections are correctly preserved
- Topic structure is maintained
- Message grouping works correctly

### Case 2: Unclosed Code Block (`case2-unclosed-code-block.md`)

Tests handling of unclosed code blocks:
- **Mixed code blocks** - Both closed and unclosed code blocks
- **Multiple topics** - Code blocks in different topics
- **NoTopic section** - Unclosed code block in NoTopic

This test verifies:
- System automatically fixes unclosed code blocks
- All code blocks are properly closed after `buildMarkdown`
- Parsing still works correctly after fixing

### Case 3: CJK Characters (`case3-cjk-characters.md`)

Tests CJK character handling:
- **Chinese characters** - Simplified and Traditional Chinese
- **Japanese characters** - Hiragana, Katakana, and Kanji
- **Korean characters** - Hangul
- **Mixed CJK** - All three languages in one document
- **Multiple topics** - Each topic contains CJK content

This test verifies:
- CJK characters are correctly preserved
- Roundtrip parsing works with CJK content
- Topic and message structure is maintained with CJK

### Case 4: Append Messages (`case4-append-messages.md`)

Base document for testing `appendMessagesToContent` method with different scenarios:
- **Case 4a**: Append messages only (to NoTopic section)
- **Case 4b**: Append topics only
- **Case 4c**: Append both topics and messages (no overlap)
- **Case 4d**: Mixed topic assignment (some messages in topics, some in NoTopic)

This test verifies:
- Messages are correctly appended to NoTopic section
- Topics are correctly appended to the document
- Combined appending (topics + messages) works correctly
- **Message deduplication**: Messages that appear in both `messages` array and `topics` are NOT duplicated in NoTopic section
- Mixed scenarios where some messages go to topics and others to NoTopic
- Message and topic counts are accurate after appending

### Case 5: Build Markdown Configurations

Tests `buildMarkdown` method with different `ChatConversationDocModel` configurations:
- **Case 5a**: Empty document (all fields empty)
- **Case 5b**: Only summaries (no topics, no messages)
- **Case 5c**: Topics only (no NoTopic messages)
- **Case 5d**: NoTopic messages only (no topics)
- **Case 5e**: Complete document (all fields populated)

This test verifies:
- `buildMarkdown` handles edge cases correctly
- Empty documents are generated properly
- Partial documents (only summaries, only topics, etc.) work correctly
- Complete documents with all fields are generated correctly

## Test Methodology

### Parse Tests (Cases 1-3)

Each parse test performs a **roundtrip verification**:
1. Parse the original markdown file
2. Build markdown from the parsed model
3. Parse the rebuilt markdown again
4. Compare the two parsed results

This ensures that:
- Parsing works correctly
- Building markdown works correctly
- The format is stable (can be saved and reloaded without data loss)

### Append Tests (Case 4)

Append tests verify the `appendMessagesToContent` method:
1. Parse the initial markdown document
2. Append new content (messages, topics, or both)
3. Parse the updated markdown
4. Verify message and topic counts match expectations

This ensures that:
- Messages are correctly appended to NoTopic section
- Topics are correctly appended
- Combined appending works correctly

### Build Tests (Case 5)

Build tests verify the `buildMarkdown` method with different configurations:
1. Create a `ChatConversationDocModel` with specific fields
2. Build markdown from the model
3. Parse the built markdown
4. Verify all fields match the original model

This ensures that:
- All document configurations are handled correctly
- Edge cases (empty, partial documents) work properly

## Purpose

These tests help verify the conversation document parsing and building logic, especially for:
- Complete document structure (all sections)
- Code block handling (including unclosed blocks)
- CJK character support
- Topic grouping and organization
- Message preservation across roundtrips
- Appending messages and topics to existing documents
- Building documents from different configurations
