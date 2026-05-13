import assert from 'assert';
import { buildBrokenLinkFindings } from '@/service/lint/signals/structural';

function testBrokenLinksAreGroupedBySourceFile(): void {
	const findings = buildBrokenLinkFindings(
		{
			'folder/source.md': {
				'Missing A': 3,
				'Missing B': 1,
				'Missing C': 2,
			},
		},
		new Map(),
	);

	assert.strictEqual(findings.length, 1, 'broken links should become one actionable finding per file');
	assert.strictEqual(findings[0]!.title, '3 broken link targets in source.md');
	assert.ok(findings[0]!.description.includes('6 unresolved occurrences'), 'description should include occurrence count');
	assert.deepStrictEqual(findings[0]!.metadata.brokenTargets, ['Missing A', 'Missing B', 'Missing C']);
	assert.strictEqual(findings[0]!.metadata.brokenTargetCount, 3);
	assert.strictEqual(findings[0]!.metadata.brokenOccurrenceCount, 6);

	console.log('PASS: brokenLinksAreGroupedBySourceFile');
}

function testBrokenLinksRespectFileDismissals(): void {
	const findings = buildBrokenLinkFindings(
		{
			'folder/source.md': { 'Missing A': 1 },
		},
		new Map([['S-BROKEN-LINK:folder/source.md', {}]]),
	);

	assert.strictEqual(findings.length, 0, 'dismissed source file should be skipped');
	console.log('PASS: brokenLinksRespectFileDismissals');
}

try {
	testBrokenLinksAreGroupedBySourceFile();
	testBrokenLinksRespectFileDismissals();
	process.exit(0);
} catch (err) {
	console.error(err);
	process.exit(1);
}
