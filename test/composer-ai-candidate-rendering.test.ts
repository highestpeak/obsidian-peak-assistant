import assert from 'assert';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
	COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
	COMPOSER_STREAMING_TEXT_RENDERER_ID,
	type ComposerCandidate,
	type ComposerCandidateRuntimePort,
	type ComposerCapabilityEffectKind,
	type ComposerRendererId,
	type ComposerResultEnvelope,
} from '@/core/composer';
import { StreamingTextCandidateCard } from '@/ui/view/composer/candidates';
import { DEFAULT_CANDIDATE_UI_STRINGS } from '@/ui/view/composer/candidates/candidateUiConfig';

function renderCandidate(args: {
	envelope: ComposerResultEnvelope;
	effect: ComposerCapabilityEffectKind;
	rendererId: ComposerRendererId;
	originalText?: string | null;
}): string {
	const candidate: ComposerCandidate = {
		candidateId: 'candidate-render',
		target: { kind: 'block', blockId: 'block-1' },
		anchorBlockId: 'block-1',
		baseRevision: 'rev-1',
		status: 'ready',
		variants: [{
			variantId: 'variant-1',
			provenance: 'initial',
			status: 'ready',
			proposedChange: { operations: [], result: args.envelope },
			createdAt: 0,
		}],
		activeVariantId: 'variant-1',
		proposedChange: { operations: [], result: args.envelope },
	};
	const runtime: ComposerCandidateRuntimePort = {
		subscribe: () => () => undefined,
		onRunEvent: () => () => undefined,
		rendererIdFor: () => args.rendererId,
		candidateEffectFor: () => args.effect,
		candidateLabelFor: () => 'AI proposal',
		regenerate: () => ({ runId: 'regenerate', cancel: () => undefined }),
		cancel: () => undefined,
		isStreaming: () => false,
		accept: async () => undefined,
		discard: () => undefined,
		setActiveVariant: () => undefined,
	};
	return renderToStaticMarkup(
		React.createElement(StreamingTextCandidateCard, {
			candidate,
			runtime,
			strings: DEFAULT_CANDIDATE_UI_STRINGS,
			streamingText: null,
			originalText: args.originalText ?? null,
		}),
	);
}

const table = renderCandidate({
	effect: 'transform',
	rendererId: COMPOSER_STREAMING_TEXT_RENDERER_ID,
	envelope: {
		resultKind: 'text-patch',
		rendererId: COMPOSER_STREAMING_TEXT_RENDERER_ID,
		payload: {
			replacementText: [
				'| Item | Purpose |',
				'| --- | --- |',
				'| Source | Keep visible |',
			].join('\n'),
		},
	},
});
assert.ok(table.includes('pk-text-candidate__table'), 'structural table proposal must render as a table');
assert.ok(table.includes('<th>'), 'table headers must use readable table geometry');
assert.ok(!table.includes('| --- |'), 'separator pipes must never be exposed as candidate prose');

const styledRewrite = renderCandidate({
	effect: 'rewrite',
	rendererId: COMPOSER_STREAMING_TEXT_RENDERER_ID,
	originalText: '<span style="color: #b42318">old wording</span>',
	envelope: {
		resultKind: 'text-patch',
		rendererId: COMPOSER_STREAMING_TEXT_RENDERER_ID,
		payload: {
			replacementText: '<span style="color: #b42318">clear wording</span>',
		},
	},
});
assert.ok(styledRewrite.includes('old'), 'visual diff must retain visible original words');
assert.ok(styledRewrite.includes('clear'), 'visual diff must retain visible replacement words');
assert.ok(styledRewrite.includes('wording'), 'visual diff must retain shared visible words');
assert.ok(!styledRewrite.includes('&lt;span'), 'visual diff must not leak raw inline HTML tokens');

const listItem = renderCandidate({
	effect: 'insert',
	rendererId: COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
	envelope: {
		resultKind: 'list-item-patch',
		rendererId: COMPOSER_LIST_ITEM_PATCH_RENDERER_ID,
		payload: {
			insertionIndex: 1,
			itemMarkdown: '- Missing semantic step',
			replacementText: '- First\n- Missing semantic step\n- Second',
		},
	},
});
assert.ok(listItem.includes('data-result-layout="list-item"'), 'anchored item must use compact list layout');
assert.ok(listItem.includes('Missing semantic step'), 'anchored item must render its proposed content');

console.log('composer-ai-candidate-rendering: passed');
