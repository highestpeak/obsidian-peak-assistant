import { getAIHubSummaryFolder } from '@/core/config/folderPaths';
import { isVaultPathUnderPrefix } from '@/core/utils/hub-path-utils';

/** Hub documents are already relationship summaries; do not render a recursive Hub-of-Hub row. */
export function isFileAtlasHubDocument(filePath: string, aiRootFolder: string): boolean {
	if (!aiRootFolder.trim()) return false;
	return isVaultPathUnderPrefix(filePath, getAIHubSummaryFolder(aiRootFolder));
}
