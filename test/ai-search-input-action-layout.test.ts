import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plan = readFileSync(
	'src/ui/view/quick-search/components/V2InlinePlanReview.tsx',
	'utf8',
);
const followup = readFileSync(
	'src/ui/view/quick-search/components/V2ContinueAnalysisInput.tsx',
	'utf8',
);

assert(plan.includes('data-report-direction-field'));
assert(plan.includes('pktw-absolute pktw-bottom-2 pktw-right-2'));
assert(plan.includes('pktw-pr-32'));
assert(plan.includes('pktw-justify-center pktw-mt-4'));
assert(
	plan.indexOf('data-report-direction-field') < plan.indexOf('Generate report'),
	'Generate report remains a separate whole-report action after the direction field',
);

assert(followup.includes('data-report-followup-field'));
assert(followup.includes('pktw-absolute pktw-bottom-2 pktw-right-2'));
assert(followup.includes('pktw-pr-14'));
assert(
	followup.indexOf('<textarea') < followup.indexOf('title="Continue analysis"'),
	'the send action overlays the textarea instead of occupying a sibling column',
);

console.log('PASS: AI Search input actions use the shared floating-submit layout');
