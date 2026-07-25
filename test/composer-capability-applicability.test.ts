/**
 * Peak Composer — capability applicability (WP3, CMP-AI-03).
 *
 * Target-kind matching, guard verdicts and the hidden/disabled distinction
 * per spec §5.3 / §15.2:
 *   - a compatible target projects the action (title from config, group 'ai');
 *   - an incompatible target (code block, document scope) stays hidden;
 *   - a stale snapshot is disabled WITH the configured reason;
 *   - an empty target is disabled WITH the guard's reason;
 *   - surfaces filter: polish projects to block-row/selection-toolbar only.
 */

import { DEFAULT_COMPOSER_CAPABILITIES_CONFIG, POLISH_CAPABILITY_ID } from '@/service/composer';
import type { ComposerContextSnapshot } from '@/core/composer';
import { FakeVault, openSession, makeHub, makeChecker, blockOfKind } from './helpers/composer-fakes';
import { FakeComposerExecutor, makeCapabilityRuntime } from './helpers/capability-fakes';

const { check, done } = makeChecker();

const SOURCE = [
	'# Title',
	'',
	'A paragraph that clearly needs polishing.',
	'',
	'```js',
	'const x = 1;',
	'```',
	'',
].join('\n');

function setup() {
	const vault = new FakeVault();
	const session = openSession(vault, 'doc.md', SOURCE);
	const hub = makeHub(vault, session);
	const runtime = makeCapabilityRuntime(session, hub, new FakeComposerExecutor());
	return { vault, session, hub, runtime };
}

async function main(): Promise<void> {
	const strings = DEFAULT_COMPOSER_CAPABILITIES_CONFIG.strings;

	{
		const { session, runtime } = setup();
		const para = blockOfKind(session, 'paragraph');
		const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: para.blockId });
		check('snapshot is frozen', Object.isFrozen(snapshot));
		check('snapshot targetSource is the verbatim slice', snapshot.targetSource === 'A paragraph that clearly needs polishing.');
		check('snapshot nearby.before is bounded and non-empty', (snapshot.nearby?.before ?? '').includes('# Title'));

		const actions = runtime.actionsFor(snapshot, 'block-row');
		const polish = actions.find((a) => a.capabilityId === POLISH_CAPABILITY_ID);
		check('paragraph projects polish on block-row', !!polish);
		check('descriptor title comes from config', polish?.title === 'Polish text', polish?.title);
		check('descriptor group is ai', polish?.group === 'ai');
		check('descriptor accepts instruction', polish?.acceptsInstruction === true);
		check('descriptor is enabled', polish?.disabledReason === undefined, polish?.disabledReason);
		check('polish projects on selection-toolbar too', runtime.actionsFor(snapshot, 'selection-toolbar').length === 1);
		check('polish does NOT project on object-toolbar', runtime.actionsFor(snapshot, 'object-toolbar').length === 0);
	}

	{
		const { session, runtime } = setup();
		const code = blockOfKind(session, 'code');
		const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: code.blockId });
		check('code block hides polish (target kind mismatch)', runtime.actionsFor(snapshot, 'block-row').length === 0);
	}

	{
		const { session, runtime } = setup();
		const snapshot = runtime.assembleSnapshot({ kind: 'document', documentId: session.snapshot.documentId });
		check('document target hides polish (block-scoped capability)', runtime.actionsFor(snapshot, 'block-row').length === 0);
	}

	{
		const { session, hub, runtime } = setup();
		const para = blockOfKind(session, 'paragraph');
		const snapshot = runtime.assembleSnapshot({ kind: 'block', blockId: para.blockId });
		await hub.commit({
			origin: 'direct',
			label: 'edit',
			operations: [{ kind: 'replaceRange', from: para.source.from, to: para.source.to, text: 'Edited already.' }],
		});
		const actions = runtime.actionsFor(snapshot, 'block-row');
		const polish = actions.find((a) => a.capabilityId === POLISH_CAPABILITY_ID);
		check('stale snapshot still projects the action', !!polish);
		check('stale snapshot is disabled with the configured reason', polish?.disabledReason === strings.staleSnapshot, polish?.disabledReason);
	}

	{
		const { session, runtime } = setup();
		const para = blockOfKind(session, 'paragraph');
		// Craft a frozen snapshot whose target slice is blank — the guard path.
		const snapshot: ComposerContextSnapshot = {
			documentId: session.snapshot.documentId,
			revision: session.baseRevision,
			target: { kind: 'block', blockId: para.blockId },
			targetSource: '   ',
		};
		const polish = runtime.actionsFor(snapshot, 'block-row').find((a) => a.capabilityId === POLISH_CAPABILITY_ID);
		check('empty target is disabled (not hidden)', !!polish && polish.disabledReason !== undefined);
		check('empty-target reason comes from config', polish?.disabledReason === strings.emptyTarget, polish?.disabledReason);
	}

	done('composer-capability-applicability');
}

void main();
