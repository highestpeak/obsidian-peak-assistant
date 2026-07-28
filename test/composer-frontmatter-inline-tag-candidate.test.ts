import assert from 'assert';
import { readFileSync } from 'fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type {
	ComposerCandidate,
	ComposerCandidateRuntimePort,
	ComposerResultEnvelope,
} from '@/core/composer';
import { FrontmatterBlockView } from '@/ui/view/composer/blocks/frontmatter';
import { FakeVault, blockOfKind, openSession } from './helpers/composer-fakes';

const SOURCE = [
	'---',
	'created: 2026-07-27',
	'tags: [pkm, information-management]',
	'---',
	'',
	'# Peak Composer',
	'',
	'Composer supports visual block editing and AI-assisted workflows.',
].join('\n');

const vault = new FakeVault();
const session = openSession(vault, 'inline-tag-candidate.md', SOURCE);
const frontmatter = blockOfKind(session, 'frontmatter');
const envelope: ComposerResultEnvelope = {
	resultKind: 'metadata-field-patch',
	rendererId: 'composer.renderer.metadata-suggestion',
	writebackAdapterId: 'composer.writeback.metadata-field-patch',
	payload: {
		key: 'tags',
		value: ['markdown-editing', 'ai-assisted'],
		valueKind: 'list',
		origin: 'ai',
		replacementBlockSource: SOURCE,
	},
};
const candidate: ComposerCandidate = {
	candidateId: 'candidate-tags',
	target: { kind: 'block', blockId: frontmatter.blockId },
	anchorBlockId: frontmatter.blockId,
	baseRevision: session.baseRevision,
	status: 'ready',
	variants: [{
		variantId: 'variant-tags',
		provenance: 'initial',
		status: 'ready',
		proposedChange: { operations: [], result: envelope },
		createdAt: 0,
	}],
	activeVariantId: 'variant-tags',
	proposedChange: { operations: [], result: envelope },
};
const runtime: ComposerCandidateRuntimePort = {
	subscribe: (callback) => {
		callback([candidate]);
		return () => undefined;
	},
	onRunEvent: () => () => undefined,
	rendererIdFor: () => 'composer.renderer.metadata-suggestion',
	regenerate: () => ({ runId: 'rerun', cancel: () => undefined }),
	cancel: () => undefined,
	isStreaming: () => false,
	accept: async () => undefined,
	discard: () => undefined,
	setActiveVariant: () => undefined,
};

const html = renderToStaticMarkup(
	React.createElement(FrontmatterBlockView, {
		block: frontmatter,
		candidate: { runtime, candidate },
	}),
);

assert.ok(html.includes('pk-fm-tag--candidate'), 'tag proposal must reuse the tags field chip family');
assert.ok(html.includes('+ markdown-editing'), 'first tag proposal must be rendered inline');
assert.ok(html.includes('+ ai-assisted'), 'second tag proposal must be rendered inline');
assert.ok(html.indexOf('information-management') < html.indexOf('+ markdown-editing'), 'candidate tags must follow committed tags');
assert.ok(html.indexOf('pk-fm-tag--candidate') < html.indexOf('pk-fm-candidate-review'), 'field-level proposal must render before the confirmation strip');
assert.ok(html.includes('补标签'), 'review strip must identify the current field-level operation');
assert.ok(html.includes('候选直接标在对应 Frontmatter 字段中'), 'review strip must explain that candidates are in place');

const rootSource = readFileSync('src/ui/view/composer/ComposerRoot.tsx', 'utf8');
assert.ok(rootSource.includes('const replacesBlockBody = hasInlineCandidate && !frontmatterCandidate;'), 'metadata candidates must not replace their frontmatter body');
assert.ok(rootSource.includes('frontmatterCandidate={frontmatterCandidate}'), 'root must hand metadata candidates to the frontmatter field renderer');

console.log('composer-frontmatter-inline-tag-candidate: passed');
