import assert from 'assert';
import { readFileSync } from 'fs';

const buttonPrimitive = readFileSync(
	'src/ui/component/shared-ui/button.tsx',
	'utf8',
);

assert(
	buttonPrimitive.includes('export type ButtonGeometry ='),
	'the shared Button must expose explicit fixed hit-target geometry',
);
assert(
	buttonPrimitive.includes("geometry && 'pk-button-geometry'"),
	'the shared Button must attach the reset-defending public primitive class',
);
assert(
	buttonPrimitive.includes('data-geometry={geometry}'),
	'the shared Button must expose the selected geometry to scoped CSS',
);

const AI_SEARCH_FIXED_GEOMETRY_FILES = [
	'src/ui/view/quick-search/components/V2InlinePlanReview.tsx',
	'src/ui/view/quick-search/components/V2Footer.tsx',
	'src/ui/view/quick-search/components/V2SourcesView.tsx',
	'src/ui/view/quick-search/components/V2ReportView.tsx',
	'src/ui/view/quick-search/components/V2ContinueAnalysisInput.tsx',
	'src/ui/view/quick-search/components/ActiveSessionsList.tsx',
	'src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx',
	'src/ui/view/quick-search/SearchModal.tsx',
] as const;

for (const file of AI_SEARCH_FIXED_GEOMETRY_FILES) {
	const source = readFileSync(file, 'utf8');
	assert(
		source.includes('geometry='),
		`${file} must opt its fixed controls into reset-safe geometry`,
	);
	assert(
		!/!pktw-h-(?:8|9|10)\b/.test(source),
		`${file} must not rely on Tailwind height utilities that lose to the peak-design-root button reset`,
	);
}

const plan = readFileSync(
	'src/ui/view/quick-search/components/V2InlinePlanReview.tsx',
	'utf8',
);
assert.equal(
	(plan.match(/geometry="toolbar-icon"/g) ?? []).length,
	3,
	'plan move/delete controls must use 32px square hit targets',
);
assert.equal(
	(plan.match(/geometry="action"/g) ?? []).length,
	2,
	'plan secondary actions must use 36px hit targets',
);
assert(
	plan.includes('geometry="cta"'),
	'Generate report must use the 40px primary hit target',
);

const footer = readFileSync(
	'src/ui/view/quick-search/components/V2Footer.tsx',
	'utf8',
);
assert(
	footer.includes('geometry="toolbar"'),
	'Activity / Report / Sources must use the 32px toolbar geometry',
);
assert(
	footer.includes('geometry="toolbar-icon"'),
	'footer icon actions must use 32px square geometry',
);
assert(
	footer.includes('geometry="action"'),
	'Open in Chat and follow-up actions must use 36px geometry',
);

const sources = readFileSync(
	'src/ui/view/quick-search/components/V2SourcesView.tsx',
	'utf8',
);
assert(
	sources.includes('geometry="toolbar"'),
	'Sources graph-kind and scope segments must align with Result Browser toolbar geometry',
);

const peakComponents = readFileSync('src/styles/peak-components.css', 'utf8');
assert.match(
	peakComponents,
	/:is\(\.pktw-root, \.peak-design-root\) \.pk-ai-workspace-trigger\s*\{[\s\S]*?width:\s*100% !important;[\s\S]*?min-width:\s*0 !important;[\s\S]*?max-width:\s*none !important;/,
	'the AI workspace selector must keep its full half-tab width under the Obsidian button reset',
);

console.log('ai-search-button-geometry: passed');
