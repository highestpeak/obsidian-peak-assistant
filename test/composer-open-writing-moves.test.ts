import { detectOpenWritingMoves, parseComposerDocument } from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const openTaskConfig = {
	uncheckedTaskReason: 'Open task: ',
	uncheckedTaskSummary: 'Still unfinished in this document.',
	uncheckedTaskTargetLabel: 'Task list',
	uncheckedTaskEvidenceLabel: 'Open task',
	uncheckedTaskPattern: /^\s*(?:[-*+]|\d+[.)])\s+\[ \]\s+/,
};

function run(): void {
	const source = [
		'# Draft',
		'',
		'- [ ] Fill evidence for the opening claim',
		'- [x] Already handled',
		'- [ ] Add counterexample',
		'',
		'Plain paragraph.',
	].join('\n');
	const snapshot = parseComposerDocument(source, { filePath: 'draft.md' });

	const findings = detectOpenWritingMoves(snapshot, openTaskConfig);
	check('detects unchecked task items only', findings.length === 2, String(findings.length));
	check('finding targets the list unit', findings.every((finding) => finding.target.kind === 'unit'));
	check('finding uses current revision as evidence', findings.every((finding) => finding.evidenceRevision === snapshot.revision));
	check('reason includes the task content', findings[0].reason === 'Open task: Fill evidence for the opening claim', findings[0].reason);
	check('checked tasks are skipped', !findings.some((finding) => finding.reason.includes('Already handled')));
	check('body projection uses a concrete task label', findings[0].body?.label === 'Task list');
	check('body projection carries the real task text', findings[0].body?.title === 'Fill evidence for the opening claim');
	check('body projection is not a generic AI suggestion', findings.every((finding) => finding.body?.label !== 'AI 建议'));

	const uncappedSource = [
		'# More tasks',
		'',
		'- [ ] One',
		'- [ ] Two',
		'- [ ] Three',
		'- [ ] Four',
		'- [ ] Five',
		'- [ ] Six',
	].join('\n');
	const uncapped = detectOpenWritingMoves(
		parseComposerDocument(uncappedSource, { filePath: 'uncapped.md' }),
		openTaskConfig,
	);
	check('producer returns every real unchecked task rather than a hidden preview cap', uncapped.length === 6, String(uncapped.length));

	const duplicateSource = [
		'# Repeated labels',
		'',
		'- [ ] Add an example',
		'- [ ] Add an example',
	].join('\n');
	const duplicates = detectOpenWritingMoves(
		parseComposerDocument(duplicateSource, { filePath: 'duplicates.md' }),
		openTaskConfig,
	);
	check('same task text at distinct source units yields two findings', duplicates.length === 2, String(duplicates.length));
	check(
		'duplicate task findings keep distinct source anchors',
		duplicates[0].target.kind === 'unit' &&
		duplicates[1].target.kind === 'unit' &&
		duplicates[0].target.unitId !== duplicates[1].target.unitId,
	);
	check('duplicate task findings have distinct source fingerprints', duplicates[0].fingerprint !== duplicates[1].fingerprint);

	done('composer-open-writing-moves');
}

run();
