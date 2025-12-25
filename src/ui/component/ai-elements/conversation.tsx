
import React, { useCallback } from "react";
import type { ComponentProps } from "react";
import { Button } from "@/ui/component/shared-ui/button";
import { cn } from "@/ui/react/lib/utils";
import { ArrowDownIcon } from "lucide-react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export type ConversationProps = ComponentProps<typeof StickToBottom>;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("pktw-relative pktw-flex-1 pktw-overflow-y-hidden", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);

export type ConversationContentProps = ComponentProps<
  typeof StickToBottom.Content
>;

export const ConversationContent = ({
  className,
  ...props
}: ConversationContentProps) => (
  <StickToBottom.Content
    className={cn("pktw-flex pktw-flex-col pktw-gap-8 pktw-p-4", className)}
    {...props}
  />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "pktw-flex pktw-size-full pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-3 pktw-p-8 pktw-text-center",
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="pktw-text-muted-foreground">{icon}</div>}
        <div className="pktw-space-y-1">
          <h3 className="pktw-font-medium pktw-text-sm">{title}</h3>
          {description && (
            <p className="pktw-text-muted-foreground pktw-text-sm">{description}</p>
          )}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button>;

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  return (
    !isAtBottom && (
      <Button
        className={cn(
          "pktw-absolute bottom-4 left-[50%] translate-x-[-50%] pktw-rounded-full",
          className
        )}
        onClick={handleScrollToBottom}
        size="icon"
        type="button"
        variant="outline"
        {...props}
      >
        <ArrowDownIcon className="pktw-size-4" />
      </Button>
    )
  );
};
