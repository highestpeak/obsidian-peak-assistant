// T11B: Concrete AI port — delegates to the existing AIServiceManager.
//
// Lives in the app layer so service-side Copilot action code does not
// need to know that the manager comes from `AppContext`.

import type { AIServiceManager } from '@/service/chat/service-manager';
import type { CopilotActionAiPort } from '@/service/copilot/actions/CopilotActionPorts';
import type { PromptId, PromptVariables } from '@/core/prompt/PromptId';

export class AppCopilotActionAiAdapter implements CopilotActionAiPort {
	constructor(private readonly manager: AIServiceManager) {}

	renderPrompt<T extends PromptId>(promptId: T, variables: PromptVariables[T] | null): Promise<string> {
		return this.manager.renderPrompt(promptId, variables);
	}

	queryStructured<R = unknown>(promptId: any, variables: any, schema: any, options?: any): Promise<R> {
		return this.manager.queryStructured(promptId, variables, schema, options) as Promise<R>;
	}

	queryTextStream(promptId: any, variables: any, options?: any) {
		return this.manager.queryTextStream(promptId, variables, options);
	}
}
