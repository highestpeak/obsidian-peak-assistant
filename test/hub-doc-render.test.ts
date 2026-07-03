// Skeleton render preserves user content + emits expected frontmatter fields.

import assert from 'assert';
import Handlebars from 'handlebars';
import { renderHubDocMarkdown } from '@/service/agents/hub-materialization-helper/hubDocRender';

async function main() {
	testSkeletonRenderIncludesFrontmatterAndPreservedUserBlock();
	console.log('hub-doc-render: ok');
}

async function testSkeletonRenderIncludesFrontmatterAndPreservedUserBlock() {
	// Compile the actual template inline so this test does not depend on
	// TemplateManager caching or plugin bootstrap.
	const skeletonSrc = `---
title: "{{title}}"
type: hub_doc
peak_user_owned: false
peak_hub_node_id: "{{hubNodeId}}"
peak_hub_generated_at: "{{generatedAtIso}}"
peak_hub_plan_id: "{{planId}}"
peak_hub_coverage: {{coverage}}
---

# {{title}}

{{summary}}

## 核心概念
{{coreConceptSection}}

## 结构脉络
{{structureSection}}

## 演化时间线
{{evolutionSection}}

## 未解问题
{{openQuestionsSection}}

## 入口
{{entryPointsSection}}

<!-- USER_SECTIONS_BELOW -->
{{userPreservedContent}}`;
	const compiled = Handlebars.compile(skeletonSrc, { noEscape: true });

	const tm = {
		async render(_id: string, vars: Record<string, unknown>) {
			return compiled(vars);
		},
	} as any;

	const md = await renderHubDocMarkdown({
		tm,
		draft: {
			title: 'Hub Overview',
			summary: 'Short summary.',
			coreConceptSection: 'core body',
			structureSection: 'structure body',
			evolutionSection: 'evolution body',
			openQuestionsSection: 'open body',
			entryPointsSection: 'entry body',
			referencedMemberIds: ['n1', 'n2'],
		},
		hubNodeId: 'hub-n1',
		planId: 'plan-1',
		coverage: 0.9,
		userPreservedContent: '## User notes\ndo not overwrite',
		generatedAtIso: '2026-07-03T00:00:00.000Z',
	});

	assert.ok(md.includes('title: "Hub Overview"'));
	assert.ok(md.includes('peak_hub_node_id: "hub-n1"'));
	assert.ok(md.includes('peak_hub_plan_id: "plan-1"'));
	assert.ok(md.includes('peak_hub_coverage: 0.900'));
	assert.ok(md.includes('## User notes'));
	assert.ok(md.includes('do not overwrite'));
	assert.ok(md.includes('<!-- USER_SECTIONS_BELOW -->'));
	console.log('  ✓ frontmatter + preserved user block');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
