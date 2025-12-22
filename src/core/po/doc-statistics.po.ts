/**
 * Document statistics PO (Persistent Object).
 * Stores document statistics for ranking and boosting.
 */
export interface DocStatisticsPO {
	/**
	 * File path (primary key).
	 */
	path: string;
	/**
	 * Word count (language-specific calculation).
	 */
	word_count: number | null;
	/**
	 * Character count.
	 */
	char_count: number | null;
	/**
	 * Language code (e.g., 'en', 'zh', 'ja').
	 */
	language: string | null;
	/**
	 * Richness score (computed document importance indicator).
	 */
	richness_score: number | null;
	/**
	 * Last update time (timestamp).
	 */
	updated_at: number;
}

