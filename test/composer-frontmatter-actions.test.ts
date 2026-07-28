/**
 * Frontmatter block-row parity: the aggregate badge stays available for the
 * richer suggestion flow while the visible quick row exposes the two concrete
 * design actions (补标签 / 规范属性).
 */

import { composeComposerCapabilityRuntime } from '@/app/composer/capabilities/composeComposerCapabilityRuntime';
import {
	FRONTMATTER_QUICK_ACTION_IDS,
	NORMALIZE_PROPERTIES_CAPABILITY_ID,
	SUGGEST_PROPERTIES_CAPABILITY_ID,
	SUGGEST_TAGS_CAPABILITY_ID,
} from '@/service/composer';
import { FakeVault, blockOfKind, makeChecker, makeHub, openSession } from './helpers/composer-fakes';
import { FakeComposerExecutor, nextRunEvent } from './helpers/capability-fakes';

const { check, done } = makeChecker();

const SOURCE = [
	'---',
	'created: 2026-07-27',
	'tags: [pkm]',
	'status: evergreen',
	'---',
	'',
	'# Peak Composer',
	'',
	'This note explains block-level editing and knowledge workflows.',
	'',
].join('\n');

async function main(): Promise<void> {
	const vault = new FakeVault();
	const session = openSession(vault, 'composer.md', SOURCE);
	const hub = makeHub(vault, session);
	const executor = new FakeComposerExecutor();
	const runtime = composeComposerCapabilityRuntime({ executor }).forDocument(session, hub);
	const frontmatter = blockOfKind(session, 'frontmatter');
	const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: frontmatter.blockId });
	const actions = runtime.actionsFor(snapshot, 'block-row');
	const ids = actions.map((action) => action.capabilityId);

	check('aggregate AI property suggestion remains projected', ids.includes(SUGGEST_PROPERTIES_CAPABILITY_ID), ids.join(','));
	check(
		'frontmatter projects exactly the two designed quick actions',
		FRONTMATTER_QUICK_ACTION_IDS.every((id) => ids.includes(id)),
		ids.join(','),
	);
	check(
		'quick labels match the design package',
		actions
			.filter((action) => FRONTMATTER_QUICK_ACTION_IDS.includes(
				action.capabilityId as (typeof FRONTMATTER_QUICK_ACTION_IDS)[number],
			))
			.map((action) => action.title)
			.join(',') === '补标签,规范属性',
		actions.map((action) => action.title).join(','),
	);
	check('tag action id stays stable', ids.includes(SUGGEST_TAGS_CAPABILITY_ID));
	check('normalization action id stays stable', ids.includes(NORMALIZE_PROPERTIES_CAPABILITY_ID));

	executor.queue({ chunks: ['tags: [pkm, composer] — current note discusses Composer workflows'] });
	const ready = nextRunEvent(runtime, 'variant-ready');
	runtime.invoke(SUGGEST_TAGS_CAPABILITY_ID, snapshot);
	await ready;
	const request = executor.requests[0];
	check('tag action uses the real property prompt', request?.promptId === 'composer-suggest-properties', request?.promptId);
	check(
		'tag action carries its configured preset instruction',
		String(request?.variables.instruction).includes('只建议 tags 字段'),
		String(request?.variables.instruction),
	);

	done('composer-frontmatter-actions');
}

void main();
