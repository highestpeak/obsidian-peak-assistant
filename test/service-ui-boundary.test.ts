// T11I source-scan guard: lock the service -> ui boundary closed.
//
// The six files below were the entire `service -> ui` surface at the
// start of T11I (10 import edges). After T11I they must contain zero
// real `@/ui/*` import statements. Comment text that *mentions*
// store/UI names is allowed — we strip comments before scanning so the
// guard only fires on actual `import ... from '@/ui/...'` statements.

import assert from 'assert';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

const GUARDED_FILES = [
	'src/service/search/analysisDocPersistence.ts',
	'src/service/agents/report/ReportOrchestrator.ts',
	'src/service/chat/context/slots/SystemPromptSlot.ts',
	'src/service/chat/service-conversation.ts',
	'src/service/copilot/CopilotReviewArtifactBuilder.ts',
	'src/service/agents/SynthesizeAgent.ts',
];

function stripComments(source: string): string {
	// Strip /* ... */ blocks (greedy across lines) then // line comments.
	const noBlock = source.replace(/\/\*[\s\S]*?\*\//g, '');
	const noLine = noBlock.replace(/(^|[^:])\/\/.*$/gm, '$1');
	return noLine;
}

function testNoUiImportInGuardedFiles(): void {
	const offenders: Array<{ file: string; hits: string[] }> = [];
	for (const rel of GUARDED_FILES) {
		const abs = path.resolve(ROOT, rel);
		const stripped = stripComments(fs.readFileSync(abs, 'utf8'));
		const importRe = /import\s+(?:type\s+)?[^;]*?from\s+['"](@\/ui\/[^'"]+)['"]/g;
		const hits: string[] = [];
		let m: RegExpExecArray | null;
		while ((m = importRe.exec(stripped)) !== null) {
			hits.push(m[1]);
		}
		if (hits.length > 0) offenders.push({ file: rel, hits });
	}
	assert.deepStrictEqual(
		offenders,
		[],
		`T11I service -> ui guard tripped:\n${JSON.stringify(offenders, null, 2)}`,
	);
	console.log('PASS: noUiImportInGuardedFiles (6 files clean)');
}

try {
	testNoUiImportInGuardedFiles();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
