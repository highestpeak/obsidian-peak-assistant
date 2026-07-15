import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const base = 'http://127.0.0.1:8173/docs/gstack/chat-studio-interactive-2026-07-13';
const browser = await chromium.launch({ headless: true });
const failures = [];
const checks = [];

function check(condition, message, detail = '') {
  if (condition) checks.push(message);
  else failures.push(`${message}${detail ? `: ${detail}` : ''}`);
}

async function usePage(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  return { page, errors };
}

{
  const { page, errors } = await usePage({ width: 1728, height: 880 });
  await page.goto(`${base}/index.html#catalog`, { waitUntil: 'networkidle' });
  check(await page.locator('.inline-followup').count() === 0, 'Nested follow-up Composer removed');
  check(await page.locator('#composer-context .context-chip').count() === 1, 'Default Composer only shows explicit document context');

  await page.locator('#composer-plus').click();
  check(await page.locator('#composer-plus-menu [data-composer-action="web"]').count() === 0, 'Add menu does not duplicate Web source scope');
  check(await page.locator('#composer-plus-menu [data-composer-action="image"]').count() === 0, 'Add menu does not duplicate generation workflows');
  check(await page.locator('#composer-plus-menu [data-composer-action="link"]').count() === 1, 'Add menu is limited to input resources');
  await page.keyboard.press('Escape');

  await page.locator('#source-settings').click();
  await page.locator('#source-popover [data-source-toggle="vault"]').click();
  check(await page.locator('#source-popover.is-open').count() === 1, 'Source popover stays open after the first independent toggle');
  await page.locator('#source-popover [data-source-toggle="web"]').click();
  check(await page.locator('#source-popover.is-open').count() === 1, 'Source popover stays open while composing multiple sources');
  check(await page.locator('#source-popover [data-source-toggle="vault"][aria-pressed="true"]').count() === 1, 'Vault Search can be enabled independently');
  check(await page.locator('#source-popover [data-source-toggle="web"][aria-pressed="true"]').count() === 1, 'Web Search can be enabled independently');
  check((await page.locator('#source-chip-label').textContent()) === '项目上下文 + Vault + Web', 'Composer summarizes the combined project, Vault and Web sources');
  check(await page.locator('#source-popover [data-source-toggle="project"] .source-always').count() === 1, 'Locked project context uses a semantic fixed badge instead of a misleading switch');
  const sourceIconRatio = await page.locator('#source-popover .source-option__icon').first().evaluate((node) => {
    const box = node.getBoundingClientRect();
    const svg = node.querySelector('svg').getBoundingClientRect();
    return { box: Math.round(box.width), svg: Math.round(svg.width) };
  });
  check(sourceIconRatio.box === 24 && sourceIconRatio.svg === 13, 'Source icon and text use the compact 24/13 proportion', JSON.stringify(sourceIconRatio));
  await page.keyboard.press('Escape');

  await page.locator('#composer-input').fill('/');
  check(await page.locator('#workflow-popover.is-open').count() === 1, 'Slash opens the unique workflow surface');
  await page.locator('[data-workflow="research"]').click();
  check((await page.locator('#composer-context .is-workflow').textContent()).includes('研究'), 'Workflow selection is reflected before send');

  const messageActionRow = page.locator('.message-meta[data-message-actions]').last();
  await messageActionRow.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  check(await messageActionRow.locator('[data-message-core]:visible').count() === 5, 'Copy, Retry, Star, Branch and Trace remain persistent core actions');
  check(await messageActionRow.locator('[data-message-direct="trace"]:visible').count() === 1, 'Trace never moves into overflow');
  check(await messageActionRow.locator('[data-message-inline-action]:visible').count() === 5, 'Wide answer rows promote every adaptive action inline');
  check(await messageActionRow.locator('[data-message-menu]:visible').count() === 0, 'Wide answer rows remove the redundant More button');
  await messageActionRow.locator('[data-message-inline-action="raw"]').click();
  check(await page.locator('#raw-message-layer.is-open').count() === 1, 'View raw opens a readable message payload');
  check((await page.locator('#raw-message-content').textContent()).includes('"role": "assistant"'), 'Raw message payload includes structured role metadata');
  await page.locator('[data-close-raw-message]').click();
  await page.setViewportSize({ width: 894, height: 880 });
  await page.waitForTimeout(160);
  const overflowActionIds = (await messageActionRow.getAttribute('data-overflow-actions')).split(',').filter(Boolean);
  const actionPriority = ['followup', 'save', 'raw', 'markdown', 'json'];
  const firstHidden = actionPriority.findIndex((action) => overflowActionIds.includes(action));
  check(firstHidden >= 0 && JSON.stringify(overflowActionIds) === JSON.stringify(actionPriority.slice(firstHidden)), 'Adaptive actions enter overflow from lowest to highest priority', JSON.stringify(overflowActionIds));
  check(await messageActionRow.locator('[data-message-core]:visible').count() === 5, 'Core actions remain visible after adaptive compression');
  check(await messageActionRow.locator('[data-message-menu]:visible').count() === 1, 'More appears only when adaptive actions actually overflow');
  await messageActionRow.locator('[data-message-menu]:visible').click();
  const overflowMenuIds = await page.locator('.message-action-menu [data-message-more-action]').evaluateAll((nodes) => nodes.map((node) => node.dataset.messageMoreAction));
  check(JSON.stringify(overflowMenuIds) === JSON.stringify(overflowActionIds), 'More contains only the actions currently compressed from the row', JSON.stringify(overflowMenuIds));
  const visibleAdaptiveIds = await messageActionRow.locator('[data-message-inline-action]:visible').evaluateAll((nodes) => nodes.map((node) => node.dataset.messageInlineAction));
  check(!visibleAdaptiveIds.some((action) => overflowMenuIds.includes(action)), 'Visible actions are never duplicated inside More');
  await page.keyboard.press('Escape');
  const inlineFollowup = messageActionRow.locator('[data-message-inline-action="followup"]:visible');
  if (await inlineFollowup.count()) {
    await inlineFollowup.click();
  } else {
    await messageActionRow.locator('[data-message-menu]:visible').click();
    await page.locator('[data-message-more-action="followup"]').click();
  }
  check(await page.locator('#composer-context .is-reply').count() === 1, 'Message follow-up returns to the main Composer with a reply anchor');
  await page.setViewportSize({ width: 1728, height: 880 });
  await page.waitForTimeout(160);

  await page.locator('#run-settings').click();
  check(await page.locator('#run-popover [data-run-policy], #run-popover .policy-grid, #run-popover [data-reasoning]').count() === 0, 'Run menu does not expose fake Fast/Balanced/Best or unwired reasoning controls');
  check(await page.getByRole('button', { name: /^(快速|平衡|最佳)$/ }).count() === 0, 'Run menu has no performance-preset buttons disguised as runtime controls');
  await page.locator('[data-run-view="model"]').click();
  await page.locator('[data-model-filter-toggle]').click();
  await page.locator('[data-model-capability="vision"]').click();
  await page.locator('[data-model-context="1000"]').click();
  check(await page.locator('[data-model="gemini-2.5-pro"], [data-model="gemini-2.0-flash-thinking"]').count() === 2, 'Model filters combine declared vision capability with a one-million-token context floor');
  check(await page.locator('[data-model="gpt-5"]').count() === 0, 'Context filter removes models below the selected floor');
  check((await page.locator('[data-model-filter-toggle]').textContent()).includes('2'), 'Model filter trigger exposes the number of active constraints');
  await page.locator('[data-model-filter-clear]').click();
  await page.locator('[data-model-search]').fill('gemini-2.0-flash-thinking');
  check((await page.locator('#run-popover .run-group-label').allTextContents()).includes('Google · Research'), 'Model search preserves the configured Profile grouping');
  check(await page.locator('[data-model="gemini-2.0-flash-thinking"]').count() === 1, 'Model search resolves an exact provider model ID');
  const modelChoiceText = await page.locator('[data-model="gemini-2.0-flash-thinking"]').textContent();
  check(modelChoiceText.includes('Google') && modelChoiceText.includes('输出 64K'), 'Model row exposes provider and declared capability tags', modelChoiceText);
  check((await page.locator('#run-popover .capability-note').textContent()).includes('没有已启用的图片生成模型'), 'Model picker explicitly avoids inventing image-generation support');
  await page.locator('[data-model="gemini-2.0-flash-thinking"]').click();
  check((await page.locator('#run-model-label').textContent()) === 'Google · Research · Gemini 2.0 Flash Thinking', 'Concrete Profile and model selection is reflected in Composer');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(directory, 'preview-run-model.png') });
  await page.keyboard.press('Escape');

  await page.locator('#run-settings').click();
  await page.locator('[data-run-view="assistant"]').click();
  await page.locator('[data-assistant-search]').fill('证据');
  check(await page.locator('[data-assistant="evidence-coach"]').count() === 1, 'Assistant picker supports search by name or purpose');
  check(await page.locator('[data-assistant="architecture-reviewer"]').count() === 0, 'Assistant search removes unrelated assistants');
  await page.locator('[data-assistant="evidence-coach"]').click();
  check((await page.locator('#composer-context .is-assistant').textContent()).includes('面试证据教练'), 'Custom Assistant is visible as the current conversation default');
  check(await page.locator('#run-popover.is-open').count() === 0, 'Assistant selection returns to the single Composer surface');

  const outlineFilterDisplay = await page.locator('.right-filterbar').evaluate((node) => getComputedStyle(node).display);
  check(outlineFilterDisplay === 'none', 'Outline hides the otherwise orphaned resource filter row', outlineFilterDisplay);
  await page.locator('.right-tab[data-tab="resources"]').click();
  const resourceFilterDisplay = await page.locator('.right-filterbar').evaluate((node) => getComputedStyle(node).display);
  check(resourceFilterDisplay === 'flex', 'Resources view reveals direction and type filters together', resourceFilterDisplay);
  await page.locator('[data-direction="output"]').click();
  await page.locator('#type-filter-trigger').click();
  await page.locator('[data-index-type="document"]').click();
  const resourceRows = await page.locator('.artifact-row').count();
  check(resourceRows > 0, 'Resources view filters generated documents');
  check(await page.locator('.artifact-row[data-resource-direction="input"]').count() === 0, 'Output direction excludes input resources');
  await page.locator('.artifact-row').first().click();
  check(await page.locator('#catalog-artifacts.is-located').count() === 1, 'Right navigation locates a real conversation target');

  const catalogRow = page.locator('[data-conversation="conversation-catalog"]').first();
  await catalogRow.hover();
  await catalogRow.locator('[data-row-menu]').click();
  const menuBackground = await page.locator('.row-context-menu').evaluate((node) => getComputedStyle(node).backgroundColor);
  check(menuBackground !== 'rgba(0, 0, 0, 0)' && menuBackground !== 'transparent', 'Conversation menu has an opaque surface', menuBackground);
  check((await page.locator('.row-context-menu').textContent()).includes('取消置顶'), 'Pinned row menu shows one state-specific action');
  await page.keyboard.press('Escape');

  await page.locator('#regenerate-title').click();
  await page.waitForTimeout(620);
  const titleTyping = await page.locator('#conversation-title').evaluate((node) => ({ text: node.textContent, color: getComputedStyle(node).color, typing: node.classList.contains('is-typing') }));
  check(titleTyping.typing && titleTyping.text.length > 0, 'Title regeneration visibly types intermediate characters', JSON.stringify(titleTyping));
  check(!titleTyping.color.includes('rgba(0, 0, 0, 0)'), 'Title typing is not visually transparent', titleTyping.color);
  await page.waitForTimeout(1600);

  await page.locator('.right-tab[data-tab="outline"]').click();
  check(await page.locator('.right-filterbar').evaluate((node) => getComputedStyle(node).display) === 'none', 'Returning to Outline removes the filterbar again');
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(directory, 'preview-gate2.png') });

  await page.locator('#open-workspace-search').click();
  check(await page.locator('#native-search-handoff-layer.is-open').count() === 1, 'Knowledge search hands off to the native Quick Search surface');
  check(await page.locator('#native-search-handoff [data-search-mode], #native-search-handoff button:not([data-close-native-search])').count() === 0, 'Native handoff does not redraw guessed Quick Search controls');
  check(await page.locator('#quick-search-tabs, #workspace-search, #search-primary-action, [data-analysis-mode]').count() === 0, 'Legacy fake Quick Search implementation is absent from the mock');
  check(await page.locator('#open-workspace-search kbd').count() === 0, 'Sidebar does not claim an unconfigured Command-K shortcut');
  const nativeSearchText = await page.locator('#native-search-handoff').textContent();
  check(nativeSearchText.includes('QuickSearchModal'), 'Native handoff names the production-owned modal boundary', nativeSearchText);
  check(nativeSearchText.includes('Raw retrieval') && nativeSearchText.includes('Vault Search'), 'Handoff documents Raw retrieval without simulating its UI', nativeSearchText);
  check(nativeSearchText.includes('Generative synthesis') && nativeSearchText.includes('AI Search'), 'Handoff documents Generative synthesis without simulating its UI', nativeSearchText);
  check(nativeSearchText.includes('Vault-wide review') && nativeSearchText.includes('Vault Intelligence'), 'Handoff documents Vault-wide review without simulating its UI', nativeSearchText);
  check(nativeSearchText.includes('Mock') && nativeSearchText.includes('不会出现在正式产品'), 'Boundary explanation is explicitly marked as mock-only copy', nativeSearchText);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(directory, 'preview-native-search-handoff.png') });
  await page.keyboard.press('Escape');
  check(await page.locator('#native-search-handoff-layer.is-open').count() === 0, 'Escape closes the native search handoff');

  await page.locator('[data-open-history]').click();
  check(await page.locator('#conversation-search-layer.is-open').count() === 1, 'Conversation history opens an independent title-search picker');
  check(await page.locator('#conversation-search-results [data-conversation-result]').count() > 0, 'Conversation title picker returns conversation rows');
  check(await page.locator('#conversation-search [data-vault-document], #conversation-search [data-search-mode]').count() === 0, 'Conversation title picker does not mix Vault documents or native search modes');
  const conversationSearchText = await page.locator('#conversation-search').textContent();
  check(conversationSearchText.includes('只筛选已加载的对话标题'), 'Conversation title picker states its title-only boundary', conversationSearchText);
  check(await page.locator('#conversation-type-trigger').count() === 1, 'Conversation history exposes a compact type filter without crowding the sidebar heading');
  check(await page.locator('[data-conversation-result="conversation-architecture"]').count() === 1, 'Conversation history deduplicates repeated pinned and recent entries');
  check(await page.locator('[data-conversation-result="product-strategy"], [data-conversation-result="conversation-composer-lab"]').count() === 0, 'Conversation history excludes pinned design documents from conversation results');
  await page.locator('#conversation-type-trigger').click();
  check(await page.locator('#conversation-type-menu.is-open').count() === 1, 'Conversation type filter opens as a local menu inside the history picker');
  const canonicalConversationTypes = await page.locator('#conversation-type-menu [data-conversation-type]').evaluateAll((nodes) => nodes.map((node) => node.dataset.conversationType));
  check(['all', 'chat', 'agent', 'plan', 'canvas', 'template', 'custom'].every((kind) => canonicalConversationTypes.includes(kind)), 'Conversation filter uses the production ConversationType kinds', canonicalConversationTypes.join(','));
  check(!canonicalConversationTypes.includes('project') && !canonicalConversationTypes.includes('research'), 'Project membership and one-turn workflows are not presented as conversation types', canonicalConversationTypes.join(','));
  await page.locator('#conversation-type-menu [data-conversation-type="plan"]').click();
  const planKinds = await page.locator('#conversation-search-results [data-conversation-result]').evaluateAll((nodes) => nodes.map((node) => node.dataset.conversationKind));
  check(planKinds.length > 0 && planKinds.every((kind) => kind === 'plan'), 'Conversation type filter returns only the selected canonical kind', planKinds.join(','));
  await page.locator('#conversation-search-input').fill('Boundary');
  check(await page.locator('#conversation-search-results [data-conversation-result="conversation-boundary"]').count() === 1, 'Conversation title query and type filter combine with AND semantics');
  await page.locator('#conversation-search-input').fill('');
  await page.locator('#conversation-type-trigger').click();
  await page.locator('#conversation-type-menu [data-conversation-type="all"]').click();
  await page.locator('#conversation-search-input').fill('Story Cards');
  check(await page.locator('#conversation-search-results [data-conversation-result]').count() > 0, 'Conversation title filtering remains usable independently');
  await page.keyboard.press('Escape');
  await page.locator('[data-open-history]').click();
  check((await page.locator('#conversation-type-label').textContent()) === '类型 · 全部', 'Reopening conversation history clears hidden type filters');
  await page.keyboard.press('Escape');

  await page.locator('#composer-input').fill('[[');
  check(await page.locator('#vault-document-picker-layer.is-open').count() === 1, 'Double-bracket input opens the independent Vault document picker');
  const vaultPickerText = await page.locator('#vault-document-picker').textContent();
  check(vaultPickerText.includes('不代表 Quick Search 界面'), 'Vault document picker explicitly avoids claiming native Quick Search fidelity', vaultPickerText);
  check(await page.locator('#vault-document-picker [data-search-mode], #vault-document-picker [data-conversation-result]').count() === 0, 'Vault document picker does not mix native search modes or conversation results');
  await page.locator('#vault-document-picker-input').fill('interview-story');
  check(await page.locator('[data-vault-document="interview-story-bank.md"]').count() === 1, 'Vault document picker filters by document filename');
  await page.locator('[data-vault-document="interview-story-bank.md"]').click();
  check((await page.locator('#composer-input').inputValue()).includes('[[interview-story-bank.md]]'), 'Selecting a Vault document inserts a wikilink into Composer');
  check(await page.locator('#composer-context [data-remove-document]').count() === 1, 'Selected Vault document is represented as Composer context');
  check(await page.locator('#vault-document-picker-layer.is-open').count() === 0, 'Vault document picker closes after selection');

  await page.goto(`${base}/index.html#active`, { waitUntil: 'networkidle' });
  const disclosure = page.locator('[data-project-toggle="project-interview"]');
  await disclosure.click();
  check(await page.locator('#centre-panel').getAttribute('data-view') === 'active', 'Project disclosure only expands or collapses; it does not navigate');
  check(await disclosure.getAttribute('aria-expanded') === 'false', 'Project disclosure exposes its own expansion state');
  await page.locator('[data-project-open="project-interview"]').click();
  check(await page.locator('#centre-panel').getAttribute('data-view') === 'project', 'Project name opens the dedicated project home');
  check((await page.locator('#conversation-title').textContent()) === 'NZ Software Interview', 'Project home uses the project name as its page title');
  check(await page.locator('.project-stats > span').count() === 4, 'Project home summarizes conversations, messages, stars and resources');
  check(await page.locator('[data-project-action="edit"], .project-hero-actions:has-text("编辑说明")').count() === 0, 'Project home removes the low-value Edit description action');
  check(await page.locator('#studio.is-project-home').count() === 1, 'Project home declares a dedicated layout state');
  check(await page.locator('#right-panel').getAttribute('aria-hidden') === 'true', 'Project home removes the conversation-only right index from the accessibility tree');
  check(await page.locator('#right-panel').evaluate((node) => getComputedStyle(node).visibility) === 'hidden', 'Project home does not duplicate project collections in the right column');
  check(await page.locator('#right-splitter').getAttribute('tabindex') === '-1', 'Hidden project right splitter is not keyboard focusable');
  check(await page.locator('#project-composer-slot > .composer-wrap #composer').count() === 1, 'Project home reuses the single Composer inside the project content flow');
  const projectComposerOrder = await page.evaluate(() => {
    const stats = document.querySelector('.project-stats').getBoundingClientRect();
    const composer = document.getElementById('composer').getBoundingClientRect();
    const tabs = document.querySelector('.project-page-tabs').getBoundingClientRect();
    return { statsBottom: stats.bottom, composerTop: composer.top, composerBottom: composer.bottom, tabsTop: tabs.top };
  });
  check(projectComposerOrder.statsBottom <= projectComposerOrder.composerTop && projectComposerOrder.composerBottom <= projectComposerOrder.tabsTop, 'Project Composer sits after project identity and before project collections', JSON.stringify(projectComposerOrder));
  check((await page.locator('#composer-context').textContent()).includes('项目 · NZ Software Interview'), 'Project home keeps a project-scoped Composer available');
  check(await page.locator('#composer-context .context-chip').count() === 1, 'Project home clears conversation-scoped temporary chips');
  check((await page.locator('#composer-input').inputValue()) === '', 'Project home starts with a clean project-scoped draft');
  check((await page.locator('#project-start-greeting').textContent()) === '今天想在这个项目里推进什么？', 'Project home shares the concise start-state mental model');
  check(await page.locator('.project-chat-starters [data-start-prompt]').count() === 3, 'Project home offers three project-scoped starting points');
  await page.locator('.project-chat-starters [data-start-prompt]').first().click();
  check((await page.locator('#composer-input').inputValue()).includes('NZ Software Interview'), 'Project starting point fills an editable project-scoped prompt');
  check(await page.locator('.project-start-surface.has-draft').count() === 1, 'Project starting points recede after the user has a draft');
  check(await page.locator('#centre-panel').getAttribute('data-view') === 'project', 'Project starting point never auto-sends');
  await page.locator('#composer-input').fill('');
  const initialProjectDescription = await page.locator('[data-project-description-edit] > span').first().textContent();
  await page.locator('[data-project-description-edit]').click();
  check(await page.locator('[data-project-description-input]').count() === 1, 'Project description edits in place instead of reopening a hero action');
  check(await page.locator('[data-project-description-ai]').count() === 1, 'Project description editor offers an explicit AI rewrite action');
  await page.locator('[data-project-description-ai]').click();
  check((await page.locator('#project-description-status').textContent()).includes('正在'), 'AI description rewrite exposes a generating state');
  await page.waitForTimeout(620);
  check((await page.locator('[data-project-description-input]').inputValue()) !== initialProjectDescription, 'AI description rewrite produces an editable draft');
  check((await page.locator('#project-description-status').textContent()).includes('保存前不会覆盖'), 'AI description draft requires an explicit human save');
  await page.screenshot({ path: path.join(directory, 'preview-project-description-edit.png') });
  await page.locator('[data-project-description-cancel]').click();
  check((await page.locator('[data-project-description-edit] > span').first().textContent()) === initialProjectDescription, 'Cancelling an AI draft preserves the saved project description');
  await page.locator('[data-project-description-edit]').click();
  const editedProjectDescription = '整理 Vault 中可验证的项目证据，形成可检索、可追问、可复述的面试材料。';
  await page.locator('[data-project-description-input]').fill(editedProjectDescription);
  await page.locator('[data-project-description-save]').click();
  check((await page.locator('[data-project-description-edit] > span').first().textContent()) === editedProjectDescription, 'Human-edited project description is saved back to the hero');
  check(await page.locator('#header-open-source:visible, #regenerate-title:visible').count() === 0, 'Project home removes conversation-only header actions');
  await page.locator('[data-project-tab="resources"]').click();
  check(await page.locator('.project-resource-row').count() === 5, 'Project Resources tab exposes the project knowledge set');
  await page.locator('[data-project-tab="plans"]').click();
  check(await page.locator('.project-plan-row').count() === 3, 'Project Plans tab separates persistent project work from one-turn agent steps');
  await page.locator('[data-project-tab="conversations"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(directory, 'preview-project-home.png') });
  await page.locator('[data-project-conversation="conversation-story"]').click();
  check(await page.locator('#centre-panel').getAttribute('data-view') === 'active', 'Project conversation opens back into the standard chat view');
  check(await page.locator('#right-panel').getAttribute('aria-hidden') === 'false', 'Opening a project conversation restores its conversation index');
  check(await page.locator('#right-panel').evaluate((node) => getComputedStyle(node).visibility) === 'visible', 'Conversation right column returns after leaving project home');
  const activeComposerPlacement = await page.evaluate(() => {
    const wrap = document.querySelector('.composer-wrap');
    return { parent: wrap.parentElement?.id, previous: wrap.previousElementSibling?.id };
  });
  check(activeComposerPlacement.parent === 'centre-panel' && activeComposerPlacement.previous === 'conversation-body', 'Active conversation restores Composer below the message canvas', JSON.stringify(activeComposerPlacement));

  check(await page.locator('.suggestion-chip').count() === 2, 'Suggested next keeps only two high-confidence choices inline');
  await page.locator('.suggestion-chip').first().click();
  check((await page.locator('#composer-input').inputValue()).includes('性能优化'), 'Inline suggestion fills the main Composer without auto-sending');
  await page.locator('#composer-input').fill('');
  await page.locator('[data-suggestion-menu]').click();
  const suggestedMenuText = await page.locator('.suggested-next-menu').textContent();
  check(suggestedMenuText.includes('只显示证据最完整的三段经历') && suggestedMenuText.includes('改写得更简洁') && suggestedMenuText.includes('自定义追问'), 'Suggested next overflow combines extra follow-ups with answer-level actions', suggestedMenuText);
  await page.locator('[data-suggested-action="custom"]').click();
  check(await page.locator('#composer-context .is-reply').count() === 1, 'Custom suggested follow-up reuses the main Composer reply anchor');

  await page.locator('#new-thread').click();
  check(await page.locator('#centre-panel').getAttribute('data-view') === 'new', 'New conversation enters the dedicated empty state');
  check(await page.locator('#composer-context .context-chip').count() === 0, 'New conversation does not carry a stale document chip');
  check((await page.locator('#new-chat-greeting').textContent()) === '今天想推进什么？', 'New conversation opens with one concise knowledge-work greeting');
  check(await page.locator('.new-chat-starters [data-start-prompt]').count() === 3, 'New conversation offers three restrained high-value starting points');
  check(await page.locator('#new-composer-slot > .composer-wrap #composer').count() === 1, 'New conversation places the shared Composer inside the centred start surface');
  const newComposerPosition = await page.evaluate(() => {
    const centre = document.getElementById('centre-panel').getBoundingClientRect();
    const composer = document.getElementById('composer').getBoundingClientRect();
    return {
      centreHeight: centre.height,
      delta: Math.abs((composer.top + composer.height / 2) - (centre.top + centre.height / 2)),
      bodyDisplay: getComputedStyle(document.getElementById('conversation-body')).display
    };
  });
  check(newComposerPosition.bodyDisplay === 'block', 'New conversation uses the message canvas as a centred start surface', JSON.stringify(newComposerPosition));
  check(newComposerPosition.delta <= newComposerPosition.centreHeight * 0.16, 'New conversation places Composer near the visual centre', JSON.stringify(newComposerPosition));
  await page.locator('.new-chat-starters [data-start-prompt]').first().click();
  check((await page.locator('#composer-input').inputValue()) === '继续我最近在做的工作', 'Starting point fills the Composer with an editable prompt');
  check(await page.locator('.new-chat-start.has-draft').count() === 1, 'Starting suggestions recede once a draft exists');
  check(await page.locator('#centre-panel').getAttribute('data-view') === 'new', 'Starting point never auto-sends the message');
  await page.waitForTimeout(420);
  await page.screenshot({ path: path.join(directory, 'preview-new-chat-start.png') });

  const desktopOverflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  check(desktopOverflow.scroll <= desktopOverflow.width, 'Desktop mock has no horizontal page overflow', JSON.stringify(desktopOverflow));
  check(errors.length === 0, 'Desktop mock has no browser errors', errors.join(' | '));
  await page.close();
}

