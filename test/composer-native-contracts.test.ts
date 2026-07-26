/**
 * Peak Composer — Code / Mermaid / Link contract assertions (WP8, CMP-NATIVE-01).
 *
 * The deterministic halves of the native pack that do NOT need a fixture file:
 *   - Code (§7.4): fence parse, source-copy preserving newlines/indentation/tabs,
 *     rich-format suppression predicate, Easy-Copy plain text for code.
 *   - Mermaid (§10.11): source extraction, diagram-type detection, source rewrite
 *     that preserves the fence markers (the AI patch → re-render contract).
 *   - Link (§10.13): classification of internal/external/embed/image/attachment/
 *     footnote references + the deterministic transforms (MOC line, host,
 *     footnote conversion, embed→link, distinct internal targets).
 */

import {
	// code
	parseCodeFence,
	codeSourceCopy,
	isRichFormatSuppressed,
	// mermaid
	parseMermaidBlock,
	detectDiagramType,
	replaceMermaidSource,
	mermaidSummary,
	// link
	analyzeLinks,
	buildMocLine,
	externalHost,
	inlineFootnoteToReference,
	embedToLink,
	internalTargets,
	// easy copy
	toPlainText,
} from '@/service/composer';

let count = 0;
let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
	count += 1;
	if (cond) return;
	failures += 1;
	console.error(`  XX ${name}${detail ? ' — ' + detail : ''}`);
}

// ── Code ─────────────────────────────────────────────────────────────────────
function testCode(): void {
	const raw = '```ts\nfunction f() {\n\treturn [\n\t\t1,\n\t\t2,\n\t];\n}\n```';
	const fence = parseCodeFence(raw);
	check('code: fence parsed', fence !== null);
	check('code: language token', fence?.language === 'ts', fence?.language);
	check('code: body has tabs preserved', fence?.body.includes('\t\t1,') ?? false);
	check('code: body newlines preserved', (fence?.body.match(/\n/g)?.length ?? 0) === 5, String(fence?.body.match(/\n/g)?.length));

	const copy = codeSourceCopy(raw, 'code');
	check('code: source copy keeps tabs', copy.includes('\t\t1,'));
	check('code: source copy strips fence', !copy.includes('```'));
	check('code: source copy keeps indentation shape', copy.startsWith('function f() {\n\treturn ['));

	// Easy Copy plain text for a code block preserves the body verbatim (§7.6).
	const plain = toPlainText(raw, 'code');
	check('code: easy-copy plain preserves tabs', plain.includes('\t\t1,'));
	check('code: easy-copy plain strips fence', !plain.includes('```'));

	// rich-format suppression predicate (§7.4).
	check('code: rich format suppressed', isRichFormatSuppressed('code'));
	check('code: math suppressed', isRichFormatSuppressed('math'));
	check('code: mermaid suppressed', isRichFormatSuppressed('mermaid'));
	check('code: paragraph NOT suppressed', !isRichFormatSuppressed('paragraph'));
	check('code: heading NOT suppressed', !isRichFormatSuppressed('heading'));

	// tilde fence + no language.
	const tilde = parseCodeFence('~~~\nplain\n~~~');
	check('code: tilde fence parsed', tilde?.fence === '~~~' && tilde.body === 'plain');
}

