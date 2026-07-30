/**
 * Peak Composer — inline styled-run projection (WP4.5 rich rendering,
 * CMP-SEL-01 visible-styles half).
 *
 * The one invariant the whole rich-render + selection-mapping story rests on:
 * every run's `from` is an absolute source offset and its visible `text` is the
 * CONTIGUOUS source slice at that offset. `data-src-text-from` + in-run text
 * offset can therefore map a DOM selection back to exact source bytes even with
 * the delimiters hidden. This test asserts that invariant across a torture
 * string plus the specific styles/links, and that the parse degrades (never
 * drops text) on unbalanced syntax.
 */

import { parseInlineRuns, type InlineRun } from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

/** source.slice(run.from, run.from+len) === run.text for every run (the mapping law). */
function assertOffsetLaw(name: string, source: string, base = 0): InlineRun[] {
	const runs = parseInlineRuns(source, base);
	let ok = true;
	for (const run of runs) {
		const got = source.slice(run.from - base, run.from - base + run.text.length);
		if (got !== run.text) {
			ok = false;
			check(`${name}: run offset law (${JSON.stringify(run.text)} @${run.from})`, false, `got ${JSON.stringify(got)}`);
		}
	}
	check(`${name}: all runs satisfy the source-offset law`, ok);
	// No text is ever dropped: concatenated visible text is a subsequence, and
	// the leftmost run starts at/after base.
	check(`${name}: first run offset ≥ base`, runs.every((r) => r.from >= base));
	return runs;
}