{
  const { page, errors } = await usePage({ width: 894, height: 835 });
  await page.goto(`${base}/index.html#active`, { waitUntil: 'networkidle' });
  const narrow = await page.evaluate(() => {
    const left = document.getElementById('left-panel').getBoundingClientRect();
    const centre = document.getElementById('centre-panel').getBoundingClientRect();
    const right = document.getElementById('right-panel').getBoundingClientRect();
    const send = document.getElementById('send-button').getBoundingClientRect();
    return { scroll: document.documentElement.scrollWidth, width: innerWidth, left: left.width, centre: centre.width, right: right.width, sendRight: send.right };
  });
  check(narrow.scroll <= narrow.width, '894px mock has no horizontal page overflow', JSON.stringify(narrow));
  check(narrow.left >= 199 && narrow.centre >= 439 && narrow.right >= 219, '894px mock preserves all three usable columns', JSON.stringify(narrow));
  check(narrow.sendRight <= narrow.width, '894px Composer send control remains visible', JSON.stringify(narrow));
  await page.screenshot({ path: path.join(directory, 'preview-gate2-narrow.png') });
  check(errors.length === 0, '894px mock has no browser errors', errors.join(' | '));
  await page.close();
}

{
  const { page, errors } = await usePage({ width: 1440, height: 920 });
  await page.goto(`${base}/composer-lab.html#model-list`, { waitUntil: 'networkidle' });
  check(await page.locator('#run-menu.is-open').count() === 1, 'Composer Lab exposes concrete model list state');
  await page.locator('#model-search').fill('gemini-2.0-flash-thinking');
  check((await page.locator('#run-menu .profile-label').allTextContents()).includes('Google · Research'), 'Composer Lab groups filtered models by Profile');
  check(await page.locator('#run-menu [data-model="gemini-2.0-flash-thinking"]').count() === 1, 'Composer Lab model picker searches exact model IDs');
  const labModelText = await page.locator('#run-menu [data-model="gemini-2.0-flash-thinking"]').textContent();
  check(labModelText.includes('Google') && labModelText.includes('输出 64K'), 'Composer Lab shows provider and declared capabilities for a model', labModelText);
  await page.locator('[data-model="gemini-2.0-flash-thinking"]').click();
  check((await page.locator('#model-label').textContent()) === 'Google · Research · Gemini 2.0 Flash Thinking', 'Composer Lab persists a Profile-qualified fixed model choice');
  await page.screenshot({ path: path.join(directory, 'preview-composer-v2.png') });

  await page.goto(`${base}/composer-lab.html#run-main`, { waitUntil: 'networkidle' });
  check(await page.locator('#run-menu [data-policy], #run-menu [data-run-policy], #run-menu .policy-grid, #run-menu [data-reasoning]').count() === 0, 'Composer Lab does not present fake performance presets or unwired reasoning controls');
  check(await page.getByRole('button', { name: /^(快速|平衡|最佳)$/ }).count() === 0, 'Composer Lab has no fake performance-preset buttons');

  await page.goto(`${base}/composer-lab.html#assistant-list`, { waitUntil: 'networkidle' });
  await page.locator('#assistant-search').fill('证据');
  check(await page.locator('#run-menu [data-assistant="evidence-coach"]').count() === 1, 'Composer Lab Assistant picker is searchable');
  check(await page.locator('#run-menu [data-assistant="architecture-reviewer"]').count() === 0, 'Composer Lab Assistant search filters unrelated entries');
  await page.locator('[data-assistant="evidence-coach"]').click();
  check((await page.locator('[data-assistant-indicator]').textContent()).includes('面试证据教练'), 'Composer Lab exposes the conversation-level Assistant selection');
  await page.locator('#plus-trigger').click();
  check(await page.locator('#plus-menu [data-open="command"]').count() === 0, 'Composer Lab keeps workflows out of the Add menu');

  await page.goto(`${base}/composer-lab.html#source-scope`, { waitUntil: 'networkidle' });
  await page.locator('#source-menu [data-source-toggle="vault"]').click();
  check(await page.locator('#source-menu.is-open').count() === 1, 'Composer Lab source menu stays open after enabling Vault Search');
  await page.locator('#source-menu [data-source-toggle="web"]').click();
  check(await page.locator('#source-menu.is-open').count() === 1, 'Composer Lab source menu stays open for combinable sources');
  check((await page.locator('#source-label').textContent()) === '项目上下文 + Vault + Web', 'Composer Lab combines project, Vault and Web without a mutually-exclusive mode');

  await page.goto(`${base}/composer-lab.html#empty`, { waitUntil: 'networkidle' });
  const labComposerPosition = await page.evaluate(() => {
    const stage = document.getElementById('lab-stage').getBoundingClientRect();
    const composer = document.querySelector('.composer-stage').getBoundingClientRect();
    return {
      stageHeight: stage.height,
      delta: Math.abs((composer.top + composer.height / 2) - (stage.top + stage.height / 2))
    };
  });
  check(labComposerPosition.delta <= labComposerPosition.stageHeight * 0.16, 'Composer Lab empty state keeps the input near the visual centre', JSON.stringify(labComposerPosition));

  await page.goto(`${base}/composer-lab.html#assistant-builder`, { waitUntil: 'networkidle' });
  check(await page.locator('#assistant-layer.is-open #builder-prompt').count() === 1, 'Assistant builder starts with one primary editable Prompt');
  check(await page.locator('#assistant-draft > label').count() === 0, 'Assistant builder removes the rigid five-field draft form');
  check(await page.locator('.assistant-advanced:not([open])').count() === 1, 'Knowledge, tools and default model remain collapsed optional settings');
  await page.locator('#generate-assistant').click();
  await page.waitForTimeout(760);
  check((await page.locator('#assistant-name').inputValue()) === '面试证据教练', 'AI Assistant builder generates an editable name and preview from the Prompt');
  check((await page.locator('#assistant-summary').inputValue()).includes('证据'), 'AI Assistant builder produces a concise editable behavior summary');
  check(await page.locator('#save-assistant').isEnabled(), 'Assistant draft requires an explicit Save action');
  await page.screenshot({ path: path.join(directory, 'preview-assistant-builder.png') });
  check(errors.length === 0, 'Composer Lab has no browser errors', errors.join(' | '));
  await page.close();
}

{
  const { page, errors } = await usePage({ width: 1440, height: 1000 });
  await page.goto(`${base}/product-strategy.html`, { waitUntil: 'networkidle' });
  check(await page.locator('.flow-node').count() === 5, 'Product report visualizes the full knowledge-work loop');
  check(await page.locator('.job-grid article').count() === 5, 'Product report records five core user jobs');
  await page.screenshot({ path: path.join(directory, 'preview-product-strategy.png') });
  check(errors.length === 0, 'Product strategy report has no browser errors', errors.join(' | '));
  await page.close();
}

await browser.close();

if (failures.length) {
  console.error(JSON.stringify({ passed: checks.length, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
