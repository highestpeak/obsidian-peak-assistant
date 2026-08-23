import assert from 'assert';
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(
	path.resolve(process.cwd(), 'src/service/chat/service-manager.ts'),
	'utf8',
);

function methodBody(methodName: string): string {
	const match = new RegExp(`async\\s*\\*?\\s*${methodName}(?:<[^>]+>)?\\s*\\(`).exec(source);
	assert.ok(match, `${methodName} must exist`);
	const start = match.index;
	const next = source.indexOf('\n\t/**', start + 1);
	return source.slice(start, next >= 0 ? next : undefined);
}

function testAllSingleTurnQueryShapesConsumeModelOverride(): void {
	for (const methodName of ['queryText', 'queryTextStream', 'queryStructured']) {
		const body = methodBody(methodName);
		assert.match(body, /profileId\?: string/, `${methodName} must expose profileId in its query options`);
		assert.match(body, /modelId\?: string/, `${methodName} must expose modelId in its query options`);
		assert.match(
			body,
			/resolveRequestedProfileAndModel\([\s\S]*?opts\?\.profileId,[\s\S]*?opts\?\.modelId,[\s\S]*?\(\) => this\.resolve(?:Agent|Copilot)ProfileAndModel\(\),[\s\S]*?\)/,
			`${methodName} must resolve the requested profile and model as one exact route`,
		);
		assert.doesNotMatch(
			body,
			/const configured = this\.resolve(?:Agent|Copilot)ProfileAndModel\(\)/,
			`${methodName} must not require a global slot before resolving a complete per-run route`,
		);
		assert.match(
			body,
			/const modelId = resolved\.modelId;/,
			`${methodName} must execute the exact resolved model without a profile-default fallback`,
		);
		assert.match(
			body,
			/\{ provider: profile\.kind, modelId \}/,
			`${methodName} must report the model that actually ran`,
		);
	}
	console.log('PASS: allSingleTurnQueryShapesConsumeModelOverride');
}

function testExactOverridePrecedesGlobalSlotResolution(): void {
	const resolverStart = source.indexOf('private resolveRequestedProfileAndModel(');
	const resolverEnd = source.indexOf('\n\t/**', resolverStart);
	const resolver = source.slice(resolverStart, resolverEnd);
	assert.ok(resolverStart >= 0, 'exact route resolver must exist');
	assert.match(
		resolver,
		/if \(!profileId && !modelId\) return resolveConfigured\(\);/,
		'a global slot is resolved only when the caller supplied no per-run route',
	);
	assert.match(
		resolver,
		/if \(!profile\.enabled\) throw new Error/,
		'a complete override still fails closed when its selected profile is disabled',
	);
	console.log('PASS: exactOverridePrecedesGlobalSlotResolution');
}

testAllSingleTurnQueryShapesConsumeModelOverride();
testExactOverridePrecedesGlobalSlotResolution();