// ── Mermaid ──────────────────────────────────────────────────────────────────
function testMermaid(): void {
	const raw = '```mermaid\nflowchart TD\n  A --> B\n  B --> C\n```';
	const block = parseMermaidBlock(raw);
	check('mermaid: block parsed', block !== null);
	check('mermaid: source extracted', block?.source === 'flowchart TD\n  A --> B\n  B --> C');
	check('mermaid: diagram type flowchart', block?.diagramType === 'flowchart', block?.diagramType);
	check('mermaid: detectDiagramType sequence', detectDiagramType('sequenceDiagram\n A->>B: hi') === 'sequenceDiagram');
	check('mermaid: ignores leading %% directive', detectDiagramType('%%{init: {}}%%\npie title X') === 'pie');

	const summary = mermaidSummary(raw);
	check('mermaid: summary type', summary.diagramType === 'flowchart');
	check('mermaid: summary line count', summary.lineCount === 3, String(summary.lineCount));

	// source rewrite preserves the fence markers (AI patch → re-render contract).
	const rewritten = replaceMermaidSource(raw, 'flowchart LR\n  X --> Y');
	check('mermaid: rewrite keeps opening fence', rewritten.startsWith('```mermaid\n'));
	check('mermaid: rewrite keeps closing fence', rewritten.trimEnd().endsWith('```'));
	check('mermaid: rewrite swaps body', rewritten.includes('flowchart LR\n  X --> Y') && !rewritten.includes('A --> B'));
	check('mermaid: rewritten re-parses', parseMermaidBlock(rewritten)?.source === 'flowchart LR\n  X --> Y');

	// non-mermaid target fails closed.
	let threw = false;
	try {
		replaceMermaidSource('```ts\nx\n```', 'y');
	} catch {
		threw = true;
	}
	check('mermaid: rewrite on non-mermaid throws', threw);
}

// ── Link ─────────────────────────────────────────────────────────────────────
function testLink(): void {
	const source = [
		'See [[Note A]] and [[Folder/Note B|Alias]] plus [[Note C#Heading]].',
		'Embed ![[diagram.canvas]] and image ![[pic.png]] and file ![[doc.pdf]].',
		'External [site](https://example.com/x) and bare https://foo.org/y.',
		'A footnote[^1] and inline ^[quick note].',
	].join('\n');
	const links = analyzeLinks(source);
	const byKind = (k: string) => links.filter((l) => l.kind === k);

	check('link: internal detected', byKind('internal').some((l) => l.target === 'Note A'));
	check('link: alias captured', byKind('internal').some((l) => l.display === 'Alias' && l.target === 'Folder/Note B'));
	check('link: internal-heading detected', byKind('internal-heading').some((l) => l.anchor === 'Heading'));
	check('link: canvas embed detected', byKind('embed').some((l) => l.target === 'diagram.canvas'));
	check('link: image embed detected', byKind('image').some((l) => l.target === 'pic.png'));
	check('link: attachment embed detected', byKind('attachment').some((l) => l.target === 'doc.pdf'));
	check('link: markdown external detected', byKind('external').some((l) => l.target === 'https://example.com/x' && l.display === 'site'));
	check('link: bare url detected', byKind('external').some((l) => l.target === 'https://foo.org/y'));
	check('link: footnote ref detected', byKind('footnote-ref').some((l) => l.target === '1'));
	check('link: inline footnote detected', byKind('footnote-inline').some((l) => l.target === 'quick note'));
	check('link: results source-ordered', links.every((l, i) => i === 0 || links[i - 1].from <= l.from));

	// deterministic transforms.
	check('link: MOC line', buildMocLine('Folder/Note.md') === '- [[Folder/Note]]');
	check('link: MOC line with alias', buildMocLine('Note', 'Display') === '- [[Note|Display]]');
	check('link: external host', externalHost('https://www.example.com/a/b') === 'example.com');
	const fn = inlineFootnoteToReference('the text', 'fn1');
	check('link: inline footnote → reference', fn.reference === '[^fn1]' && fn.definition === '[^fn1]: the text');
	check('link: embed → link', embedToLink('![[Note#h|A]]') === '[[Note#h|A]]');
	const targets = internalTargets(source);
	check('link: internal targets distinct', targets.includes('Note A') && targets.includes('diagram.canvas') && !targets.includes('pic.png'));

	// no false positives on plain prose.
	check('link: no links in plain prose', analyzeLinks('Just some ordinary text without references.').length === 0);
}

testCode();
testMermaid();
testLink();
console.log(`composer-native-contracts: ${count - failures}/${count} checks passed`);
if (failures > 0) throw new Error(`${failures} check(s) failed`);
