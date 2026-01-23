
/**
 * characters count
 */
const MAX_STRING_LENGTH = 50000;

export function safeProcess(label: string, data: any) {
    console.debug("debug-tools: safeProcess check for ", label);
    if (typeof data === 'string' && data.length > MAX_STRING_LENGTH) {
        console.warn("debug-tools: safeProcess: ", label, "data is too long");
    }
    // If data is an array and joining its string elements exceeds 50000 characters
    if (Array.isArray(data)) {
        let totalLength = 0;
        for (const item of data) {
            if (typeof item === 'string') {
                totalLength += item.length;
            }
        }
        if (totalLength > MAX_STRING_LENGTH) {
            console.warn("debug-tools: safeProcess: ", label, "array string join is too long");
        }
    }
    return data;
}
