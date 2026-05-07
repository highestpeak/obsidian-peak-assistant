import { CopilotActionRegistry } from '../CopilotActionRegistry';
import { polishDocumentAction } from './polish-document';
import { reviewArticleAction } from './review-article';
import { suggestLinksAction } from './suggest-links';
import { suggestSplitAction } from './suggest-split';
import { suggestTagsAction } from './suggest-tags';

export function registerAllCopilotActions(): void {
	const registry = CopilotActionRegistry.getInstance();

	// Lazy-bind ResultPanels to avoid circular imports
	polishDocumentAction.ResultPanel = require('@/ui/view/copilot/panels/PolishPanel').PolishPanel;
	reviewArticleAction.ResultPanel = require('@/ui/view/copilot/panels/ReviewPanel').ReviewPanel;
	suggestLinksAction.ResultPanel = require('@/ui/view/copilot/panels/LinkSuggestPanel').LinkSuggestPanel;
	suggestSplitAction.ResultPanel = require('@/ui/view/copilot/panels/SplitPanel').SplitPanel;
	suggestTagsAction.ResultPanel = require('@/ui/view/copilot/panels/TagSuggestionPanel').TagSuggestionPanel;

	// Document actions (order = display order in picker)
	registry.register(suggestTagsAction);
	registry.register(suggestLinksAction);
	registry.register(suggestSplitAction);
	registry.register(reviewArticleAction);
	registry.register(polishDocumentAction);
}
