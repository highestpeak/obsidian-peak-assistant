/**
 * Peak Composer — SuggestionFinding identity (WP9, CMP-FIND-01 / CMP-FIND-02).
 *
 * Asserts the §5.4 contract on the shared finding store:
 *   (1) the same fingerprint + evidence revision is one finding (ingest dedup);
 *   (2) the body-mark and brief projections are one entity, not two states —
 *       accept-in-body ⇒ consumed on both, ignore-from-either ⇒ dismissed on both;
 *   (3) across a reparse, findings re-anchor via matchBlocks and go `stale` (never
 *       silently redirect) when their block no longer maps;
 *   (4) a finding whose evidence already equals the new revision is untouched.
 */

import { ComposerFindingStore, findingDedupKey, parseComposerDocument } from '@/service/composer';

let failures = 0;
let count = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

const DOC = `# Title

Alpha para.

Beta para.
`;
const DOC_BETA_REMOVED = `# Title

Alpha para.
`;

const prev = parseComposerDocument(DOC, { filePath: 'note.md', revision: 'r1' });
const alpha = prev.blocks.find((b) => b.kind === 'paragraph' && b.renderModel.raw.includes('Alpha'))!;
const beta = prev.blocks.find((b) => b.kind === 'paragraph' && b.renderModel.raw.includes('Beta'))!;
check('fixtures resolved', Boolean(alpha && beta));

// ── (1) dedup: same fingerprint + evidence revision is one finding ──────────────
{
	const store = new ComposerFindingStore();
	const a1 = store.ingest({ fingerprint: 'fp-a', evidenceRevision: 'r1', target: { kind: 'block', blockId: alpha.blockId }, reason: 'tighten intro' });
	const a2 = store.ingest({ fingerprint: 'fp-a', evidenceRevision: 'r1', target: { kind: 'block', blockId: alpha.blockId }, reason: 'tighten intro (again)' });
	check('dedup returns same id', a1.findingId === a2.findingId);
	check('dedup keeps one record', store.list().length === 1);
	check('dedup supplements reason in place', store.get(a1.findingId)?.reason === 'tighten intro (again)');
	// different evidence revision → a distinct finding.
	store.ingest({ fingerprint: 'fp-a', evidenceRevision: 'r2', target: { kind: 'block', blockId: alpha.blockId }, reason: 'newer evidence' });
	check('different evidence revision is a new finding', store.list().length === 2);
	check('dedup key composition', findingDedupKey('fp-a', 'r1') === 'fp-a::r1');
}

// ── (2) two surfaces are one entity ─────────────────────────────────────────────
{
	const store = new ComposerFindingStore();
	const f = store.ingest({ fingerprint: 'fp-x', evidenceRevision: 'r1', target: { kind: 'block', blockId: alpha.blockId }, reason: 'x' });
	check('active shows in body marks', store.bodyMarks().some((m) => m.findingId === f.findingId));
	check('active shows in brief items', store.briefItems().some((m) => m.findingId === f.findingId));
	check('body and brief membership identical', store.bodyMarks().length === store.briefItems().length);

	// accept in body ⇒ consumed on BOTH projections.
	store.consume(f.findingId);
	check('consume sets state', store.get(f.findingId)?.state === 'consumed');
	check('consumed leaves body marks', !store.bodyMarks().some((m) => m.findingId === f.findingId));
	check('consumed leaves brief items', !store.briefItems().some((m) => m.findingId === f.findingId));

	// a second finding: ignore from the brief ⇒ dismissed on BOTH.
	const g = store.ingest({ fingerprint: 'fp-y', evidenceRevision: 'r1', target: { kind: 'block', blockId: beta.blockId }, reason: 'y' });
	store.dismiss(g.findingId, 'brief');
	check('dismiss from brief sets state', store.get(g.findingId)?.state === 'dismissed');
	check('dismissed leaves body marks', !store.bodyMarks().some((m) => m.findingId === g.findingId));
	check('dismissed leaves brief items', !store.briefItems().some((m) => m.findingId === g.findingId));

	// consumed / dismissed are terminal — a later consume/dismiss is a no-op.
	store.dismiss(f.findingId, 'body');
	check('consumed is not overwritten by dismiss', store.get(f.findingId)?.state === 'consumed');
}

// ── (3) reparse: re-anchor active, stale when the block is gone ──────────────────
{
	const store = new ComposerFindingStore();
	const fa = store.ingest({ fingerprint: 'fp-alpha', evidenceRevision: 'r1', target: { kind: 'block', blockId: alpha.blockId }, reason: 'alpha finding' });
	const fb = store.ingest({ fingerprint: 'fp-beta', evidenceRevision: 'r1', target: { kind: 'block', blockId: beta.blockId }, reason: 'beta finding' });
	const next = parseComposerDocument(DOC_BETA_REMOVED, { filePath: 'note.md', revision: 'r2' });

	const staled = store.revalidate(prev, next);
	// Alpha survives (its block still maps via matchBlocks) → active + re-anchored.
	check('alpha stays active', store.get(fa.findingId)?.state === 'active');
	const alphaTarget = store.get(fa.findingId)?.target;
	const alphaNext = next.blocks.find((b) => b.renderModel.raw.includes('Alpha'))!;
	check('alpha re-anchored to mapped block', alphaTarget?.kind === 'block' && alphaTarget.blockId === alphaNext.blockId);
	// Beta was removed → no mapping → stale (never redirected).
	check('beta went stale', store.get(fb.findingId)?.state === 'stale');
	check('revalidate reports staled ids', staled.includes(fb.findingId) && staled.length === 1);
}

// ── (4) evidence already current is untouched ───────────────────────────────────
{
	const store = new ComposerFindingStore();
	const next = parseComposerDocument(DOC_BETA_REMOVED, { filePath: 'note.md', revision: 'r2' });
	const alphaNext = next.blocks.find((b) => b.renderModel.raw.includes('Alpha'))!;
	const fc = store.ingest({ fingerprint: 'fp-c', evidenceRevision: 'r2', target: { kind: 'block', blockId: alphaNext.blockId }, reason: 'already current' });
	const staled = store.revalidate(prev, next);
	check('current-evidence finding untouched', store.get(fc.findingId)?.state === 'active');
	check('current-evidence not staled', !staled.includes(fc.findingId));
}

if (failures > 0) {
	console.error(`\n${failures}/${count} finding-identity assertion(s) failed`);
	process.exit(1);
}
console.log(`OK composer-finding-identity (${count} assertions)`);
