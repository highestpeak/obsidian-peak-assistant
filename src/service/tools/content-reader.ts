import { AppContext } from "@/app/context/AppContext";
import { makeContentReaderInputSchema } from "@/core/schemas/tools/contentReader";
import { AgentTool, safeAgentTool } from "./types";
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
    const settings = AppContext.getInstance().settings.search;
    const inputSchema = makeContentReaderInputSchema({
        shortSummaryLength: settings.shortSummaryLength,
        fullSummaryLength: settings.fullSummaryLength,
    });
    return safeAgentTool({
        description: "Read the content of a specific file (note) by its path.",
        inputSchema,
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
                const FULL_CONTENT_MAX_CHARS = 40_000;
                if (fullContent.length > FULL_CONTENT_MAX_CHARS) {
                    return {
                        path,
                        content: `fullContent refused: file is too large (${fullContent.length} chars, max ${FULL_CONTENT_MAX_CHARS}). Use mode 'shortSummary', 'grep' (with query), or 'range' (with lineRange) instead.`,
                    };
                }
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