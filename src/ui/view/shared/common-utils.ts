export async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (e) {
        console.warn('[KnowledgeGraphSection] Failed to copy:', e);
    }
};