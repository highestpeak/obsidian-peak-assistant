// import { LLMStreamEvent } from '@/core/providers/types';
// import { LanguageModel, Experimental_Agent as Agent, ToolSet } from 'ai';
// import { createWebSearchTool } from '../tools/web-search';

// // Types for search tools
// export interface AISearchAgentOptions {
//     enableWebSearch?: boolean;
//     enableLocalSearch?: boolean;
//     maxSearchResults?: number;
//     graphTraversalDepth?: number;
// }

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
// smart_search 是 “内容检索”（大海捞针）。

// inspect_vault_structure 是 “位置检索”（看地图找房间）。tag “高维度坐标”

// 工具设计的核心：不要返回“原始数据”，返回“语义描述”
// 为了节省 Token 并让 Agent 听懂，你的 execute 函数应该把数据库里的 ID 转换成 Markdown 友好的描述

// 去掉不相关的数据再返回

// todo 这是另外的地方调用的? 一个绝佳的技巧：The Vault Summary 与其枚举所有信息，不如在 Agent 启动时，生成一份**“库概览” (Vault Summary)** 塞进 System Prompt 最佳实践：在 System Prompt 的初始化阶段 自动注入。做法：当插件加载时，后台跑一个轻量级的统计，生成一段话 作用：这给 Agent 提供了 "Preattentive Processing" (前注意加工)，它还没开始搜索，脑子里就已经有了库的轮廓。
// Vault Summary：一定要放在 System Prompt 的开头。
// 示例 Prompt 注入： "You are exploring a vault with 2,450 nodes and 8,120 edges. The structural backbone consists of 45 MOCs (Sources). The most dense knowledge clusters are #Artificial-Intelligence and #Personal-Finance."
// 关于 Global Tag Cloud 与 Vault Summary 的最终建议
// 这两个功能是 Agent 的“世界观

// Global Tag Cloud：建议在 Inspector 里作为一个独立的 action: "get_tag_cloud"。在 Global Tag Cloud 中，用括号标注频率（例如 #AI (120)），Agent 会自动识别出哪些是你的主领域。
// 在返回 Tag Cloud 时，按层级结构返回（如果你用了嵌套标签）：
// #Work/Projects/A (12)
// #Work/Projects/B (8) 这能让 Agent 瞬间明白你的任务管理逻辑。
// 关于 Global Tag Cloud 的展示： 建议返回时按频率降序排列，并对嵌套标签进行缩进处理
// 整个库的规模（总笔记数、总标签数）。
//建议：在 global_tag_cloud 返回时，顺便带上整个 Vault 的元数据统计，或者新增一个 vault_statistics。这对 Agent 建立“全局空间感”非常有帮助。

// statisticss 表

// /**
//  * RAG Agent for Assistant
//  */
// export class AISearchAgent {
//     private agent: Agent;

//     constructor(model: LanguageModel, options: AISearchAgentOptions) {
//         this.agent = new Agent({
//             model,
//             system: 'You are a helpful assistant for searching and analyzing notes in an Obsidian vault. \
//             You can search notes by keywords, read note content, perform web searches, and explore note connections through graph traversal.',
//             tools: {
//                 // Keyword search in notes
//                 search_notes_content: {
//                 },

//                 // Get note content
//                 get_note_content: {
//                 },

//                 // Web search
//                 web_search: createWebSearchTool(),

//                 // Fetch URL content
//                 fetch_url_content: {
//                     description: 'Fetch and convert HTML content from a URL to markdown',
//                     parameters: {
//                         type: 'object',
//                         properties: {
//                             url: {
//                                 type: 'string',
//                                 description: 'The URL to fetch content from'
//                             }
//                         },
//                         required: ['url']
//                     },
//                     execute: this.fetchUrlContent.bind(this)
//                 },

//                 // Get current time
//                 get_current_time: {
//                     description: 'Get the current date and time',
//                     parameters: {
//                         type: 'object',
//                         properties: {}
//                     },
//                     execute: this.getCurrentTime.bind(this)
//                 },

//                 // Get vault statistics
//                 get_vault_statistics: {
//                     description: 'Get statistics about the Obsidian vault',
//                     parameters: {
//                         type: 'object',
//                         properties: {}
//                     },
//                     execute: this.getVaultStatistics.bind(this)
//                 },

