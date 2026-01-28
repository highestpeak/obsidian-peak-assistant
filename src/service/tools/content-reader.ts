import { AppContext } from "@/app/context/AppContext";
import { AgentTool, safeAgentTool } from "./types";
import { z } from "zod/v3"
import { DocumentLoaderManager } from "@/core/document/loader/helper/DocumentLoaderManager";

function escapeRegExpLiteral(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildAutoRegex(query: string, caseSensitive: boolean): { regex: RegExp; isLiteralFallback: boolean } {
    const flags = caseSensitive ? "g" : "gi";
    try {
        return { regex: new RegExp(query, flags), isLiteralFallback: false };
    } catch {
        return { regex: new RegExp(escapeRegExpLiteral(query), flags), isLiteralFallback: true };
    }
}

/**
 * todo read from db to get tags. links. categories. etc. first check db hash with current hash. if different, read from file.
 *  if not then read from db directly. and fill with doc_statistics
 * 
 * Simple tool to read the content of a specific file (note) by its path.
 */
export function contentReaderTool(): AgentTool {
    return safeAgentTool({
        description: "Read the content of a specific file (note) by its path.",
        inputSchema: z.object({
            path: z.string().describe("path related to vault root."),
            mode: z.enum(["fullContent", "shortSummary", "fullSummary", "range", "grep", "meta"])
                .default("fullContent")
                .describe("reading mode: 'fullContent' get full content, \
                    'shortSummary' get short summary, len <" + AppContext.getInstance().settings.search.shortSummaryLength + " \
                    'fullSummary' get full summary, len <" + AppContext.getInstance().settings.search.fullSummaryLength + " \
                    'range' get specific lines (1-based, inclusive), \
                    'grep' search within a single file and return matched lines"
                ),
            lineRange: z.object({
                start: z.number().describe("The start line (1-based). Must be positive.").int().positive(),
                end: z.number().describe("The end line (1-based). Must be positive and >= start.").int().positive(),
            })
                .refine(
                    (obj) => typeof obj.start === "number" && typeof obj.end === "number" && obj.end >= obj.start,
                    { message: "end must be greater than or equal to start" }
                )
                .optional()
                .describe("the range of lines of parsed document content to read."),
            query: z.string().optional().describe("Search query used by grep mode. Treated as RegExp by default; falls back to literal match if invalid."),
            case_sensitive: z.boolean().optional().default(true).describe("Case sensitive search for grep mode. Default true."),
            max_matches: z.number().int().min(1).max(50).optional().default(50).describe("Maximum number of matches for grep mode (hard cap 50)."),
        }).superRefine((data, ctx) => {
            if (data.mode === "range") {
                if (!data.lineRange) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["lineRange"], message: "lineRange is required when mode is 'range'" });
                }
            }
            if (data.mode === "grep") {
                if (!data.query || !data.query.trim()) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["query"], message: "query is required when mode is 'grep'" });
                }
            }
        }),
        execute: async ({ path, mode, lineRange, query, case_sensitive, max_matches }) => {
            const isMetaLoad = mode === "meta";

            const document = await DocumentLoaderManager.getInstance().readByPath(path, !isMetaLoad);
            if (!document) {
                return {
                    path,
                    content: "File not found or not readable or not supported.",
                };
            }
            if (isMetaLoad) {
                return document.metadata;
            }

            // Handle reading modes: 'fullContent', 'shortSummary', 'fullSummary', 'range', 'grep'
            const { cacheFileInfo, sourceFileInfo, summary } = document;
            const fullContent = (sourceFileInfo?.content ?? cacheFileInfo?.content ?? "No content found").toString();

            if (mode === "fullContent") {
                return fullContent || "";
            }

            if (mode === "shortSummary" && document.summary) {
                // Use summary if available, else fallback to content
                return summary;
            }

            if (mode === "fullSummary") {
                return document.cacheFileInfo.content;
            }

            if (mode === "range") {
                // We treat only string content as ranged-readable
                const contentLines = (fullContent || "").split(/\r?\n/);

                // 1-based inclusive => slice(start-1, end)
                const startLine = Math.max(1, lineRange!.start);
                const endLine = Math.max(startLine, lineRange!.end);
                const startIdx = startLine - 1;
                const endIdxExclusive = Math.min(contentLines.length, endLine);
                return contentLines.slice(startIdx, endIdxExclusive).join("\n");
            }

            if (mode === "grep") {
                /**
                 * Grep mode (single file):
                 * - Prefer treating query as a RegExp; fallback to literal match if invalid.
                 * - Return structured vimgrep-like matches for tool chaining.
                 */
                const contentLines = (fullContent || "").split(/\r?\n/);
                const cap = Math.min(50, max_matches ?? 50);
                const { regex, isLiteralFallback } = buildAutoRegex(query!, case_sensitive ?? true);

                const matches: Array<{ path: string; line: number; col: number; text: string }> = [];

                for (let i = 0; i < contentLines.length; i++) {
                    const lineText = contentLines[i] ?? "";
                    regex.lastIndex = 0;
                    let guard = 0;
                    let m: RegExpExecArray | null;

                    while ((m = regex.exec(lineText)) !== null) {
                        const col = (m.index ?? 0) + 1; // 1-based column
                        matches.push({ path, line: i + 1, col, text: lineText });
                        if (matches.length >= cap) break;

                        // Prevent infinite loops for empty-string matches.
                        if (m[0]?.length === 0) {
                            regex.lastIndex = Math.min(lineText.length, regex.lastIndex + 1);
                        }
                        // Extra guard in case of pathological regex behavior
                        guard++;
                        if (guard > 10_000) break;
                    }

                    if (matches.length >= cap) break;
                }

                return { matches };
            }

            // Fallback: if mode is unknown, return full content.
            return fullContent || "";
        },
    });
};