import type { ChatClientPersistence, UIMessage } from "@tanstack/ai-client";

function chatStorageKey(id: string): string {
  return `facilix-chat-${id}`;
}

/**
 * Synchronous localStorage adapter for TanStack AI ChatClient.
 *
 * Restores message history on load and saves it on every update. Date values
 * are revived from their JSON-serialized string form so message ordering and
 * timestamps remain accurate.
 */
export const localChatPersistence: ChatClientPersistence = {
  getItem: (id) => {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(chatStorageKey(id));
    if (!raw) return null;
    try {
      const stored: Array<UIMessage> = JSON.parse(raw);
      return stored.map((message) => ({
        ...message,
        createdAt:
          typeof message.createdAt === "string" ? new Date(message.createdAt) : message.createdAt,
      }));
    } catch {
      return null;
    }
  },
  setItem: (id, messages) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(chatStorageKey(id), JSON.stringify(messages));
  },
  removeItem: (id) => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(chatStorageKey(id));
  },
};
