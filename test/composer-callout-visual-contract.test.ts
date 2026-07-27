import assert from 'assert';
import { readFileSync } from 'fs';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComposerStateSource, DocumentComposerState } from '@/core/composer';
import { DirectEditController, parseComposerDocument } from '@/service/composer';
import { ComposerRoot } from '@/ui/view/composer/ComposerRoot';
import { presentCallout, type CalloutTextRange } from '@/ui/view/composer/blocks/callout/calloutPresentation';
import { FakeVault, makeHub, openSession } from './helpers/composer-fakes';

let checks = 0;
function check(name: string, condition: boolean, detail = ''): void {
	checks += 1;
	assert.ok(condition, `${name}${detail ? ` — ${detail}` : ''}`);
}

const SOURCE = `> [!note] 工作原则
> 先决定输出，再反推资料组织方式。`;

function calloutOf(source: string) {
	const snapshot = parseComposerDocument(source, { filePath: 'callout.md' });
	const block = snapshot.blocks.find((candidate) => candidate.kind === 'callout');
	if (!block) throw new Error('expected callout');
	return { snapshot, block };
}

function resolveRange(session: ReturnType<typeof openSession>, part: 'title' | 'body', index = 0) {
	const block = session.snapshot.blocks.find((candidate) => candidate.kind === 'callout');
	if (!block) return null;
	const presentation = presentCallout(session.snapshot, block);
	const range = part === 'title' ? presentation.title : presentation.body[index];
	if (!range) return null;
	return {
		from: range.from,
		to: range.to,
		current: session.snapshot.sourceText.slice(range.from, range.to),
		target: { kind: 'block' as const, blockId: block.blockId },
		normalizeInput: (text: string) => sourceTextFor(range, text),
	};
}

function sourceTextFor(range: CalloutTextRange, text: string): string {
	if (range.requiresLeadingSpace && text) return ` ${text}`;
	if (range.requiresBodyLine) return `\n> ${text}`;
	return text;
}

async function main(): Promise<void> {
{
	const { snapshot, block } = calloutOf(SOURCE);
	const view = presentCallout(snapshot, block);
	check('recognizes callout type', view.type === 'note', view.type);
	check('title source range excludes marker but keeps exact text', view.title.text === '工作原则' && snapshot.sourceText.slice(view.title.from, view.title.to) === '工作原则');
	check('body source range excludes quote prefix but keeps exact text', view.body[0].text === '先决定输出，再反推资料组织方式。' && snapshot.sourceText.slice(view.body[0].from, view.body[0].to) === view.body[0].text);
}

{
	const vault = new FakeVault();
	const session = openSession(vault, 'callout.md', SOURCE);
	const hub = makeHub(vault, session);
	const title = new DirectEditController({ hub, label: 'edit', burstWindowMs: 9999, resolveRange: () => resolveRange(session, 'title') });
	title.onInput('更新后的原则');
	await title.flush();
	check('title edit preserves standard callout marker', vault.read('callout.md').startsWith('> [!note] 更新后的原则'));

	const body = new DirectEditController({ hub, label: 'edit', burstWindowMs: 9999, resolveRange: () => resolveRange(session, 'body') });
	body.onInput('更新后的正文。');
	await body.flush();
	check('body edit preserves quote prefix', vault.read('callout.md').includes('\n> 更新后的正文。'));
}

{
	const vault = new FakeVault();
	const session = openSession(vault, 'untitled.md', '> [!tip]\n> 原正文');
	const hub = makeHub(vault, session);
	const title = new DirectEditController({ hub, label: 'edit', burstWindowMs: 9999, resolveRange: () => resolveRange(session, 'title') });
	title.onInput('补上标题');
	await title.flush();
	check('first untitled edit inserts the standard separator', vault.read('untitled.md').startsWith('> [!tip] 补上标题'));
}

{
	const vault = new FakeVault();
	const session = openSession(vault, 'bodyless.md', '> [!tip] 标题');
	const hub = makeHub(vault, session);
	const body = new DirectEditController({ hub, label: 'edit', burstWindowMs: 9999, resolveRange: () => resolveRange(session, 'body') });
	body.onInput('补上正文');
	await body.flush();
	check('first body edit creates a standard callout body line', vault.read('bodyless.md') === '> [!tip] 标题\n> 补上正文');
}

{
	const vault = new FakeVault();
	const session = openSession(vault, 'render.md', SOURCE);
	const hub = makeHub(vault, session);
	const state: DocumentComposerState = { status: 'loaded', filePath: session.filePath, snapshot: session.snapshot };
	const source: ComposerStateSource = { getState: () => state, subscribe: () => () => undefined };
	const html = renderToStaticMarkup(React.createElement(ComposerRoot, { source, runtime: { session, hub } }));
	check('Composer routes callout to a structured visual shell', html.includes('pk-composer-callout'));
	check('structured shell exposes note icon and title', html.includes('pk-composer-callout__icon') && html.includes('工作原则'));
	check('structured shell does not display raw callout syntax while blurred', !html.includes('&gt; [!note]'));
}

{
	const css = readFileSync('src/styles/composer.css', 'utf8');
	check('callout CSS matches the design shell border and light surface', css.includes('--pkc-callout-border: rgb(191, 208, 251)') && css.includes('--pkc-callout-bg: rgb(247, 250, 255)'));
	check('callout CSS matches the 41px title and 15px/1.82 body rhythm', css.includes('min-height: 41px') && css.includes('font-size: 14px') && css.includes('line-height: 1.82'));
}

console.log(`composer-callout-visual-contract: ${checks}/${checks} checks passed`);
}

void main().catch((error) => {
	console.error(error);
	process.exit(1);
});
