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
			/resolveRequestedProfileAndModel\(opts\?\.profileId, opts\?\.modelId, configured\)/,
			`${methodName} must resolve the requested profile and model as one exact route`,
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

testAllSingleTurnQueryShapesConsumeModelOverride();
