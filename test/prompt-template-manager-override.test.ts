import assert from 'assert';
import { TemplateManager } from '@/core/template/TemplateManager';
import { PromptService } from '@/service/prompt/PromptService';
import { PromptId } from '@/core/types/prompt';

async function testDirectTemplateManagerRenderUsesLivePromptOverride(): Promise<void> {
	let mtime = 1;
	let override = 'Override one: {{currentQuery}}';
	const file = {
		path: 'Peak AI/Prompts/query-rewrite.prompt.md',
		extension: 'md',
		stat: { mtime },
	};
	const app = {
		vault: {
			getAbstractFileByPath(path: string) {
				file.stat.mtime = mtime;
				return path === file.path ? file : null;
			},
			async read() { return override; },
		},
	};
	const templates = new TemplateManager({
		async load() { return 'Bundled: {{currentQuery}}'; },
	});
	new PromptService(app as any, { rootFolder: 'Peak AI' } as any, undefined, templates);

	assert.strictEqual(
		await templates.render(PromptId.QueryRewrite, { currentQuery: 'first' }),
		'Override one: first',
		'direct TemplateManager callers must see the PromptService override',
	);

	override = 'Override two: {{currentQuery}}';
	mtime = 2;
	assert.strictEqual(
		await templates.render(PromptId.QueryRewrite, { currentQuery: 'second' }),
		'Override two: second',
		'the next render must refresh after the Vault override changes',
	);
	console.log('PASS: directTemplateManagerRenderUsesLivePromptOverride');
}

testDirectTemplateManagerRenderUsesLivePromptOverride().catch((error) => {
	console.error(error);
	process.exit(1);
});
