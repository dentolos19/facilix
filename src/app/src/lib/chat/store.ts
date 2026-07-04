import { fetchServerSentEvents } from "@tanstack/ai-react";
import { ChatClient, type ConnectionStatus, type UIMessage } from "@tanstack/ai-client";
import { createStore } from "@tanstack/react-store";

import { localChatPersistence } from "#/lib/chat/persistence";

export interface FacilityChatState {
  messages: Array<UIMessage>;
  isLoading: boolean;
  error: Error | undefined;
  status: "ready" | "submitted" | "streaming" | "error";
  isSubscribed: boolean;
  connectionStatus: ConnectionStatus;
  sessionGenerating: boolean;
}

interface ChatEntry {
  client: ChatClient;
  state: FacilityChatState;
}

function createInitialState(): FacilityChatState {
  return {
    messages: [],
    isLoading: false,
    error: undefined,
    status: "ready",
    isSubscribed: false,
    connectionStatus: "disconnected",
    sessionGenerating: false,
  };
}

function makeClient(facilityId: string): ChatClient {
  return new ChatClient({
    id: `facility-chat-${facilityId}`,
    connection: fetchServerSentEvents("/api/chat"),
    forwardedProps: { facilityId },
    persistence: localChatPersistence,
    onMessagesChange: (messages) => updateEntry(facilityId, { messages: [...messages] }),
    onLoadingChange: (isLoading) => updateEntry(facilityId, { isLoading }),
    onErrorChange: (error) => updateEntry(facilityId, { error }),
    onStatusChange: (status) => updateEntry(facilityId, { status }),
    onSubscriptionChange: (isSubscribed) => updateEntry(facilityId, { isSubscribed }),
    onConnectionStatusChange: (connectionStatus) => updateEntry(facilityId, { connectionStatus }),
    onSessionGeneratingChange: (sessionGenerating) => updateEntry(facilityId, { sessionGenerating }),
  });
}

function updateEntry(facilityId: string, patch: Partial<FacilityChatState>) {
  chatStore.setState((state) => {
    const entry = state.clients.get(facilityId);
    if (!entry) return state;
    const next: ChatEntry = { ...entry, state: { ...entry.state, ...patch } };
    const clients = new Map(state.clients);
    clients.set(facilityId, next);
    return { clients };
  });
}

function ensureEntry(facilityId: string): ChatEntry {
  const existing = chatStore.state.clients.get(facilityId);
  if (existing) return existing;

  const client = makeClient(facilityId);
  const entry: ChatEntry = { client, state: createInitialState() };

  // Start the background subscription so the session survives navigation.
  client.subscribe();

  // Sync initial hydrated state from persistence.
  updateEntry(facilityId, { messages: client.getMessages() });

  chatStore.setState((state) => {
    const clients = new Map(state.clients);
    clients.set(facilityId, entry);
    return { clients };
  });

  return entry;
}

interface ChatStoreState {
  clients: Map<string, ChatEntry>;
}

export const chatStore = createStore<ChatStoreState>({
  clients: new Map(),
});

export function getChatEntry(facilityId: string): ChatEntry {
  return ensureEntry(facilityId);
}

export function getChatClient(facilityId: string): ChatClient {
  return getChatEntry(facilityId).client;
}

export function clearFacilityChat(facilityId: string): void {
  const entry = chatStore.state.clients.get(facilityId);
  if (entry) {
    entry.client.clear();
  }
}
