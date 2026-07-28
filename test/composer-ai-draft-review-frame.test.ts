import assert from 'assert';
import { readFileSync } from 'fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
	ComposerCandidate,
	ComposerCandidateRuntimePort,
	ComposerResultEnvelope,
} from '@/core/composer';
import { StreamingTextCandidateCard } from '@/ui/view/composer/candidates';
import { DEFAULT_CANDIDATE_UI_STRINGS } from '@/ui/view/composer/candidates/candidateUiConfig';

const envelope: ComposerResultEnvelope = {
	resultKind: 'text-patch',
	rendererId: 'composer.renderer.streaming-text',
	writebackAdapterId: 'composer.writeback.text-patch',
	payload: { replacementText: '- 这节最希望读者带走的判断是什么？\n- 哪个例子能证明这个判断？' },
};
const candidate: ComposerCandidate = {
	candidateId: 'candidate-ai-draft',
	target: { kind: 'block', blockId: 'paragraph-1' },
	anchorBlockId: 'paragraph-1',
	baseRevision: 'rev-1',
	status: 'ready',
	variants: [{
		variantId: 'variant-1',
		provenance: 'initial',
		status: 'ready',
		proposedChange: { operations: [], result: envelope },
		createdAt: 0,
	}],
	activeVariantId: 'variant-1',
	proposedChange: { operations: [], result: envelope },
};
const runtime: ComposerCandidateRuntimePort = {
	subscribe: () => () => undefined,
	onRunEvent: () => () => undefined,
	rendererIdFor: () => 'composer.renderer.streaming-text',
	candidateLabelFor: () => '提出追问',
	regenerate: () => ({ runId: 'regenerate', cancel: () => undefined }),
	cancel: () => undefined,
	isStreaming: () => false,
	accept: async () => undefined,
	discard: () => undefined,
	setActiveVariant: () => undefined,
};

function render(streamingText: string | null): string {
	return renderToStaticMarkup(
		React.createElement(StreamingTextCandidateCard, {
			candidate,
			runtime,
			strings: DEFAULT_CANDIDATE_UI_STRINGS,
			streamingText,
			originalText: '原始段落。',
		}),
	);
}

const ready = render(null);
assert.ok(ready.includes('data-candidate-status="ready"'), 'ready proposal must expose a stable state attribute');
assert.ok(ready.includes('pk-text-candidate__body'), 'review frame must keep a dedicated draft body');
assert.ok(ready.includes('pk-text-candidate__footer'), 'review frame must keep a fixed footer');
assert.ok(ready.includes('pk-text-candidate__status'), 'footer must carry draft status separately from actions');
assert.ok(ready.includes('AI 草稿'), 'ready footer must identify the content as an AI draft');
assert.ok(ready.includes('提出追问 · 版本 1/1 · 未写入 Markdown'), 'footer must use the producing action and version metadata');
assert.ok(ready.includes('告诉 AI 这版怎么改…'), 'footer must provide the design follow-up prompt');
assert.ok(ready.includes('pk-text-candidate__list'), 'bullet-shaped proposal must render as a readable list');
assert.ok(ready.includes('pk-text-candidate__button--quiet'), 'secondary review actions must not compete with acceptance');

const streaming = render('- 这节最希望读者带走的判断是什么？\n- 哪个例子能证明这个判断？');
assert.ok(streaming.includes('data-candidate-status="streaming"'), 'streaming proposal must expose streaming state');
assert.ok(streaming.includes('AI 生成中…'), 'streaming footer must switch its status title');
assert.ok(streaming.includes('正在流式生成版本 1/1'), 'streaming footer must state the live generation state');
assert.ok(streaming.includes('animate-pulse'), 'streaming list must retain the live caret');

const css = readFileSync('src/styles/composer.css', 'utf8');
assert.match(css, /\.pk-text-candidate\s*\{[\s\S]*?grid-template-rows:\s*minmax\(148px, auto\) auto;[\s\S]*?border:\s*1px solid var\(--pk-border\);[\s\S]*?border-radius:\s*var\(--pk-radius-lg\);/, 'AI draft needs one framed body, not a separator strip');
assert.match(css, /\.pk-text-candidate__footer\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) minmax\(190px, 320px\) auto;[\s\S]*?border-top:\s*1px solid var\(--pk-border-soft\);/, 'review footer must align status, instruction and actions');

console.log('composer-ai-draft-review-frame: passed');
