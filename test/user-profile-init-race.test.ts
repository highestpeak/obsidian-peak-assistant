import assert from 'assert';
import type { AppHandle } from '@/core/ports/AppHandle';
import { UserProfileService } from '@/service/chat/context/UserProfileService';
import type { PromptService } from '@/service/prompt/PromptService';

async function testInitDoesNotMaterializeProfile(): Promise<void> {
	const created: string[] = [];
	const app = {
		vault: {
			getAbstractFileByPath: () => null,
			createFolder: async () => undefined,
			create: async (path: string) => { created.push(path); },
		},
	} as unknown as AppHandle;
	const service = new UserProfileService(
		app,
		{} as PromptService,
		'ChatFolder/System/User-Profile.md',
	);

	await service.init();
	assert.deepStrictEqual(created, []);
}

async function testInitDoesNotCreateFolders(): Promise<void> {
	const createdFolders: string[] = [];
	const app = {
		vault: {
			getAbstractFileByPath: () => null,
			createFolder: async (path: string) => { createdFolders.push(path); },
		},
	} as unknown as AppHandle;
	const service = new UserProfileService(
		app,
		{} as PromptService,
		'ChatFolder/System/User-Profile.md',
	);

	await service.init();
	assert.deepStrictEqual(createdFolders, []);
}

async function main(): Promise<void> {
	await testInitDoesNotMaterializeProfile();
	await testInitDoesNotCreateFolders();
	console.log('user-profile-init-race: all guards passed');
}

void main();