function run(): void {
	// ── plain, bold, italic, strike, code ──────────────────────────────────────
	const s1 = 'Plain **bold** then *em* and ~~gone~~ plus `code**x**` tail';
	const runs1 = assertOffsetLaw('mix', s1);
	const bold = runs1.find((r) => r.style.bold);
	check('mix: bold run text is the label only', bold?.text === 'bold', bold?.text);
	check('mix: bold from points past the `**`', bold?.from === s1.indexOf('bold'), String(bold?.from));
	check('mix: italic run captured', runs1.some((r) => r.style.italic && r.text === 'em'));
	check('mix: strikethrough run captured', runs1.some((r) => r.style.strikethrough && r.text === 'gone'));
	const code = runs1.find((r) => r.style.code);
	check('mix: inline code is literal (not re-parsed)', code?.text === 'code**x**', code?.text);

	// ── links (wikilink alias, markdown, bare url) ─────────────────────────────
	const s2 = 'see [[知识库|库]] and [label](https://x.com) and https://y.io done';
	const runs2 = assertOffsetLaw('links', s2);
	const wiki = runs2.find((r) => r.linkKind === 'wikilink');
	check('links: wikilink shows the alias', wiki?.text === '库', wiki?.text);
	check('links: wikilink target is the path', wiki?.linkTarget === '知识库', wiki?.linkTarget);
	check('links: wikilink alias offset is correct', wiki !== undefined && s2.slice(wiki.from, wiki.from + 1) === '库');
	const md = runs2.find((r) => r.linkKind === 'markdown');
	check('links: markdown link shows the label', md?.text === 'label' && md?.linkTarget === 'https://x.com', md?.text);
	check('links: markdown label offset past the `[`', md?.from === s2.indexOf('label'));
	check('links: bare url captured', runs2.some((r) => r.linkKind === 'bare-url' && r.text === 'https://y.io'));

	// ── html marks: underline / color / highlight ─────────────────────────────
	const s3 = 'a <u>под</u> b <span style="color: #b42318">red</span> c <mark style="background: #fff1a8">hi</mark> d <span style="text-decoration: underline">under</span>';
	const runs3 = assertOffsetLaw('html', s3);
	check('html: underline run', runs3.some((r) => r.style.underline && r.text === 'под'));
	check('html: color run carries the value', runs3.some((r) => r.style.color === '#b42318' && r.text === 'red'));
	check('html: highlight run carries the value', runs3.some((r) => r.style.highlight === '#fff1a8' && r.text === 'hi'));
	check('html: span text-decoration underline run', runs3.some((r) => r.style.underline && r.text === 'under'));

	// ── Obsidian ==highlight== (default color) ─────────────────────────────────
	const s3b = 'note ==important== here';
	const runs3b = assertOffsetLaw('eq-highlight', s3b);
	check('eq-highlight: ==...== yields a highlight run', runs3b.some((r) => r.style.highlight !== undefined && r.text === 'important'));

	// ── nested marks fold their styles ──────────────────────────────────────────
	const s4 = 'x **_deep_** y';
	const runs4 = assertOffsetLaw('nested', s4);
	const deep = runs4.find((r) => r.text === 'deep');
	check('nested: inner run has both bold+italic', Boolean(deep?.style.bold && deep?.style.italic));
	check(
		'nested: mark ranges retain the outer source wrappers',
		deep?.markRanges?.bold?.from === s4.indexOf('**') &&
			deep?.markRanges?.bold?.to === s4.indexOf('**', s4.indexOf('**') + 2) + 2 &&
			deep?.markRanges?.italic?.from === s4.indexOf('_') &&
			deep?.markRanges?.italic?.to === s4.lastIndexOf('_') + 1,
		JSON.stringify(deep?.markRanges),
	);
	const nestedHtml =
		'<mark style="background: #dff4e8">outer <mark style="background: #dfeaff">inner</mark> tail</mark>';
	const nestedHtmlRuns = assertOffsetLaw('nested-html', nestedHtml);
	check(
		'nested-html: same-tag inner highlight wins without leaking tags',
		nestedHtmlRuns.some((r) => r.text === 'inner' && r.style.highlight === '#dfeaff') &&
			nestedHtmlRuns.map((r) => r.text).join('') === 'outer inner tail',
		nestedHtmlRuns.map((r) => r.text).join(''),
	);
	const canonicalHtml =
		'<span style="font-weight: 700; font-style: italic; text-decoration-line: underline line-through; color: #b42318; background-color: #fff1a8">stack</span>';
	const canonicalRuns = assertOffsetLaw('canonical-html', canonicalHtml);
	const stack = canonicalRuns.find((run) => run.text === 'stack');
	check(
		'canonical-html: one span projects the complete style set',
		Boolean(
			stack?.style.bold &&
			stack.style.italic &&
			stack.style.underline &&
			stack.style.strikethrough &&
			stack.style.color === '#b42318' &&
			stack.style.highlight === '#fff1a8',
		),
		JSON.stringify(stack?.style),
	);
	check(
		'canonical-html: every projected style maps to the shared source wrapper',
		Boolean(
			stack?.markRanges &&
			Object.values(stack.markRanges).length === 6 &&
			Object.values(stack.markRanges).every(
				(range) => range?.from === 0 && range.to === canonicalHtml.length,
			),
		),
		JSON.stringify(stack?.markRanges),
	);
	const htmlLink =
		'<a href="https://example.com?a=1&amp;b=2" style="font-weight: 700; text-decoration-line: underline">linked</a>';
	const htmlLinkRuns = assertOffsetLaw('canonical-html-link', htmlLink);
	check(
		'canonical-html-link: anchor keeps link semantics and styles',
		htmlLinkRuns.some(
			(run) =>
				run.text === 'linked' &&
				run.linkKind === 'html' &&
				run.linkTarget === 'https://example.com?a=1&b=2' &&
				run.style.bold &&
				run.style.underline,
		),
		JSON.stringify(htmlLinkRuns),
	);

	// ── non-zero base offset (a block that does not start at 0) ────────────────
	const inner = '**hey** you';
	assertOffsetLaw('based', inner, 137);

	// ── unbalanced / unknown degrades to plain (nothing dropped) ───────────────
	const s5 = 'a **not closed and <u>also open';
	const runs5 = parseInlineRuns(s5, 0);
	check('degrade: unbalanced syntax yields verbatim plain text', runs5.map((r) => r.text).join('') === s5, runs5.map((r) => r.text).join(''));

	// ── empty input still yields one anchor run (a caret target) ───────────────
	const empty = parseInlineRuns('', 42);
	check('empty: one anchor run at base', empty.length === 1 && empty[0].from === 42 && empty[0].text === '');

	done('composer-inline-runs');
}

run();
