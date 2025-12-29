import React from "react";
import { Button } from "@/ui/component/shared-ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/component/shared-ui/collapsible";
import { ScrollArea } from "@/ui/component/shared-ui/scroll-area";
import { cn } from "@/ui/react/lib/utils";
import { ChevronDownIcon, PaperclipIcon } from "lucide-react";
import type { ComponentProps } from "react";

export type QueueMessagePart = {
  type: string;
  text?: string;
  url?: string;
  filename?: string;
  mediaType?: string;
};

export type QueueMessage = {
  id: string;
  parts: QueueMessagePart[];
};

export type QueueTodo = {
  id: string;
  title: string;
  description?: string;
  status?: "pending" | "completed";
};

export type QueueItemProps = ComponentProps<"li">;

export const QueueItem = ({ className, ...props }: QueueItemProps) => (
  <li
    className={cn(
      "pktw-group pktw-flex pktw-flex-col pktw-gap-1 pktw-rounded-md pktw-px-3 pktw-py-1 pktw-text-sm pktw-transition-colors hover:pktw-bg-muted",
      className
    )}
    {...props}
  />
);

export type QueueItemIndicatorProps = ComponentProps<"span"> & {
  completed?: boolean;
};

export const QueueItemIndicator = ({
  completed = false,
  className,
  ...props
}: QueueItemIndicatorProps) => (
  <span
    className={cn(
      "pktw-mt-0.5 pktw-inline-pktw-block pktw-size-2.5 pktw-rounded-full pktw-border",
      completed
        ? "pktw-border-muted-foreground/20 pktw-bg-muted-foreground/10"
        : "pktw-border-muted-foreground/50",
      className
    )}
    {...props}
  />
);

export type QueueItemContentProps = ComponentProps<"span"> & {
  completed?: boolean;
};

export const QueueItemContent = ({
  completed = false,
  className,
  ...props
}: QueueItemContentProps) => (
  <span
    className={cn(
      "line-clamp-1 grow break-words",
      completed
        ? "pktw-text-muted-foreground/50 line-through"
        : "pktw-text-muted-foreground",
      className
    )}
    {...props}
  />
);

export type QueueItemDescriptionProps = ComponentProps<"div"> & {
  completed?: boolean;
};

export const QueueItemDescription = ({
  completed = false,
  className,
  ...props
}: QueueItemDescriptionProps) => (
  <div
    className={cn(
      "pktw-ml-6 pktw-text-xs",
      completed
        ? "pktw-text-muted-foreground/40 line-through"
        : "pktw-text-muted-foreground",
      className
    )}
    {...props}
  />
);

export type QueueItemActionsProps = ComponentProps<"div">;

export const QueueItemActions = ({
  className,
  ...props
}: QueueItemActionsProps) => (
  <div className={cn("pktw-flex pktw-gap-1", className)} {...props} />
);

export type QueueItemActionProps = Omit<
  ComponentProps<typeof Button>,
  "variant" | "size"
>;

export const QueueItemAction = ({
  className,
  ...props
}: QueueItemActionProps) => (
  <Button
    className={cn(
      "pktw-size-auto pktw-rounded pktw-p-1 pktw-text-muted-foreground pktw-opacity-0 pktw-transition-opacity hover:pktw-bg-muted-foreground/10 hover:pktw-text-foreground pktw-group-hover:pktw-opacity-100",
      className
    )}
    size="icon"
    type="button"
    variant="ghost"
    {...props}
  />
);

export type QueueItemAttachmentProps = ComponentProps<"div">;

export const QueueItemAttachment = ({
  className,
  ...props
}: QueueItemAttachmentProps) => (
  <div className={cn("pktw-mt-1 pktw-flex pktw-flex-wrap pktw-gap-2", className)} {...props} />
);

export type QueueItemImageProps = ComponentProps<"img">;

export const QueueItemImage = ({
  className,
  ...props
}: QueueItemImageProps) => (
  <img
    alt=""
    className={cn("pktw-h-8 pktw-w-8 pktw-rounded pktw-border object-cover", className)}
    height={32}
    width={32}
    {...props}
  />
);

export type QueueItemFileProps = ComponentProps<"span">;

export const QueueItemFile = ({
  children,
  className,
  ...props
}: QueueItemFileProps) => (
  <span
    className={cn(
      "pktw-flex pktw-items-center pktw-gap-1 pktw-rounded pktw-border pktw-bg-muted pktw-px-2 pktw-py-1 pktw-text-xs",
      className
    )}
    {...props}
  >
    <PaperclipIcon size={12} />
    <span className="pktw-max-w-[100px] truncate">{children}</span>
  </span>
);

export type QueueListProps = ComponentProps<typeof ScrollArea>;

export const QueueList = ({
  children,
  className,
  ...props
}: QueueListProps) => (
  <ScrollArea className={cn("-pktw-mb-1 pktw-mt-2", className)} {...props}>
    <div className="pktw-max-pktw-h-40 pr-4">
      <ul>{children}</ul>
    </div>
  </ScrollArea>
);

// QueueSection - collapsible section container
export type QueueSectionProps = ComponentProps<typeof Collapsible>;

export const QueueSection = ({
  className,
  defaultOpen = true,
  ...props
}: QueueSectionProps) => (
  <Collapsible className={cn(className)} defaultOpen={defaultOpen} {...props} />
);

// QueueSectionTrigger - section header/trigger
export type QueueSectionTriggerProps = ComponentProps<"button">;

export const QueueSectionTrigger = ({
  children,
  className,
  ...props
}: QueueSectionTriggerProps) => (
  <CollapsibleTrigger asChild>
    <button
      className={cn(
        "pktw-group pktw-flex pktw-w-full pktw-items-center pktw-justify-between pktw-rounded-md pktw-bg-muted/40 pktw-px-3 pktw-py-2 pktw-text-left pktw-font-medium pktw-text-muted-foreground pktw-text-sm pktw-transition-colors hover:pktw-bg-muted",
        className
      )}
      type="button"
      {...props}
    >
      {children}
    </button>
  </CollapsibleTrigger>
);

// QueueSectionLabel - label content with icon and count
export type QueueSectionLabelProps = ComponentProps<"span"> & {
  count?: number;
  label: string;
  icon?: React.ReactNode;
};

export const QueueSectionLabel = ({
  count,
  label,
  icon,
  className,
  ...props
}: QueueSectionLabelProps) => (
  <span className={cn("pktw-flex pktw-items-center pktw-gap-2", className)} {...props}>
    <ChevronDownIcon className="pktw-group-data-[state=closed]:-pktw-rotate-90 pktw-size-4 pktw-transition-transform" />
    {icon}
    <span>
      {count} {label}
    </span>
  </span>
);

// QueueSectionContent - collapsible content area
export type QueueSectionContentProps = ComponentProps<
  typeof CollapsibleContent
>;

export const QueueSectionContent = ({
  className,
  ...props
}: QueueSectionContentProps) => (
  <CollapsibleContent className={cn(className)} {...props} />
);

export type QueueProps = ComponentProps<"div">;

export const Queue = ({ className, ...props }: QueueProps) => (
  <div
    className={cn(
      "pktw-flex pktw-flex-col pktw-gap-2 pktw-rounded-xl pktw-border pktw-border-pktw-border pktw-bg-background pktw-px-3 pt-2 pb-2 pktw-shadow-xs",
      className
    )}
    {...props}
  />
);
