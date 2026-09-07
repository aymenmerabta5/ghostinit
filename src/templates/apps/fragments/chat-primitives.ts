export interface ChatPrimitiveModuleContent {
  readonly path: string;
  readonly content: string;
}

function chatBarrelContent(): string {
  return `"use client";
export {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "./chat/scroller";
export type { MessageScrollerItemProps } from "./chat/scroller";
export {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageGroup,
  MessageHeader,
} from "./chat/message";
export type { MessageProps } from "./chat/message";
export { Bubble, BubbleContent } from "./chat/bubble";
export type { BubbleProps } from "./chat/bubble";
export {
  Attachment,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "./chat/attachment";
export type { AttachmentProps } from "./chat/attachment";
export { Marker, MarkerContent } from "./chat/marker";
export type { MarkerProps } from "./chat/marker";
`;
}

function scrollerContent(
  utilitiesSpecifier: string,
  buttonSpecifier: string,
  translationSpecifier?: string,
): string {
  const translationImport = translationSpecifier
    ? `import { useSurfaceTranslations } from "${translationSpecifier}";`
    : "";
  const translationHook = translationSpecifier
    ? '  const t = useSurfaceTranslations("messaging");'
    : "";
  const jumpLabel = translationSpecifier ? '{t("jumpToLatest")}' : '"Jump to latest message"';
  return `"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "${buttonSpecifier}";
import { cn } from "${utilitiesSpecifier}";
${translationImport}

const MessageScrollerContext = React.createContext<React.RefObject<HTMLDivElement | null> | null>(null);

export function MessageScrollerProvider({ autoScroll = false, children }: { autoScroll?: boolean; children: React.ReactNode }): React.JSX.Element {
  const viewportRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (autoScroll) viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight });
  }, [autoScroll, children]);
  return <MessageScrollerContext.Provider value={viewportRef}>{children}</MessageScrollerContext.Provider>;
}

export const MessageScroller = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="message-scroller" className={cn("relative flex min-h-0 flex-1 flex-col", className)} {...props} />,
);
MessageScroller.displayName = "MessageScroller";

export const MessageScrollerViewport = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, forwardedRef) => {
    const viewportRef = React.useContext(MessageScrollerContext);
    const ref = React.useCallback((node: HTMLDivElement | null) => {
      if (viewportRef) viewportRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }, [forwardedRef, viewportRef]);
    return <div ref={ref} data-slot="message-scroller-viewport" className={cn("scroll-fade min-h-0 flex-1 overflow-y-auto", className)} {...props} />;
  },
);
MessageScrollerViewport.displayName = "MessageScrollerViewport";

export const MessageScrollerContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="message-scroller-content" className={cn("flex flex-col gap-3 p-3", className)} {...props} />,
);
MessageScrollerContent.displayName = "MessageScrollerContent";

export interface MessageScrollerItemProps extends React.HTMLAttributes<HTMLDivElement> {
  messageId: string;
  scrollAnchor?: boolean;
}
export const MessageScrollerItem = React.forwardRef<HTMLDivElement, MessageScrollerItemProps>(
  ({ className, messageId, scrollAnchor, ...props }, ref) => <div ref={ref} data-message-id={messageId} data-scroll-anchor={scrollAnchor || undefined} className={className} {...props} />,
);
MessageScrollerItem.displayName = "MessageScrollerItem";

export function MessageScrollerButton(): React.JSX.Element {
  const viewportRef = React.useContext(MessageScrollerContext);
${translationHook}
  return <Button type="button" size="icon" variant="outline" aria-label=${jumpLabel} className="absolute bottom-3 end-3" onClick={() => viewportRef?.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: "smooth" })}><ChevronDown aria-hidden /></Button>;
}
`;
}

function messageContent(utilitiesSpecifier: string): string {
  return `"use client";
import * as React from "react";
import { cn } from "${utilitiesSpecifier}";

export const MessageGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="message-group" className={cn("flex flex-col gap-2", className)} {...props} />,
);
MessageGroup.displayName = "MessageGroup";

export interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end";
}
export const Message = React.forwardRef<HTMLDivElement, MessageProps>(
  ({ align = "start", className, ...props }, ref) => <div ref={ref} data-slot="message" data-align={align} className={cn("flex w-full gap-3", align === "end" && "justify-end", className)} {...props} />,
);
Message.displayName = "Message";

export const MessageAvatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} data-slot="message-avatar" {...props} />,
);
MessageAvatar.displayName = "MessageAvatar";

export const MessageContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="message-content" className={cn("flex max-w-[80%] flex-col gap-1", className)} {...props} />,
);
MessageContent.displayName = "MessageContent";

export const MessageHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="message-header" className={cn("text-xs text-muted-foreground", className)} {...props} />,
);
MessageHeader.displayName = "MessageHeader";

export const MessageFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="message-footer" className={cn("text-xs text-muted-foreground", className)} {...props} />,
);
MessageFooter.displayName = "MessageFooter";
`;
}

