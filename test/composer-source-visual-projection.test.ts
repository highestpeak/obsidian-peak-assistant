import { readFileSync } from 'node:fs';
import {
	hasSourceVisualSyntaxChange,
	projectSourceVisualParts,
	type HiddenSourceRange,
	type SourceVisualPart,
} from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

function domText(parts: readonly SourceVisualPart[], source: string, base = 0): string {
	return parts.map((part) => {
		if (part.kind === 'math') return source.slice(part.from - base, part.to - base);
		return part.text;
	}).join('');
}

function visibleText(parts: readonly SourceVisualPart[]): string {
	return parts.map((part) => {
		if (part.kind === 'hidden') return '';
		if (part.kind === 'math') return part.latex;
		return part.text;
	}).join('');
}

function run(): void {
{
	const source = 'Plain **bold** and [[知识库|库]] plus [label](https://x.com) and <span style="color: #b42318">red</span> <span style="text-decoration: underline">under</span> ==hi== $E=mc^2$';
	const parts = projectSourceVisualParts(source, 0, { mathMode: 'source' });
	const visible = visibleText(parts);
	check('projection keeps DOM text byte-identical to source', domText(parts, source) === source, domText(parts, source));
	check('projection hides markdown emphasis delimiters', !visible.includes('**'), visible);
	check('projection hides wikilink source and shows alias', !visible.includes('知识库|') && visible.includes('库'), visible);
	check('projection hides markdown link destination and shows label', !visible.includes('https://x.com') && visible.includes('label'), visible);
	check('projection hides html mark tags', !visible.includes('<span') && !visible.includes('</span>') && visible.includes('red') && visible.includes('under'), visible);
	check('projection hides highlight and math delimiters', !visible.includes('==') && !visible.includes('$') && visible.includes('E=mc^2'), visible);
}

{
	const editableSource = readFileSync('src/ui/view/composer/chrome/EditableText.tsx', 'utf8');
	const hiddenStart = editableSource.indexOf("if (part.kind === 'hidden')");
	const hiddenEnd = editableSource.indexOf("if (part.kind === 'math')", hiddenStart);
	const hiddenRenderer = editableSource.slice(hiddenStart, hiddenEnd);
	check(
		'hidden source tokens do not render layout-bearing child elements',
		hiddenStart >= 0 && hiddenEnd > hiddenStart && !hiddenRenderer.includes('<ExternalLink'),
		hiddenRenderer,
	);
}

{
	const source = '> quoted\n> second **bold**';
	const forced: HiddenSourceRange[] = [
		{ from: 0, to: 2 },
		{ from: 9, to: 11 },
	];
	const parts = projectSourceVisualParts(source, 0, { hiddenRanges: forced, mathMode: 'source' });
	const visible = visibleText(parts);
	check('forced hidden ranges keep DOM text byte-identical', domText(parts, source) === source, domText(parts, source));
	check('forced hidden ranges hide quote markers', visible === 'quoted\nsecond bold', visible);
}

{
	const source = 'Formula $a_b + c$ after';
	const atom = projectSourceVisualParts(source, 20, { mathMode: 'atom' });
	const math = atom.find((part): part is Extract<SourceVisualPart, { kind: 'math' }> => part.kind === 'math');
	check('atom mode keeps math as one source interval', math?.from === 28 && math?.to === 37, JSON.stringify(math));
	check('atom mode exposes latex for visual rendering', math?.latex === 'a_b + c', math?.latex ?? '');
}

{
	const options = { mathMode: 'source' as const };
	check(
		'plain typing does not request a React projection',
		!hasSourceVisualSyntaxChange('Plain text', 'Plain text more', 0, options),
	);
	check(
		'an incomplete mark stays native',
		!hasSourceVisualSyntaxChange('Plain ', 'Plain ==live', 0, options),
	);
	check(
		'closing a mark requests immediate projection',
		hasSourceVisualSyntaxChange('Plain ==live', 'Plain ==live==', 0, options),
	);
	check(
		'typing inside an existing styled run stays native',
		!hasSourceVisualSyntaxChange('Plain **bold**', 'Plain **bolder**', 0, options),
	);
	check(
		'removing a closing delimiter requests immediate source exposure',
		hasSourceVisualSyntaxChange('Plain **bold**', 'Plain **bold', 0, options),
	);
	check(
		'completing an HTML color span requests immediate projection',
		hasSourceVisualSyntaxChange(
			'<span style="color: #b42318">red',
			'<span style="color: #b42318">red</span>',
			0,
			options,
		),
	);
	check(
		'completing a link requests immediate projection',
		hasSourceVisualSyntaxChange('[label](https://x', '[label](https://x.com)', 0, options),
	);
}

	done('composer-source-visual-projection');
}

run();
