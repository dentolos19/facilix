import { useSelector } from "@tanstack/react-store";

import { chatStore, getChatClient, getChatEntry, type FacilityChatState } from "#/lib/chat/store";

export interface UseFacilityChatReturn extends FacilityChatState {
  sendMessage: (content: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
}

export function useFacilityChat(facilityId: string): UseFacilityChatReturn {
  const entry = getChatEntry(facilityId);
  const state = useSelector(chatStore, (store) => store.clients.get(facilityId)?.state ?? entry.state);
  const client = entry.client;

  return {
    ...state,
    sendMessage: async (content: string) => {
      await client.sendMessage(content);
    },
    stop: () => client.stop(),
    clear: () => client.clear(),
  };
}

export { getChatClient, getChatEntry };
