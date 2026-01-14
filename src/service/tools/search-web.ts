import { chromium, type Browser, type Page } from 'playwright';
import { z } from 'zod';
import { AgentTool, safeAgentTool } from './types';
import { MultiProviderChatService } from '@/core/providers/MultiProviderChatService';
import { PROVIDER_ID_PERPLEXITY } from '@/core/providers/base/perplexity';
import { AppContext } from '@/app/context/AppContext';
import { BusinessError } from '@/core/errors';
import { ErrorCode } from '@/core/errors';

/**
 * Google search result item
 */
interface GoogleSearchResult {
	title: string;
	url: string;
	snippet: string;
}

/**
 * Google search response
 */
interface GoogleSearchResponse {
	query: string;
	results: GoogleSearchResult[];
	totalResults?: string;
	searchTime?: string;
}

/**
 * Google Search Tool using Playwright
 * 
 * Performs web scraping of Google search results using headless browser.
 */
class GoogleSearchTool {
	private browser: Browser | null = null;

	/**
	 * Initialize browser instance
	 */
	private async getBrowser(): Promise<Browser> {
		if (!this.browser) {
			this.browser = await chromium.launch({
				headless: true,
			});
		}
		return this.browser;
	}

	/**
	 * Close browser instance
	 */
	async close(): Promise<void> {
		if (this.browser) {
			await this.browser.close();
			this.browser = null;
		}
	}

	/**
	 * Search Google and extract results
	 * 
	 * @param query - Search query string
	 * @param maxResults - Maximum number of results to return (default: 10)
	 * @returns Search results with titles, URLs, and snippets
	 */
	async search(query: string, maxResults: number = 10): Promise<GoogleSearchResponse> {
		const browser = await this.getBrowser();
		const page = await browser.newPage();

		try {
			// Navigate to Google search
			const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
			await page.goto(searchUrl, {
				waitUntil: 'domcontentloaded',
			});

			// Wait for search results to load
			await page.waitForSelector('div#search', { timeout: 10000 });

			// Extract search results
			const results = await this.extractSearchResults(page, maxResults);

			// Extract total results count if available
			const totalResults = await this.extractTotalResults(page);
			const searchTime = await this.extractSearchTime(page);

			return {
				query,
				results,
				totalResults,
				searchTime,
			};
		} catch (error) {
			console.error('[GoogleSearchTool] Search failed:', error);
			throw new Error(`Google search failed: ${error instanceof Error ? error.message : String(error)}`);
		} finally {
			await page.close();
		}
	}

	/**
	 * Extract search results from the page
	 */
	private async extractSearchResults(page: Page, maxResults: number): Promise<GoogleSearchResult[]> {
		const results: GoogleSearchResult[] = [];

		// Try to find result containers
		// Google search results are typically in div.g or div[data-ved]
		const resultSelectors = [
			'div.g',
			'div[data-ved]',
			'div.tF2Cxc',
		];

		for (const selector of resultSelectors) {
			const elements = await page.$$(selector);
			if (elements.length > 0) {
				for (const element of elements.slice(0, maxResults)) {
					try {
						const result = await this.extractResultFromElement(element);
						if (result && result.title && result.url) {
							results.push(result);
							if (results.length >= maxResults) {
								break;
							}
						}
					} catch (error) {
						console.warn('[GoogleSearchTool] Failed to extract result:', error);
					}
				}
				if (results.length > 0) {
					break;
				}
			}
		}

		// Fallback: try to extract from common result structure
		if (results.length === 0) {
			const titleElements = await page.$$('h3');
			for (let i = 0; i < Math.min(titleElements.length, maxResults); i++) {
				try {
					const titleEl = titleElements[i];
					if (!titleEl) continue;

					const title = await titleEl.textContent() || '';

					// Find parent container
					const parent = await titleEl.evaluateHandle((el) => el.closest('div.g, div[data-ved], a'));
					if (parent) {
						const linkEl = await parent.asElement()?.$('a[href]');
						if (linkEl) {
							const url = await linkEl.getAttribute('href') || '';
							const snippetEl = await parent.asElement()?.$('span, div[style*="line-height"]');
							const snippet = snippetEl ? (await snippetEl.textContent() || '').trim() : '';

							if (title && url) {
								results.push({
									title: title.trim(),
									url: this.normalizeUrl(url),
									snippet: snippet.slice(0, 200),
								});
							}
						}
					}
				} catch (error) {
					console.warn('[GoogleSearchTool] Failed to extract result from fallback:', error);
				}
			}
		}

		return results;
	}

	/**
	 * Extract result data from a single result element
	 */
	private async extractResultFromElement(element: any): Promise<GoogleSearchResult | null> {
		try {
			// Extract title (usually in h3)
			const titleEl = await element.$('h3, a h3');
			const title = titleEl ? (await titleEl.textContent() || '').trim() : '';

			// Extract URL (usually in a[href])
			const linkEl = await element.$('a[href]');
			if (!linkEl) return null;

			const href = await linkEl.getAttribute('href') || '';
			const url = this.normalizeUrl(href);

			// Extract snippet (usually in span or div with specific classes)
			const snippetSelectors = [
				'span[style*="line-height"]',
				'div[style*="line-height"]',
				'.VwiC3b',
				'.s',
				'div > span',
			];

			let snippet = '';
			for (const selector of snippetSelectors) {
				const snippetEl = await element.$(selector);
				if (snippetEl) {
					snippet = (await snippetEl.textContent() || '').trim();
					if (snippet.length > 20) {
						break;
					}
				}
			}

			if (!title || !url) {
				return null;
			}

			return {
				title,
				url,
				snippet: snippet.slice(0, 300),
			};
		} catch (error) {
			console.warn('[GoogleSearchTool] Error extracting result:', error);
			return null;
		}
	}