function bubbleContent(utilitiesSpecifier: string): string {
  return `"use client";
import * as React from "react";
import { cn } from "${utilitiesSpecifier}";

const bubbleVariants = { default: "bg-primary text-primary-foreground", secondary: "bg-secondary text-secondary-foreground", muted: "bg-muted text-foreground", tinted: "bg-accent text-accent-foreground", outline: "border bg-background", ghost: "bg-transparent", destructive: "bg-destructive text-destructive-foreground" } as const;

export interface BubbleProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof bubbleVariants;
  align?: "start" | "end";
}
export const Bubble = React.forwardRef<HTMLDivElement, BubbleProps>(
  ({ variant = "muted", align = "start", className, ...props }, ref) => <div ref={ref} data-slot="bubble" data-align={align} className={cn("w-fit max-w-full rounded-xl px-3 py-2 text-sm", bubbleVariants[variant], align === "end" && "ms-auto", className)} {...props} />,
);
Bubble.displayName = "Bubble";

export const BubbleContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="bubble-content" className={cn("whitespace-pre-wrap", className)} {...props} />,
);
BubbleContent.displayName = "BubbleContent";
`;
}

function attachmentContent(utilitiesSpecifier: string): string {
  return `"use client";
import * as React from "react";
import { cn } from "${utilitiesSpecifier}";

export interface AttachmentProps extends React.HTMLAttributes<HTMLDivElement> {
  state?: "idle" | "uploading" | "processing" | "error" | "done";
}
export const AttachmentGroup = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="attachment-group" className={cn("flex flex-wrap gap-2", className)} {...props} />,
);
AttachmentGroup.displayName = "AttachmentGroup";

export const Attachment = React.forwardRef<HTMLDivElement, AttachmentProps>(
  ({ state = "idle", className, ...props }, ref) => <div ref={ref} data-slot="attachment" data-state={state} className={cn("flex items-center gap-3 rounded-lg border p-3", className)} {...props} />,
);
Attachment.displayName = "Attachment";

export const AttachmentMedia = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="attachment-media" className={cn("shrink-0", className)} {...props} />,
);
AttachmentMedia.displayName = "AttachmentMedia";

export const AttachmentContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="attachment-content" className={cn("min-w-0 flex-1", className)} {...props} />,
);
AttachmentContent.displayName = "AttachmentContent";

export const AttachmentTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="attachment-title" className={cn("truncate text-sm font-medium", className)} {...props} />,
);
AttachmentTitle.displayName = "AttachmentTitle";

export const AttachmentDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="attachment-description" className={cn("text-xs text-muted-foreground", className)} {...props} />,
);
AttachmentDescription.displayName = "AttachmentDescription";

export const AttachmentActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} data-slot="attachment-actions" className={cn("flex items-center gap-1", className)} {...props} />,
);
AttachmentActions.displayName = "AttachmentActions";
`;
}

function markerContent(utilitiesSpecifier: string): string {
  return `"use client";
import * as React from "react";
import { cn } from "${utilitiesSpecifier}";

export interface MarkerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "separator" | "border";
}
export const Marker = React.forwardRef<HTMLDivElement, MarkerProps>(
  ({ variant = "default", className, ...props }, ref) => <div ref={ref} data-slot="marker" data-variant={variant} className={cn("flex items-center justify-center gap-3 py-2 text-xs text-muted-foreground", variant === "separator" && "before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border", variant === "border" && "border-b", className)} {...props} />,
);
Marker.displayName = "Marker";

export const MarkerContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div ref={ref} data-slot="marker-content" {...props} />,
);
MarkerContent.displayName = "MarkerContent";
`;
}

export function chatPrimitiveModuleContents(
  utilitiesSpecifier: string,
  buttonSpecifier = "../button",
  translationSpecifier?: string,
): ChatPrimitiveModuleContent[] {
  return [
    { path: "chat.tsx", content: chatBarrelContent() },
    {
      path: "chat/scroller.tsx",
      content: scrollerContent(utilitiesSpecifier, buttonSpecifier, translationSpecifier),
    },
    { path: "chat/message.tsx", content: messageContent(utilitiesSpecifier) },
    { path: "chat/bubble.tsx", content: bubbleContent(utilitiesSpecifier) },
    { path: "chat/attachment.tsx", content: attachmentContent(utilitiesSpecifier) },
    { path: "chat/marker.tsx", content: markerContent(utilitiesSpecifier) },
  ];
}

export function chatPrimitivesContent(
  utilitiesSpecifier: string,
  buttonSpecifier = "../button",
): string {
  return chatPrimitiveModuleContents(utilitiesSpecifier, buttonSpecifier)[0]?.content ?? "";
}
