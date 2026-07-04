"use client";

import { type UIMessage } from "@tanstack/ai-react";
import {
  ActivityIcon,
  CircleAlertIcon,
  DatabaseIcon,
  EyeIcon,
  ImagesIcon,
  LoaderCircleIcon,
  SearchIcon,
  SendIcon,
  SquareIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Streamdown } from "streamdown";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Button } from "#/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";
import { Field, FieldError, FieldGroup } from "#/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "#/components/ui/input-group";
import { Marker, MarkerContent, MarkerIcon } from "#/components/ui/marker";
import { Message, MessageContent } from "#/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { useFacilityChat } from "#/hooks/use-chat";
import { cn } from "#/lib/utils";

type MessagePart = UIMessage["parts"][number];
type ToolCallPart = Extract<MessagePart, { type: "tool-call" }>;
type ThinkingPart = Extract<MessagePart, { type: "thinking" }>;

const SUGGESTED_QUESTIONS = [
  "What needs my attention right now?",
  "Summarize recent safety events",
  "Which sensors look unusual?",
];

const TOOL_PRESENTATION = {
  get_facility_overview: {
    activeLabel: "Reading facility overview",
    completeLabel: "Read facility overview",
    icon: DatabaseIcon,
  },
  search_facility_events: {
    activeLabel: "Searching facility events",
    completeLabel: "Searched facility events",
    icon: SearchIcon,
  },
  get_sensor_history: {
    activeLabel: "Reviewing sensor history",
    completeLabel: "Reviewed sensor history",
    icon: ActivityIcon,
  },
  list_facility_media: {
    activeLabel: "Finding facility media",
    completeLabel: "Found facility media",
    icon: ImagesIcon,
  },
  inspect_facility_media: {
    activeLabel: "Inspecting facility media",
    completeLabel: "Inspected facility media",
    icon: EyeIcon,
  },
} satisfies Record<
  string,
  {
    activeLabel: string;
    completeLabel: string;
    icon: React.ComponentType<React.ComponentProps<"svg">>;
  }
>;

function toolPresentation(name: string) {
  return (
    TOOL_PRESENTATION[name as keyof typeof TOOL_PRESENTATION] ?? {
      activeLabel: "Reviewing facility data",
      completeLabel: "Reviewed facility data",
      icon: SearchIcon,
    }
  );
}

