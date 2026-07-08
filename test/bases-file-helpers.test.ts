/**
 * Guards for the "Save & Open in Bases" filename helpers.
 * (chat-unified-mode 2026-07-05 follow-up).
 *
 * The button is intentionally simple: parse an optional `# filename:` hint
 * from the first line, sanitise it into a vault-safe `.base` name, strip
 * the hint before writing the file body. These helpers are pure so
 * regressions in the model's convention output surface fast.
 */

import assert from 'assert';
import {
	parseBasesFilenameHint,
	stripBasesFilenameHint,
	sanitizeBasesFilename,
	resolveBasesTargetName,
} from '../src/service/chat/bases/basesFileHelpers';

// parseBasesFilenameHint
{
	assert.strictEqual(parseBasesFilenameHint('# filename: my-projects.base\nfilters:\n  and: []'), 'my-projects.base');
	assert.strictEqual(parseBasesFilenameHint('#filename:crm.base\nrest'), 'crm.base', 'tolerates missing space after #');
	assert.strictEqual(parseBasesFilenameHint('  # Filename : Reading Log.base\nfilters:'), 'Reading Log.base', 'case-insensitive + tolerates whitespace');
	assert.strictEqual(parseBasesFilenameHint('filters:\n  and: []'), null, 'no hint → null');
	assert.strictEqual(parseBasesFilenameHint('# this is a comment\nfilters:'), null, 'non-filename comment → null');
	assert.strictEqual(parseBasesFilenameHint(''), null);
	console.log('PASS: parseBasesFilenameHint');
}

// stripBasesFilenameHint
{
	const withHint = '# filename: my-projects.base\nfilters:\n  and: []\n';
	assert.strictEqual(stripBasesFilenameHint(withHint), 'filters:\n  and: []\n', 'drops hint + its newline');

	const withCrLfHint = '# filename: crm.base\r\nfilters:\r\n  and: []';
	assert.strictEqual(stripBasesFilenameHint(withCrLfHint), 'filters:\r\n  and: []', 'handles \\r\\n line endings');

	const noHint = 'filters:\n  and: []';
	assert.strictEqual(stripBasesFilenameHint(noHint), noHint, 'no hint → source returned as-is');

	const onlyHint = '# filename: solo.base';
	assert.strictEqual(stripBasesFilenameHint(onlyHint), '', 'only hint, no newline → empty result');
	console.log('PASS: stripBasesFilenameHint');
}

// sanitizeBasesFilename
{
	assert.strictEqual(sanitizeBasesFilename('my-projects.base'), 'my-projects.base');
	assert.strictEqual(sanitizeBasesFilename('my-projects'), 'my-projects.base', 'appends .base when absent');
	assert.strictEqual(
		sanitizeBasesFilename('  My/Bad*Name?.base  '),
		'MyBadName.base',
		'strips illegal chars + trims',
	);
	assert.strictEqual(sanitizeBasesFilename('Active Projects.base'), 'Active Projects.base', 'spaces allowed');
	assert.strictEqual(sanitizeBasesFilename('***'), null, 'nothing but illegal chars → null');
	assert.strictEqual(sanitizeBasesFilename(''), null);
	const long = 'x'.repeat(200) + '.base';
	const clipped = sanitizeBasesFilename(long);
	assert.ok(clipped && clipped.length <= 90, `long name must clip, got length ${clipped?.length}`);
	assert.ok(clipped?.endsWith('.base'));
	console.log('PASS: sanitizeBasesFilename');
}

// resolveBasesTargetName — hint wins over fallback
{
	const now = new Date('2026-07-05T15:04:05');
	const withHint = resolveBasesTargetName('# filename: my-projects.base\nfilters:\n', now);
	assert.strictEqual(withHint.fileName, 'my-projects.base');
	assert.strictEqual(withHint.fromHint, true);

	const withoutHint = resolveBasesTargetName('filters:\n  and: []', now);
	assert.strictEqual(withoutHint.fromHint, false);
	assert.ok(/^bases-20260705-\d{6}\.base$/.test(withoutHint.fileName), `expected timestamped name, got ${withoutHint.fileName}`);

	// Bogus hint (only illegal chars) → falls back to timestamped name
	const bogusHint = resolveBasesTargetName('# filename: ***\nfilters:\n', now);
	assert.strictEqual(bogusHint.fromHint, false, 'unsafe hint must fall back to timestamp');
	assert.ok(bogusHint.fileName.startsWith('bases-'), 'fallback prefix');
	console.log('PASS: resolveBasesTargetName');
}

console.log('\nAll bases-file-helpers tests passed!');
