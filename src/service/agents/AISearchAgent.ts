import { LLMStreamEvent } from '@/core/providers/types';
import { contentReaderTool } from '../tools/content-reader';
import { vaultGraphInspectorTool } from '../tools/search-graph-inspector';
import { localWebSearchTool } from '../tools/search-web';
import { LanguageModel, Experimental_Agent as Agent, ToolSet } from 'ai';
import { genSystemInfo } from '../tools/system-info';
import { PromptService } from '../prompt/PromptService';
import { PromptId } from '../prompt/PromptId';

export interface AISearchAgentOptions {
    enableWebSearch?: boolean;
    enableLocalSearch?: boolean;
}

// export interface SearchResult {
//     path: string;
//     title: string;
//     excerpt?: string;
//     score?: number;
// }

// export interface NoteConnection {
//     backlinks: string[];
//     outlinks: string[];
// }

// export interface VaultStats {
//     totalNotes: number;
//     latestNote?: {
//         path: string;
//         modified: Date;
//     };
// }

/**
 * RAG Agent for Assistant
 */
export class AISearchAgent {
    private agent: Agent<ToolSet>;

    constructor(
        model: LanguageModel,
        options: AISearchAgentOptions,
        private promptService: PromptService
    ) {
        let tools: ToolSet = {
            content_reader: contentReaderTool(),
        }
        if (options.enableWebSearch) {
            tools.web_search = localWebSearchTool();
        }
        if (options.enableLocalSearch) {
            tools.vault_inspector = vaultGraphInspectorTool();
        }

        this.agent = new Agent<ToolSet>({
            model,
            // stream and block will override the system prompt
            // system: await this.getSystemPrompt(),
            tools,
        });
    }

    /**
     * world view
     */
    private async getSystemPrompt(): Promise<string> {
        const systemInfo = await genSystemInfo();
        return this.promptService.render(PromptId.AiSearchSystem, systemInfo);
    }

    /**
     * Stream search results
     */
    async stream(prompt: string): Promise<AsyncGenerator<LLMStreamEvent>> {
        const result = this.agent.stream({
            system: await this.getSystemPrompt(),
            prompt,
        });

        // todo
        return (async function* (): AsyncGenerator<LLMStreamEvent> {
            for await (const chunk of result.fullStream) {
                switch (chunk.type) {
                    case 'text-delta':
                        yield { type: 'text-delta', text: chunk.text };
                        break;
                    case 'reasoning-delta':
                        yield { type: 'reasoning-delta', text: chunk.text };
                        break;
                    case 'tool-call':
                        yield { type: 'tool-call', toolName: chunk.toolName, input: chunk.input };
                        break;
                    case 'tool-result':
                        yield { type: 'tool-result', toolName: chunk.toolName, input: chunk.input, output: chunk.output };
                        break;
                }
            }
        })();
    }

    /**
     * Block search execution
     */
    async block(prompt: string): Promise<string> {
        const result = await this.agent.generate({
            system: await this.getSystemPrompt(),
            prompt,
        });
        return result.text;
    }

}