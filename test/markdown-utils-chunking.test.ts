import * as fs from 'fs';
import * as path from 'path';
import { compileTemplate } from '@/core/template-engine-helper';
import {
	buildCodeOmittedPlaceholder,
	DEFAULT_CODE_BLOCK_PLACEHOLDER,
	extractCodeKeywordsForIndex,
	parseFenceLang,
	preprocessMarkdownForChunking,
	resetCodeStopwordsForTests,
	setCodeStopwordsForTests,
} from '@/core/utils/markdown-utils';

function assert(cond: boolean, msg: string) {
	if (!cond) throw new Error(msg);
}

function runTests() {
	resetCodeStopwordsForTests();
	const tplPath = path.join(process.cwd(), 'templates/indexing/code-stopwords.md');
	const rendered = compileTemplate(fs.readFileSync(tplPath, 'utf-8'))({ extraStopwords: [] });
	setCodeStopwordsForTests(rendered);
	try {
		assert(parseFenceLang('ts') === 'ts', 'ts lang');
		assert(parseFenceLang('  typescript ') === 'typescript', 'first token');
		assert(parseFenceLang('') === 'unknown', 'empty fence info');

		const kw = extractCodeKeywordsForIndex(
			'const x = 1;\nfunction loadUserProfile() {\n  return fetch("/api/v1/user");\n}\n',
			6,
		);
		assert(kw.includes('load') || kw.includes('user') || kw.includes('fetch'), 'meaningful kw');

		const ph = buildCodeOmittedPlaceholder('ts', 'a\nb\nc');
		assert(ph.includes('lang=ts'), 'placeholder lang');
		assert(ph.includes('lines=3'), 'placeholder lines');
		assert(ph.includes('chars='), 'placeholder chars');

		const md = 'Intro\n\n```js\nconst a = 1;\nconsole.log(embeddings);\n```\n\nOutro';
		const out = preprocessMarkdownForChunking(md, {
			skipCodeBlocksInChunking: true,
			maxCodeChunkChars: 0,
		});
		assert(!out.includes('console.log'), 'code removed');
		assert(out.includes('[code omitted'), 'rich tag');
		assert(out.includes('lang='), 'rich lang');

		const custom = preprocessMarkdownForChunking('```py\nx=1\n```', {
			skipCodeBlocksInChunking: true,
			maxCodeChunkChars: 0,
			codeBlockPlaceholder: '\n[CUSTOM]\n',
		});
		assert(custom.includes('[CUSTOM]'), 'custom placeholder');
		assert(!custom.includes('lang='), 'no rich when custom');

		const defaultStr = preprocessMarkdownForChunking('```\nfoo\n```', {
			skipCodeBlocksInChunking: true,
			maxCodeChunkChars: 0,
			codeBlockPlaceholder: DEFAULT_CODE_BLOCK_PLACEHOLDER,
		});
		assert(defaultStr.includes('[code omitted lang='), 'explicit default still rich');

		console.log('markdown-utils-chunking.test.ts: all passed');
	} finally {
		resetCodeStopwordsForTests();
	}
}

runTests();
