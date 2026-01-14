import { AppContext } from "@/app/context/AppContext";
import { AgentTool, safeAgentTool } from "./types";
import { z } from "zod";
import { DocumentLoaderManager } from "@/core/document/loader/helper/DocumentLoaderManager";

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
            mode: z.enum(["fullContent", "shortSummary", "fullSummary", "range", "meta"])
                .default("fullContent")
                .describe("reading mode: 'fullContent' get full content, \
                    'shortSummary' get short summary, len <" + AppContext.getInstance().settings.search.shortSummaryLength + " \
                    'fullSummary' get full summary, len <" + AppContext.getInstance().settings.search.fullSummaryLength + " \
                    'range' get specific lines"
                ),
            lineRange: z.object({
                start: z.number().describe("the start line of the range. Must be positive.").int().positive(),
                end: z.number().describe("the end line of the range. Must be positive and greater than start.").int().positive(),
            })
                .refine(
                    (obj) => typeof obj.start === "number" && typeof obj.end === "number" && obj.end > obj.start,
                    { message: "end must be greater than start" }
                )
                .optional()
                .describe("the range of lines of parsed document content to read."),
        }),
        execute: async ({ path, mode, lineRange }) => {
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

            // Handle reading modes: 'fullContent', 'shortSummary', 'fullSummary', 'range'
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

                const start = Math.max(0, lineRange.start);
                const end = Math.max(start, Math.min(contentLines.length, lineRange.end));
                return contentLines.slice(start, end).join("\n");
            }
        },
    });
};