function toolInput(part: ToolCallPart): Record<string, unknown> {
  if (part.input && typeof part.input === "object") return part.input as Record<string, unknown>;
  try {
    const parsed = JSON.parse(part.arguments) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function toolDetail(part: ToolCallPart): string | null {
  const input = toolInput(part);
  if (part.name === "search_facility_events") {
    const query = typeof input.query === "string" ? input.query : null;
    const severity = typeof input.severity === "string" ? input.severity : null;
    return [query ? `“${query}”` : null, severity ? `${severity} severity` : null].filter(Boolean).join(" · ") || null;
  }
  if (part.name === "get_sensor_history" && typeof input.deviceId === "string") {
    return `Device ${input.deviceId}`;
  }
  if (part.name === "inspect_facility_media") {
    return typeof input.question === "string" ? input.question : null;
  }
  return null;
}

function mergeAssistantMessages(messages: UIMessage[]): UIMessage[] {
  const grouped: UIMessage[] = [];
  for (const message of messages) {
    const previous = grouped.at(-1);
    if (message.role === "assistant" && previous?.role === "assistant") {
      grouped[grouped.length - 1] = {
        ...previous,
        id: `${previous.id}:${message.id}`,
        parts: [...previous.parts, ...message.parts],
      };
    } else {
      grouped.push(message);
    }
  }
  return grouped;
}

function ActivityDetails({
  messageId,
  thinkingParts,
  toolParts,
}: {
  messageId: string;
  thinkingParts: ThinkingPart[];
  toolParts: ToolCallPart[];
}) {
  return (
    <div className="border-border ml-2 flex flex-col gap-4 border-l pl-4">
      {thinkingParts.length > 0 ? (
        <div className="text-muted-foreground flex flex-col gap-2 text-xs leading-relaxed">
          {thinkingParts.map((part, index) => (
            <div className="whitespace-pre-wrap" key={`${messageId}-thinking-${index}`}>
              <Streamdown>{part.content || "Reasoning through the facility data…"}</Streamdown>
            </div>
          ))}
        </div>
      ) : null}
      {toolParts.length > 0 ? (
        <div className="flex flex-col gap-3">
          {toolParts.map((part) => {
            const presentation = toolPresentation(part.name);
            const Icon = presentation.icon;
            const complete = part.state === "complete";
            const failed = part.state === "error";
            const detail = toolDetail(part);
            return (
              <Marker className="items-start text-xs" key={part.id}>
                <MarkerIcon>
                  {failed ? (
                    <CircleAlertIcon className="text-destructive" />
                  ) : complete ? (
                    <Icon />
                  ) : (
                    <LoaderCircleIcon className="animate-spin" />
                  )}
                </MarkerIcon>
                <MarkerContent className="flex flex-col gap-0.5">
                  <span>{complete ? presentation.completeLabel : presentation.activeLabel}</span>
                  {detail ? <span className="text-muted-foreground/70 line-clamp-2">{detail}</span> : null}
                </MarkerContent>
              </Marker>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function AssistantActivity({
  messageId,
  thinkingParts,
  toolParts,
  isWorking,
}: {
  messageId: string;
  thinkingParts: ThinkingPart[];
  toolParts: ToolCallPart[];
  isWorking: boolean;
}) {
  if (thinkingParts.length === 0 && toolParts.length === 0) return null;

  const activeTool = toolParts
    .slice()
    .reverse()
    .find((part: ToolCallPart) => part.state !== "complete" && part.state !== "error");
  const failed = toolParts.some((part) => part.state === "error");
  const lastTool = toolParts.at(-1);
  const summary = activeTool
    ? toolPresentation(activeTool.name).activeLabel
    : failed
      ? "Finished with some unavailable data"
      : toolParts.length > 1
        ? "Reviewed facility data"
        : lastTool
          ? toolPresentation(lastTool.name).completeLabel
          : "Reasoned about your request";
  const active = Boolean(activeTool) || isWorking;

  if (active) {
    return (
      <div className="flex max-w-xl flex-col gap-3 py-1">
        <Marker>
          <MarkerIcon>
            <LoaderCircleIcon className="animate-spin" />
          </MarkerIcon>
          <MarkerContent>
            <span className="shimmer">{summary}</span>
          </MarkerContent>
        </Marker>
        <ActivityDetails messageId={messageId} thinkingParts={thinkingParts} toolParts={toolParts} />
      </div>
    );
  }

  return (
    <Accordion className="max-w-xl" collapsible type="single">
      <AccordionItem className="border-0" value="activity">
        <AccordionTrigger className="text-muted-foreground py-1 text-sm font-normal hover:no-underline">
          {summary}
        </AccordionTrigger>
        <AccordionContent className="pt-3 pb-1">
          <ActivityDetails messageId={messageId} thinkingParts={thinkingParts} toolParts={toolParts} />
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function ChatMessage({ message, isLatest, isLoading }: { message: UIMessage; isLatest: boolean; isLoading: boolean }) {
  const isUser = message.role === "user";
  const textParts = message.parts.filter(
    (part): part is Extract<MessagePart, { type: "text" }> => part.type === "text",
  );
  const toolParts = message.parts.filter((part): part is ToolCallPart => part.type === "tool-call");
  const thinkingParts = message.parts.filter((part): part is ThinkingPart => part.type === "thinking");
  const hasVisibleContent =
    textParts.some((part) => part.content.trim()) || toolParts.length > 0 || thinkingParts.length > 0;

  if (!hasVisibleContent) return null;

  return (
    <Message align={isUser ? "end" : "start"} className="mx-auto max-w-3xl px-4">
      <MessageContent className={cn(isUser ? "max-w-[85%]" : "max-w-full", "gap-3")}>
        {!isUser ? (
          <AssistantActivity
            isWorking={isLatest && isLoading && !textParts.some((part) => part.content.trim())}
            messageId={message.id}
            thinkingParts={thinkingParts}
            toolParts={toolParts}
          />
        ) : null}
        {textParts.map((part, index) => {
          if (!part.content.trim()) return null;
          if (isUser) {
            return (
              <Bubble align="end" key={`${message.id}-text-${index}`} variant="secondary">
                <BubbleContent className="whitespace-pre-wrap">{part.content}</BubbleContent>
              </Bubble>
            );
          }
          return (
            <Bubble key={`${message.id}-text-${index}`} variant="ghost">
              <BubbleContent className="prose prose-sm dark:prose-invert max-w-none text-[0.9375rem] leading-7">
                <Streamdown>{part.content}</Streamdown>
              </BubbleContent>
            </Bubble>
          );
        })}
      </MessageContent>
    </Message>
  );
}

export function ChatAssistant({
  facilityId,
  className,
  onClose,
  hideHeader,
}: {
  facilityId: string;
  className?: string;
  onClose?: () => void;
  hideHeader?: boolean;
}) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, isLoading, error, stop, clear } = useFacilityChat(facilityId);
  const groupedMessages = useMemo(() => mergeAssistantMessages(messages), [messages]);

  async function submit(question: string) {
    const value = question.trim();
    if (!value || isLoading) return;
    setInput("");
    await sendMessage(value);
  }

  return (
    <section
      aria-label="Chat assistant"
      className={cn("@container/chat bg-background flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      {!hideHeader ? (
        <header className="border-border flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium">Facility assistant</h2>
            <p className="text-muted-foreground truncate text-[11px]">Powered by Qwen</p>
          </div>
          {groupedMessages.length > 0 ? (
            <Button aria-label="Clear chat" onClick={clear} size="icon-sm" variant="ghost">
              <TrashIcon />
            </Button>
          ) : null}
          {onClose ? (
            <Button aria-label="Close chat" onClick={onClose} size="icon-sm" variant="ghost">
              <XIcon />
            </Button>
          ) : null}
        </header>
      ) : null}

      <div className="min-h-0 flex-1">
        {groupedMessages.length === 0 ? (
          <Empty className="mx-auto h-full max-w-3xl px-6">
            <EmptyHeader>
              <EmptyTitle className="text-xl">What would you like to know?</EmptyTitle>
              <EmptyDescription>
                Ask about this facility’s devices, events, sensors, recordings, or visual evidence.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="max-w-xl">
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((question) => (
                  <Button
                    className="h-auto px-3 py-2 text-left whitespace-normal"
                    key={question}
                    onClick={() => submit(question)}
                    size="sm"
                    variant="outline"
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </EmptyContent>
          </Empty>
        ) : (
          <MessageScrollerProvider autoScroll>
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent className="gap-8 py-6">
                  {groupedMessages.map((message, index) => (
                    <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
                      <ChatMessage
                        isLatest={index === groupedMessages.length - 1}
                        isLoading={isLoading}
                        message={message}
                      />
                    </MessageScrollerItem>
                  ))}
                  {isLoading && groupedMessages.at(-1)?.role === "user" ? (
                    <MessageScrollerItem messageId="chat-thinking">
                      <Message className="mx-auto max-w-3xl px-4" align="start">
                        <MessageContent>
                          <Marker>
                            <MarkerIcon>
                              <LoaderCircleIcon className="animate-spin" />
                            </MarkerIcon>
                            <MarkerContent>
                              <span className="shimmer">Thinking</span>
                            </MarkerContent>
                          </Marker>
                        </MessageContent>
                      </Message>
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </div>

      <form
        className="shrink-0 px-3 pt-2 pb-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(input);
        }}
      >
        <div className="mx-auto max-w-3xl">
          <FieldGroup className="gap-1.5">
            <Field>
              <InputGroup className="rounded-2xl">
                <InputGroupTextarea
                  aria-label="Ask about this facility"
                  autoComplete="off"
                  className="max-h-32 min-h-12 px-3 pt-3"
                  disabled={isLoading}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Ask anything about this facility"
                  rows={1}
                  value={input}
                />
                <InputGroupAddon align="block-end">
                  <span className="text-[10px] font-normal">Powered by Qwen</span>
                  <div className="ml-auto flex items-center gap-1">
                    {hideHeader && groupedMessages.length > 0 ? (
                      <InputGroupButton aria-label="Clear chat" onClick={clear} size="icon-xs" variant="ghost">
                        <TrashIcon />
                      </InputGroupButton>
                    ) : null}
                    {isLoading ? (
                      <InputGroupButton aria-label="Stop response" onClick={stop} size="icon-sm" variant="outline">
                        <SquareIcon />
                      </InputGroupButton>
                    ) : (
                      <InputGroupButton
                        aria-label="Send message"
                        disabled={!input.trim()}
                        size="icon-sm"
                        type="submit"
                        variant="default"
                      >
                        <SendIcon />
                      </InputGroupButton>
                    )}
                  </div>
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <FieldError>{error?.message}</FieldError>
          </FieldGroup>
        </div>
      </form>
    </section>
  );
}
