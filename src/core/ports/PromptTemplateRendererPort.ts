/**
 * Renders a caller-owned prompt template with declared runtime variables.
 *
 * The prompt owner (for example PromptService) owns Handlebars helpers,
 * compilation policy and cache lifetime. Consumers such as Copilot actions
 * only provide a template and its values; they must not hand-replace
 * `{{variable}}` tokens.
 */
export interface PromptTemplateRendererPort {
	render(template: string, variables: Record<string, unknown>): string;
}
