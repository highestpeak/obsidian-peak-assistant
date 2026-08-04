import type { MyContentKind, MyContentSource } from '@/core/storage/generated-output';

export interface MyContentItem {
	readonly id: string;
	readonly path: string;
	readonly title: string;
	readonly typeLabel: string;
	readonly kind: MyContentKind;
	readonly source: MyContentSource;
	readonly createdAt: number;
	readonly updatedAt: number;
}

/** Read-only projection of explicitly saved Peak content. */
export interface MyContentPort {
	list(): Promise<readonly MyContentItem[]>;
	open(path: string): Promise<void>;
}