//                 // Get note connections (1-hop)
//                 get_note_connections: {
//                     description: 'Get backlinks and outlinks for a note (1-hop connections)',
//                     parameters: {
//                         type: 'object',
//                         properties: {
//                             path: {
//                                 type: 'string',
//                                 description: 'The file path of the note'
//                             }
//                         },
//                         required: ['path']
//                     },
//                     execute: this.getNoteConnections.bind(this)
//                 },

//                 // Graph traversal search (N-hop)
//                 graph_traversal_search: {
//                     description: 'Perform graph traversal to find connected notes within N hops',
//                     parameters: {
//                         type: 'object',
//                         properties: {
//                             startNode: {
//                                 type: 'string',
//                                 description: 'Starting note path for traversal'
//                             },
//                             depth: {
//                                 type: 'number',
//                                 description: 'Number of hops to traverse (default 2, max 5)'
//                             },
//                             filter: {
//                                 type: 'string',
//                                 description: 'Optional filter for note paths (e.g., containing specific tags)'
//                             }
//                         },
//                         required: ['startNode']
//                     },
//                     execute: this.graphTraversalSearch.bind(this)
//                 },

//                 // Find path between notes
//                 find_path_between_notes: {
//                     description: 'Find the shortest path or all paths between two notes',
//                     parameters: {
//                         type: 'object',
//                         properties: {
//                             startPath: {
//                                 type: 'string',
//                                 description: 'Starting note path'
//                             },
//                             endPath: {
//                                 type: 'string',
//                                 description: 'Ending note path'
//                             },
//                             findAll: {
//                                 type: 'boolean',
//                                 description: 'Whether to find all paths or just the shortest'
//                             }
//                         },
//                         required: ['startPath', 'endPath']
//                     },
//                     execute: this.findPathBetweenNotes.bind(this)
//                 }
//             },
//         });
//     }

//     /**
//      * Stream search results
//      */
//     async stream(prompt: string): Promise<AsyncGenerator<LLMStreamEvent>> {
//         // TODO: Implement proper streaming return type
//         const result = await this.agent.stream({
//             prompt,
//         });
//         return result.text;
//     }

//     /**
//      * Block search execution
//      */
//     async block(prompt: string): Promise<string> {
//         const result = await this.agent.run({
//             prompt,
//         });
//         return result.text;
//     }

//     // Tool implementations - TODO: implement actual functionality
//     private async searchNotesContent(args: { keyword: string; limit?: number }): Promise<SearchResult[]> {
//         // TODO: Implement keyword search using Obsidian's built-in search API
//         throw new Error('Not implemented');
//     }

//     private async getNoteContent(args: { path: string }): Promise<string> {
//         // TODO: Implement note content reading by file path
//         throw new Error('Not implemented');
//     }

//     private async webSearch(args: { query: string; limit?: number }): Promise<any[]> {
//         // TODO: Implement web search using Tavily or Exa API
//         throw new Error('Not implemented');
//     }

//     private async fetchUrlContent(args: { url: string }): Promise<string> {
//         // TODO: Implement URL content fetching and HTML to markdown conversion using Jina Reader API
//         throw new Error('Not implemented');
//     }

//     private async getCurrentTime(): Promise<string> {
//         // TODO: Implement current time retrieval
//         return new Date().toISOString();
//     }

//     private async getVaultStatistics(): Promise<VaultStats> {
//         // TODO: Implement vault statistics retrieval
//         throw new Error('Not implemented');
//     }

//     private async getNoteConnections(args: { path: string }): Promise<NoteConnection> {
//         // TODO: Implement note connections using Obsidian metadata cache
//         // Use app.metadataCache.getBacklinksForFile(file) for backlinks
//         // Use app.metadataCache.getFileCache(file).links for outlinks
//         throw new Error('Not implemented');
//     }

//     private async graphTraversalSearch(args: {
//         startNode: string;
//         depth?: number;
//         filter?: string;
//     }): Promise<SearchResult[]> {
//         // TODO: Implement BFS graph traversal within N hops
//         // Collect note titles and excerpts within the specified depth
//         throw new Error('Not implemented');
//     }

//     private async findPathBetweenNotes(args: {
//         startPath: string;
//         endPath: string;
//         findAll?: boolean;
//     }): Promise<any[]> {
//         // TODO: Implement path finding between two notes using graph algorithms
//         throw new Error('Not implemented');
//     }
// }