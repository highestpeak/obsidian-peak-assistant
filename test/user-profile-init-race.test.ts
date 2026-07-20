import assert from 'assert';
import type { AppHandle } from '@/core/ports/AppHandle';
import { UserProfileService } from '@/service/chat/context/UserProfileService';
import type { PromptService } from '@/service/prompt/PromptService';

async function testExistingFileRaceIsIdempotent(): Promise<void> {
	const created: string[] = [];
	const app = {
		vault: {
			getAbstractFileByPath: () => null,
			createFolder: async () => undefined,
			create: async (path: string) => {
				created.push(path);
				throw new Error('File already exists.');
			},
		},
	} as unknown as AppHandle;
	const service = new UserProfileService(
		app,
		{} as PromptService,
		'ChatFolder/System/User-Profile.md',
	);

	await service.init();
	assert.deepStrictEqual(created, ['ChatFolder/System/User-Profile.md']);
}

async function testUnexpectedCreateFailureStillSurfaces(): Promise<void> {
	const app = {
		vault: {
			getAbstractFileByPath: () => null,
			createFolder: async () => undefined,
			create: async () => {
				throw new Error('Permission denied');
			},
		},
	} as unknown as AppHandle;
	const service = new UserProfileService(
		app,
		{} as PromptService,
		'ChatFolder/System/User-Profile.md',
	);

	await assert.rejects(() => service.init(), /Permission denied/);
}

async function main(): Promise<void> {
	await testExistingFileRaceIsIdempotent();
	await testUnexpectedCreateFailureStillSurfaces();
	console.log('user-profile-init-race: all guards passed');
}

void main();
