import type { GeneratedOutputDescriptor } from '../types';
import { durableRecord, outputPath, userArtifact } from './helpers';

export const PROFILE_GENERATED_OUTPUTS: readonly GeneratedOutputDescriptor[] = [
	userArtifact({
		documentationId: 'UA-01', id: 'user-profile.markdown', owner: 'user-profile', carrier: 'markdown',
		path: outputPath('ai-root', 'system/User-Profile.md'),
		writerEvidence: ['src/service/chat/context/UserProfileService.ts'], peakIndexPolicy: 'exclude', lifecycle: 'active',
	}),
	userArtifact({
		documentationId: 'UA-02', id: 'prompt.override', owner: 'prompt', carrier: 'markdown',
		path: outputPath('ai-root', 'Prompts/{promptId}.prompt.md'),
		writerEvidence: ['src/service/prompt/PromptService.ts'], peakIndexPolicy: 'exclude',
	}),
	userArtifact({
		documentationId: 'UA-03', id: 'skill.vault-definition', owner: 'skill', carrier: 'markdown',
		path: outputPath('ai-root', 'Skills/{skillId}.md'),
		writerEvidence: ['src/service/skills/SkillRegistry.ts'], peakIndexPolicy: 'exclude',
	}),
	durableRecord({
		documentationId: 'DR-16', id: 'user-profile.proposal-events', owner: 'user-profile', carrier: 'jsonl',
		path: outputPath('data-store', 'records/user-profile/proposals.jsonl'),
		writerEvidence: ['src/service/chat/context/UserProfileService.ts'],
	}),
];
