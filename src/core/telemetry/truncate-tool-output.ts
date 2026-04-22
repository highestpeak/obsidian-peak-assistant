/**
 * Truncate a long tool output string to a bounded length,
 * preserving the head and tail and inserting a clearly-marked middle segment.
 *
 * The cap is measured in string length (code units), not byte length.
 * For ASCII this is identical to byte length; for unicode it is a conservative
 * approximation (shorter than byte length), which is fine for our purpose:
 * the goal is "don't blow up trace files", not "exact byte accounting".
 *
 * cap <= 0 disables truncation entirely (used when PEAK_TRACE_TOOL_CAP=0).
 */

export const DEFAULT_TOOL_CAP_BYTES = 10240;

export interface TruncateResult {
    output: string;
    truncated: boolean;
    originalBytes?: number;
}

export function truncateToolOutput(input: string, cap: number): TruncateResult {
    if (cap <= 0 || input.length <= cap) {
        return { output: input, truncated: false };
    }
    // Split cap evenly between head and tail, leaving ~80 chars for the marker.
    const headLen = Math.floor(cap * 0.4);
    const tailLen = Math.floor(cap * 0.4);
    const droppedBytes = input.length - headLen - tailLen;
    const head = input.slice(0, headLen);
    const tail = input.slice(input.length - tailLen);
    const marker = `\n[...truncated ${droppedBytes} bytes]\n`;
    return {
        output: head + marker + tail,
        truncated: true,
        originalBytes: input.length,
    };
}
