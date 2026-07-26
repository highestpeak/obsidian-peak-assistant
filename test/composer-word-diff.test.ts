/**
 * Peak Composer — word-level in-place diff (CMP-REV-02).
 *
 * Covers the pure diff algorithm (insertion / deletion / replacement / CJK /
 * whitespace folding / adjacent merge / degrade) and the render mapping
 * (segments → kind sequence the card paints), plus the candidate→"before"-text
 * resolver the app layer wires from the live snapshot.
 */

import {
	diffWords,
	MAX_DIFF_TOKENS,
	originalTextForTextPatchCandidate,
	type DiffSegment,
} from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const kinds = (segs: DiffSegment[]): string => segs.map((s) => s.kind).join(',');
const beforeOf = (segs: DiffSegment[]): string =>
	segs.filter((s) => s.kind !== 'ins').map((s) => s.text).join('');
const afterOf = (segs: DiffSegment[]): string =>
	segs.filter((s) => s.kind !== 'del').map((s) => s.text).join('');

/** No two neighbouring segments share a kind (the merge post-condition). */
function noAdjacentDuplicateKinds(segs: DiffSegment[]): boolean {
	for (let i = 1; i < segs.length; i++) if (segs[i].kind === segs[i - 1].kind) return false;
	return true;
}

function run(): void {
	// ── identity / empties ──────────────────────────────────────────────────────
	check('identical text → single same segment', kinds(diffWords('hello world', 'hello world')) === 'same');
	check('both empty → no segments', diffWords('', '').length === 0);
	check('empty before → pure ins', kinds(diffWords('', 'brand new')) === 'ins');
	check('empty after → pure del', kinds(diffWords('gone for good', '')) === 'del');

	// ── pure insertion (word added mid-sentence) ─────────────────────────────────
	const ins = diffWords('the quick fox', 'the quick brown fox');
	check('insertion: reconstructs before', beforeOf(ins) === 'the quick fox');
	check('insertion: reconstructs after', afterOf(ins) === 'the quick brown fox');
	check('insertion: contains exactly one ins run', ins.filter((s) => s.kind === 'ins').length === 1);
	check('insertion: no del run', ins.every((s) => s.kind !== 'del'));

	// ── pure deletion ────────────────────────────────────────────────────────────
	const del = diffWords('the quick brown fox', 'the quick fox');
	check('deletion: reconstructs before', beforeOf(del) === 'the quick brown fox');
	check('deletion: reconstructs after', afterOf(del) === 'the quick fox');
	check('deletion: contains exactly one del run', del.filter((s) => s.kind === 'del').length === 1);
	check('deletion: no ins run', del.every((s) => s.kind !== 'ins'));

	// ── replacement (word swapped) ───────────────────────────────────────────────
	const rep = diffWords('a red car', 'a blue car');
	check('replacement: kinds are same,del,ins,same', kinds(rep) === 'same,del,ins,same');
	check('replacement: reconstructs before', beforeOf(rep) === 'a red car');
	check('replacement: reconstructs after', afterOf(rep) === 'a blue car');

	// ── CJK: diff per character, not per whole run ───────────────────────────────
	const cjk = diffWords('知道当前块', '清楚当前块');
	check('cjk: struck head chars, kept tail', kinds(cjk) === 'del,ins,same');
	check('cjk: del text is 知道', cjk.find((s) => s.kind === 'del')?.text === '知道');
	check('cjk: ins text is 清楚', cjk.find((s) => s.kind === 'ins')?.text === '清楚');
	check('cjk: same tail preserved', cjk.find((s) => s.kind === 'same')?.text === '当前块');
	const cjkMid = diffWords('应该更像', '应当更像');
	check('cjk mid-char swap keeps surrounding chars', kinds(cjkMid) === 'same,del,ins,same');

	// ── whitespace-only change folds into flow (no struck / highlighted space) ───
	const wsCollapse = diffWords('foo  bar', 'foo bar');
	check('ws collapse: no del/ins markers', wsCollapse.every((s) => s.kind === 'same'));
	check('ws collapse: renders after spacing', afterOf(wsCollapse) === 'foo bar');
	const wsExpand = diffWords('foo bar', 'foo  bar');
	check('ws expand: no del/ins markers', wsExpand.every((s) => s.kind === 'same'));
	const wsTrailing = diffWords('done ', 'done');
	check('ws trailing: trailing space removal shows no strike', kinds(wsTrailing) === 'same');

	// ── adjacent same-kind merge ─────────────────────────────────────────────────
	// A contiguous multi-word deletion (the space between the dropped words is
	// absorbed) collapses into ONE del run — reconstruction still holds.
	const mdel = diffWords('keep old words here', 'keep here');
	check('merge: no adjacent duplicate kinds', noAdjacentDuplicateKinds(mdel));
	check('merge: single del run for the dropped span', mdel.filter((s) => s.kind === 'del').length === 1);
	check('merge: del run text spans both words + inner space', mdel.find((s) => s.kind === 'del')?.text === 'old words ');
	check('merge: reconstructs before exactly', beforeOf(mdel) === 'keep old words here');
	check('merge: reconstructs after exactly', afterOf(mdel) === 'keep here');
	// CJK: two struck chars + two inserted chars each merge into one run.
	const mcjk = diffWords('知道当前', '清楚当前');
	check('merge: CJK del run merges 知道', mcjk.find((s) => s.kind === 'del')?.text === '知道');
	check('merge: CJK ins run merges 清楚', mcjk.find((s) => s.kind === 'ins')?.text === '清楚');
	check('merge: CJK single del + single ins run', mcjk.filter((s) => s.kind === 'del').length === 1 && mcjk.filter((s) => s.kind === 'ins').length === 1);

	// ── every diff satisfies the reconstruction law + merge invariant ────────────
	const cases: Array<[string, string]> = [
		['the quick fox', 'the quick brown fox'],
		['a red car', 'a blue car'],
		['知道当前块', '清楚当前块'],
		['hello, world!', 'hello, brave world!'],
		['one two three four', 'one four'],
	];
	let lawOk = true;
	let mergeOk = true;
	for (const [b, a] of cases) {
		const segs = diffWords(b, a);
		if (beforeOf(segs) !== b || afterOf(segs) !== a) lawOk = false;
		if (!noAdjacentDuplicateKinds(segs)) mergeOk = false;
	}
	check('law: before/after reconstruct across all cases', lawOk);
	check('law: no adjacent duplicate kinds across all cases', mergeOk);

	// ── degrade: > MAX_DIFF_TOKENS collapses to one del + one ins ─────────────────
	const huge = 'x '.repeat(MAX_DIFF_TOKENS + 50).trim();
	const hugeAfter = 'y '.repeat(MAX_DIFF_TOKENS + 50).trim();
	const degraded = diffWords(huge, hugeAfter);
	check('degrade: exactly one del + one ins', kinds(degraded) === 'del,ins');
	check('degrade: del is whole before', degraded[0].text === huge);
	check('degrade: ins is whole after', degraded[1].text === hugeAfter);
	const smallStillDiffs = diffWords('a b c', 'a x c');
	check('below ceiling still does a fine-grained diff', kinds(smallStillDiffs) === 'same,del,ins,same');

	// ── render mapping: kind sequence is exactly what the card paints ────────────
	check('render map: same→ins→same for a mid insertion', kinds(diffWords('go home', 'go back home')) === 'same,ins,same');
	check('render map: leading replacement is del,ins,same', kinds(diffWords('bad tail', 'good tail')) === 'del,ins,same');

	// ── resolver: candidate → verbatim "before" slice from the live snapshot ─────
	const snapshot = { sourceText: 'The knowledge base is not a single folder.', revision: 'r1' };
	const makeCandidate = (over: Partial<{ baseRevision: string; result: unknown; ops: unknown[] }> = {}) => ({
		baseRevision: over.baseRevision ?? 'r1',
		proposedChange: {
			operations: (over.ops ?? [{ kind: 'replaceRange', from: 4, to: 18, text: 'wisdom store' }]) as never,
			result:
				'result' in over
					? (over.result as never)
					: ({ resultKind: 'text-patch', rendererId: 'composer.streaming-text', payload: { replacementText: 'wisdom store' } } as never),
		},
	});
	check(
		'resolver: slices the replaced source range',
		originalTextForTextPatchCandidate(snapshot, makeCandidate() as never) === 'knowledge base',
	);
	check(
		'resolver: drifted revision → null (never a wrong slice)',
		originalTextForTextPatchCandidate(snapshot, makeCandidate({ baseRevision: 'r2' }) as never) === null,
	);
	check(
		'resolver: non-text-patch result → null',
		originalTextForTextPatchCandidate(
			snapshot,
			makeCandidate({ result: { resultKind: 'table-patch', rendererId: 'x', payload: {} } }) as never,
		) === null,
	);
	check(
		'resolver: no replaceRange op (still streaming) → null',
		originalTextForTextPatchCandidate(snapshot, makeCandidate({ ops: [] }) as never) === null,
	);
	check(
		'resolver: out-of-bounds range → null',
		originalTextForTextPatchCandidate(
			snapshot,
			makeCandidate({ ops: [{ kind: 'replaceRange', from: 4, to: 9999, text: 'x' }] }) as never,
		) === null,
	);
	check('resolver: null snapshot → null', originalTextForTextPatchCandidate(null, makeCandidate() as never) === null);

	// ── end-to-end: resolver output feeds diffWords into a real in-place diff ────
	const before = originalTextForTextPatchCandidate(snapshot, makeCandidate() as never)!;
	const e2e = diffWords(before, 'wisdom store');
	check('e2e: resolver + diff reconstructs the replacement', afterOf(e2e) === 'wisdom store' && beforeOf(e2e) === 'knowledge base');

	done('composer-word-diff');
}

run();
