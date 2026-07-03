"use client";

import { fetchServerSentEvents, useChat, type UIMessage } from "@tanstack/ai-react";
import { BotIcon, SearchIcon, SendIcon, SquareIcon, TrashIcon, UserIcon, XIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Button } from "#/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "#/components/ui/accordion";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { Field, FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Message, MessageAvatar, MessageContent, MessageHeader } from "#/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { cn } from "#/lib/utils";

const SUGGESTED_QUESTIONS = [
  "What needs my attention right now?",
  "Summarize recent safety events and their evidence.",
  "Which sensors show unusual readings?",
];

function toolLabel(name: string): string {
  const labels: Record<string, string> = {
    get_facility_overview: "Reading facility overview",
    search_facility_events: "Searching facility events",
    get_sensor_history: "Reviewing sensor history",
    list_facility_media: "Finding facility media",
    inspect_facility_media: "Inspecting facility media",
  };
  return labels[name] ?? "Reviewing facility data";
}

function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const textAndToolParts = message.parts.filter((part) => part.type === "text" || part.type === "tool-call");
  const thinkingParts = message.parts.filter((part) => part.type === "thinking");

  if (textAndToolParts.length === 0 && thinkingParts.length === 0) return null;

  return (
    <Message align={isUser ? "end" : "start"}>
      <MessageAvatar>{isUser ? <UserIcon /> : <BotIcon />}</MessageAvatar>
      <MessageContent>
        <MessageHeader>{isUser ? "You" : "Chat assistant"}</MessageHeader>
        {thinkingParts.length > 0 && !isUser ? (
          <Accordion className="w-full" collapsible defaultValue={undefined} type="single">
            <AccordionItem value="reasoning">
              <AccordionTrigger>Reasoning</AccordionTrigger>
              <AccordionContent>
                {thinkingParts.map((part, index) => (
                  <p className="text-muted-foreground whitespace-pre-wrap text-xs" key={`${message.id}-thinking-${index}`}>
                    {part.content || "Reasoning through the facility data…"}
                  </p>
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        ) : null}
        {textAndToolParts.map((part, index) => {
          if (part.type === "text") {
            if (!part.content.trim()) return null;
            return (
              <Bubble
                align={isUser ? "end" : "start"}
                key={`${message.id}-text-${index}`}
                variant={isUser ? "default" : "outline"}
              >
                <BubbleContent className="whitespace-pre-wrap">{part.content}</BubbleContent>
              </Bubble>
            );
          }

          const complete = part.state === "complete";
          return (
            <Bubble key={part.id} variant="muted">
              <BubbleContent className="flex items-center gap-2 text-xs">
                <SearchIcon aria-hidden />
                <span>{toolLabel(part.name)}</span>
                <span className="text-muted-foreground">{complete ? "Done" : "Working…"}</span>
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
  const connection = useMemo(() => fetchServerSentEvents("/api/chat"), []);
  const { messages, sendMessage, isLoading, error, stop, clear } = useChat({
    connection,
    forwardedProps: { facilityId },
    id: `chat-${facilityId}`,
  });

  async function submit(question: string) {
    const value = question.trim();
    if (!value || isLoading) return;
    setInput("");
    await sendMessage(value);
  }

  return (
    <section
      aria-label="Chat assistant"
      className={cn("bg-background flex min-h-0 flex-1 flex-col overflow-hidden", className)}
    >
      {!hideHeader && (
        <header className="border-border flex shrink-0 items-center gap-3 border-b px-4 py-3">
          <div className="bg-muted flex size-8 items-center justify-center">
            <BotIcon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-medium">Chat assistant</h2>
            <p className="text-muted-foreground truncate text-[11px]">Read-only access to operations and media</p>
          </div>
          {onClose ? (
            <Button aria-label="Close chat" onClick={onClose} size="icon-sm" variant="ghost">
              <XIcon />
            </Button>
          ) : null}
        </header>
      )}

      <div className="min-h-0 flex-1">
        {messages.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BotIcon />
              </EmptyMedia>
              <EmptyTitle>Ask about this facility</EmptyTitle>
              <EmptyDescription>
                I can combine device configuration, events, sensor readings, recordings, and visual evidence.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {SUGGESTED_QUESTIONS.map((question) => (
                <Button
                  className="w-full justify-start text-left"
                  key={question}
                  onClick={() => submit(question)}
                  size="sm"
                  variant="outline"
                >
                  {question}
                </Button>
              ))}
            </EmptyContent>
          </Empty>
        ) : (
          <MessageScrollerProvider autoScroll>
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent className="gap-5 p-4">
                  {messages.map((message) => (
                    <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
                      <ChatMessage message={message} />
                    </MessageScrollerItem>
                  ))}
                  {isLoading && messages.at(-1)?.role === "user" ? (
                    <MessageScrollerItem messageId="chat-thinking">
                      <Message align="start">
                        <MessageAvatar>
                          <BotIcon />
                        </MessageAvatar>
                        <MessageContent>
                          <Bubble variant="ghost">
                            <BubbleContent>
                              <span className="shimmer">Reviewing facility data…</span>
                            </BubbleContent>
                          </Bubble>
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
        className="border-border shrink-0 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(input);
        }}
      >
        <FieldGroup className="gap-2">
          <Field orientation="horizontal">
            <Input
              aria-label="Ask about this facility"
              autoComplete="off"
              className="flex-1"
              disabled={isLoading}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about devices, events, sensors, or media…"
              value={input}
            />
            {messages.length > 0 ? (
              <Button aria-label="Clear chat" onClick={clear} size="icon-sm" type="button" variant="ghost">
                <TrashIcon />
              </Button>
            ) : null}
            {isLoading ? (
              <Button aria-label="Stop response" onClick={stop} size="icon" type="button" variant="outline">
                <SquareIcon />
              </Button>
            ) : (
              <Button aria-label="Send message" disabled={!input.trim()} size="icon" type="submit">
                <SendIcon />
              </Button>
            )}
          </Field>
          <FieldError>{error?.message}</FieldError>
        </FieldGroup>
      </form>
    </section>
  );
}