	/**
	 * Normalize Google search result URL
	 * Handles Google redirect URLs (/url?q=...)
	 */
	private normalizeUrl(url: string): string {
		try {
			// Handle Google redirect URLs
			if (url.startsWith('/url?q=')) {
				const match = url.match(/\/url\?q=([^&]+)/);
				if (match) {
					return decodeURIComponent(match[1]);
				}
			}
			// Handle full URLs
			if (url.startsWith('http://') || url.startsWith('https://')) {
				return url;
			}
			// Handle relative URLs
			if (url.startsWith('/')) {
				return `https://www.google.com${url}`;
			}
			return url;
		} catch {
			return url;
		}
	}

	/**
	 * Extract total results count from page
	 */
	private async extractTotalResults(page: Page): Promise<string | undefined> {
		try {
			const resultStats = await page.$('#result-stats');
			if (resultStats) {
				const text = await resultStats.textContent();
				return text?.trim();
			}
		} catch (error) {
			console.warn('[GoogleSearchTool] Failed to extract total results:', error);
		}
		return undefined;
	}

	/**
	 * Extract search time from page
	 */
	private async extractSearchTime(page: Page): Promise<string | undefined> {
		try {
			const resultStats = await page.$('#result-stats');
			if (resultStats) {
				const text = await resultStats.textContent();
				// Extract time like "(0.45 seconds)"
				const timeMatch = text?.match(/\(([^)]+)\)/);
				if (timeMatch) {
					return timeMatch[1];
				}
			}
		} catch (error) {
			console.warn('[GoogleSearchTool] Failed to extract search time:', error);
		}
		return undefined;
	}

	/**
	 * Get full page content as markdown
	 * 
	 * @param query - Search query string
	 * @returns Markdown formatted search results
	 */
	async searchAsMarkdown(query: string): Promise<string> {
		const response = await this.search(query);

		let markdown = `# Google Search Results for: ${query}\n\n`;

		if (response.totalResults) {
			markdown += `**${response.totalResults}**\n\n`;
		}

		if (response.searchTime) {
			markdown += `Search time: ${response.searchTime}\n\n`;
		}

		markdown += `---\n\n`;

		for (let i = 0; i < response.results.length; i++) {
			const result = response.results[i];
			markdown += `## ${i + 1}. ${result.title}\n\n`;
			markdown += `**URL:** ${result.url}\n\n`;
			if (result.snippet) {
				markdown += `${result.snippet}\n\n`;
			}
			markdown += `---\n\n`;
		}

		return markdown;
	}
}

export function localWebSearchTool(): AgentTool {
	return safeAgentTool({
		description: 'Search web using local chromium browser',
		inputSchema: z.object({
			query: z.string().describe('The search query'),
			limit: z.number()
				.int()
				.positive()
				.max(50, 'Maximum number of results is 50')
				.default(10)
				.describe('Maximum number of results to return')
				.optional(),
		}),
		execute: async ({ query, limit }) => {
			const response = await new GoogleSearchTool().search(query, limit);
			return {
				query: query,
				results: response.results.map(result => ({
					title: result.title,
					url: result.url,
					snippet: result.snippet,
				})),
				totalResults: response.totalResults,
				searchTime: response.searchTime,
			};
		},
	});
}

// todo safe wrap execute to limit timeout and retry
export function perplexityWebSearchTool(): AgentTool {
	const perplexitySearchModel = AppContext.getInstance().settings.search.perplexitySearchModel;
	if (!perplexitySearchModel) {
		throw new BusinessError(
			ErrorCode.CONFIGURATION_MISSING,
			'Perplexity model for search is not configured, please check your settings.'
		);
	}

	return safeAgentTool({
		description: 'Search web using perplexity',
		inputSchema: z.object({
			query: z.string().describe('The search query'),
		}),
		execute: async ({ query }) => {
			const start = Date.now();
			const response = await MultiProviderChatService.getInstance()
				.getProviderService(PROVIDER_ID_PERPLEXITY)
				.blockChat({
					provider: PROVIDER_ID_PERPLEXITY,
					model: perplexitySearchModel,
					messages: [
						{
							role: 'user',
							content: [{
								type: 'text',
								text: `${query}`,
							}],
						},
					],
				});
			const textResults = []
			for (const result of response.content) {
				if (result.type === 'text') {
					textResults.push(result);
				} else {
					console.warn(`[PerplexityWebSearchTool] Unsupported result type: ${result.type}`);
				}
			}
			const end = Date.now();
			const durationMs = end - start;
			return {
				query: query,
				// it is not necessary to have the same result format as local web search tool. LLM is a language model, they can understand.
				results: textResults,
				searchTime: durationMs,
			};
		},
	});
}
