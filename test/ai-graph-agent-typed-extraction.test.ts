import assert from 'node:assert/strict';
import { AIGraphAgent } from '../src/service/agents/AIGraphAgent';
import { PromptId } from '../src/core/types/prompt';

async function run(): Promise<void> {
	const calls: Array<{ prompt: string; variables: Record<string, unknown> }> = [];
	const app = {
		vault: {
			getFileByPath: (path: string) => path === 'Notes/ada.md'
				? { path, stat: { ctime: 1, mtime: 2 } }
				: null,
			getAbstractFileByPath: (path: string) => path === 'Notes/ada.md'
				? { path, stat: { ctime: 1, mtime: 2 } }
				: null,
			cachedRead: async () => 'Ada designed an algorithm for the Analytical Engine.',
		},
		metadataCache: {
			getFileCache: () => null,
			resolvedLinks: {},
		},
	};
	const searchClient = {
		search: async () => ({
			items: [{
				id: 'Notes/ada.md',
				type: 'markdown',
				title: 'ada.md',
				path: 'Notes/ada.md',
				lastModified: 2,
				score: 1,
				finalScore: 1,
				highlight: null,
			}],
		}),
	};
	const prompter = {
		queryStructured: async (
			prompt: string,
			variables: Record<string, unknown>,
		) => {
			calls.push({ prompt, variables });
			return {
				nodes: [
					{
						path: 'Notes/ada.md',
						label: 'Ada note',
						role: 'hub',
						cluster_id: 'history',
						summary: 'A source note',
						importance: 1,
						artifact_kind: 'vault-document',
					},
					{
						path: 'person://ada-lovelace',
						label: 'Ada Lovelace',
						role: 'leaf',
						cluster_id: 'history',
						summary: 'A person',
						importance: 0.9,
						artifact_kind: 'person',
						evidence: [{
							source_path: 'Notes/ada.md',
							quote: 'Ada designed an algorithm for the Analytical Engine.',
						}],
					},
				],
				edges: [{
					source: 'person://ada-lovelace',
					target: 'Notes/ada.md',
					kind: 'references',
					label: 'described by',
					weight: 0.9,
					predicate: 'described-by',
					family: 'attribution',
					directed: true,
					evidence: [{
						source_path: 'Notes/ada.md',
						quote: 'Ada designed an algorithm for the Analytical Engine.',
					}],
				}],
				clusters: [],
				bridges: [],
				evolution_chains: [],
			};
		},
	};
	const agent = new AIGraphAgent(app as any, searchClient as any, prompter as any);
	let graphData: any = null;
	for await (const event of agent.startSession('Who is Ada?', { graphType: 'entity' })) {
		if (event.type === 'ui-signal' && (event as any).channel === 'ai-graph-data') {
			graphData = (event as any).data.graphData;
		}
	}

	assert.equal(calls.length, 1);
	assert.equal(calls[0].prompt, PromptId.AIGraphArtifactExtract);
	assert.equal(calls[0].variables.graphType, 'entity');
	assert.equal(graphData.nodes[1].artifactKind, 'person');
	assert.equal(graphData.edges[0].predicate, 'described-by');
	assert.equal(graphData.edges[0].evidenceQuotes.length, 1);
}

void run();
