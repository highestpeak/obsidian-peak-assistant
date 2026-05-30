import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';

export interface RowProps extends React.HTMLAttributes<HTMLDivElement> {
	compact?: boolean;
	disclosure?: boolean;
}

/** Settings/onboarding row container — applies `.pk-row` + variant modifiers. */
const RowRoot = React.forwardRef<HTMLDivElement, RowProps>(
	({ className, compact, disclosure, ...props }, ref) => (
		<div
			ref={ref}
			className={cn(
				'pk-row',
				compact && 'pk-row--compact',
				disclosure && 'pk-row--disclosure',
				className
			)}
			{...props}
		/>
	)
);
RowRoot.displayName = 'Row';

const RowIcon = React.forwardRef<
	HTMLSpanElement,
	React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
	<span ref={ref} className={cn('pk-row__icon', className)} {...props} />
));
RowIcon.displayName = 'Row.Icon';

const RowBody = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div ref={ref} className={cn('pk-row__body', className)} {...props} />
));
RowBody.displayName = 'Row.Body';

const RowTitle = React.forwardRef<
	HTMLSpanElement,
	React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
	<span ref={ref} className={cn('pk-row__title', className)} {...props} />
));
RowTitle.displayName = 'Row.Title';

const RowDesc = React.forwardRef<
	HTMLSpanElement,
	React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
	<span ref={ref} className={cn('pk-row__desc', className)} {...props} />
));
RowDesc.displayName = 'Row.Desc';

const RowMeta = React.forwardRef<
	HTMLSpanElement,
	React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => (
	<span ref={ref} className={cn('pk-row__meta', className)} {...props} />
));
RowMeta.displayName = 'Row.Meta';

const RowRight = React.forwardRef<
	HTMLDivElement,
	React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
	<div ref={ref} className={cn('pk-row__right', className)} {...props} />
));
RowRight.displayName = 'Row.Right';

export interface RowValueProps extends React.HTMLAttributes<HTMLSpanElement> {
	/** Use sans-serif (default is mono per design). */
	sans?: boolean;
}

const RowValue = React.forwardRef<HTMLSpanElement, RowValueProps>(
	({ className, sans, ...props }, ref) => (
		<span
			ref={ref}
			className={cn(
				'pk-row__value',
				sans && 'pk-row__value--sans',
				className
			)}
			{...props}
		/>
	)
);
RowValue.displayName = 'Row.Value';

export const Row = Object.assign(RowRoot, {
	Icon: RowIcon,
	Body: RowBody,
	Title: RowTitle,
	Desc: RowDesc,
	Meta: RowMeta,
	Right: RowRight,
	Value: RowValue,
});
