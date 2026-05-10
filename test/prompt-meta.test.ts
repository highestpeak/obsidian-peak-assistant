import assert from 'node:assert';

function stripPromptMeta(content: string): { meta: string | null; template: string } {
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim();
    if (!firstLine?.startsWith('```prompt-meta')) {
        return { meta: null, template: content };
    }
    const closeIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '```');
    if (closeIndex === -1) {
        return { meta: null, template: content };
    }
    const meta = lines.slice(1, closeIndex).join('\n');
    const template = lines.slice(closeIndex + 1).join('\n').trimStart();
    return { meta, template };
}

// Test 1: strips prompt-meta block at start of file
{
    const input = [
        '```prompt-meta',
        'id: conversation-system',
        'label: Chat System Prompt',
        'variables:',
        '  - userProfile: User profile summary',
        '```',
        '',
        'You are an AI assistant.',
        '{{#if userProfile}}',
        '{{{userProfile}}}',
        '{{/if}}',
    ].join('\n');
    const result = stripPromptMeta(input);
    assert.ok(result.meta !== null, 'meta should not be null');
    assert.ok(result.meta!.includes('id: conversation-system'));
    assert.ok(result.template.startsWith('You are an AI assistant.'));
    assert.ok(result.template.includes('{{#if userProfile}}'));
    console.log('PASS: strips prompt-meta block');
}

// Test 2: returns content unchanged when no prompt-meta block
{
    const input = 'You are an AI assistant.\n{{name}}';
    const result = stripPromptMeta(input);
    assert.strictEqual(result.meta, null);
    assert.strictEqual(result.template, input);
    console.log('PASS: no prompt-meta block');
}

// Test 3: handles unclosed prompt-meta block gracefully
{
    const input = '```prompt-meta\nid: test\nno closing fence here';
    const result = stripPromptMeta(input);
    assert.strictEqual(result.meta, null);
    assert.strictEqual(result.template, input);
    console.log('PASS: unclosed prompt-meta block');
}

// Test 4: does not strip prompt-meta if not on first line
{
    const input = '\n```prompt-meta\nid: test\n```\ntemplate content';
    const result = stripPromptMeta(input);
    assert.strictEqual(result.meta, null);
    assert.strictEqual(result.template, input);
    console.log('PASS: prompt-meta not on first line');
}

// Test 5: handles empty template after meta block
{
    const input = '```prompt-meta\nid: test\n```\n';
    const result = stripPromptMeta(input);
    assert.ok(result.meta !== null);
    assert.strictEqual(result.template, '');
    console.log('PASS: empty template after meta');
}

// Test 6: does not confuse other code blocks
{
    const input = '```typescript\nconst x = 1;\n```\nSome content';
    const result = stripPromptMeta(input);
    assert.strictEqual(result.meta, null);
    assert.strictEqual(result.template, input);
    console.log('PASS: non-prompt-meta code block');
}

console.log('\nAll prompt-meta tests passed!');
