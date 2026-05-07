import { CopilotActionRegistry } from '../CopilotActionRegistry';
// Document
import { polishDocumentAction } from './polish-document';
import { reviewArticleAction } from './review-article';
import { suggestLinksAction } from './suggest-links';
import { suggestSplitAction } from './suggest-split';
import { suggestTagsAction } from './suggest-tags';
import { summarizeAction } from './summarize';
import { extractConceptsAction } from './extract-concepts';
import { translateAction } from './translate';
// Vault
import { findRelatedAction } from './find-related';
import { knowledgeGapsAction } from './knowledge-gaps';
import { synthesizeTopicAction } from './synthesize-topic';
import { vaultHealthAction } from './vault-health';
// Writing
import { continueWritingAction } from './continue-writing';
import { rewriteSelectionAction } from './rewrite-selection';
import { addEvidenceAction } from './add-evidence';

export function registerAllCopilotActions(): void {
	const registry = CopilotActionRegistry.getInstance();

	// Lazy-bind ResultPanels to avoid circular imports
	polishDocumentAction.ResultPanel = require('@/ui/view/copilot/panels/PolishPanel').PolishPanel;
	reviewArticleAction.ResultPanel = require('@/ui/view/copilot/panels/ReviewPanel').ReviewPanel;
	suggestLinksAction.ResultPanel = require('@/ui/view/copilot/panels/LinkSuggestPanel').LinkSuggestPanel;
	suggestSplitAction.ResultPanel = require('@/ui/view/copilot/panels/SplitPanel').SplitPanel;
	suggestTagsAction.ResultPanel = require('@/ui/view/copilot/panels/TagSuggestionPanel').TagSuggestionPanel;
	summarizeAction.ResultPanel = require('@/ui/view/copilot/panels/SummarizePanel').SummarizePanel;
	extractConceptsAction.ResultPanel = require('@/ui/view/copilot/panels/ExtractConceptsPanel').ExtractConceptsPanel;
	translateAction.ResultPanel = require('@/ui/view/copilot/panels/TranslatePanel').TranslatePanel;
	findRelatedAction.ResultPanel = require('@/ui/view/copilot/panels/FindRelatedPanel').FindRelatedPanel;
	knowledgeGapsAction.ResultPanel = require('@/ui/view/copilot/panels/KnowledgeGapsPanel').KnowledgeGapsPanel;
	synthesizeTopicAction.ResultPanel = require('@/ui/view/copilot/panels/SynthesizePanel').SynthesizePanel;
	vaultHealthAction.ResultPanel = require('@/ui/view/copilot/panels/VaultHealthPanel').VaultHealthPanel;
	continueWritingAction.ResultPanel = require('@/ui/view/copilot/panels/ContinueWritingPanel').ContinueWritingPanel;
	rewriteSelectionAction.ResultPanel = require('@/ui/view/copilot/panels/RewriteSelectionPanel').RewriteSelectionPanel;
	addEvidenceAction.ResultPanel = require('@/ui/view/copilot/panels/AddEvidencePanel').AddEvidencePanel;

	// Document actions (order = display order in picker)
	registry.register(suggestTagsAction);
	registry.register(suggestLinksAction);
	registry.register(suggestSplitAction);
	registry.register(reviewArticleAction);
	registry.register(polishDocumentAction);
	registry.register(summarizeAction);
	registry.register(extractConceptsAction);
	registry.register(translateAction);

	// Vault
	registry.register(findRelatedAction);
	registry.register(knowledgeGapsAction);
	registry.register(synthesizeTopicAction);
	registry.register(vaultHealthAction);

	// Writing
	registry.register(continueWritingAction);
	registry.register(rewriteSelectionAction);
	registry.register(addEvidenceAction);
}
