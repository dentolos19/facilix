import { chat, chatParamsFromRequest, maxIterations, toServerSentEventsResponse } from "@tanstack/ai";
import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { createFacilityChatAdapter } from "#/lib/ai";
import { getSession } from "#/lib/auth/guard";
import { createDatabase, schema } from "#/lib/database";
import { createFacilityChatTools } from "#/lib/facility-chat";

export const Route = createFileRoute("/api/facility-chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getSession(request, env.DATABASE);
        if (!session) return new Response("Unauthorized.", { status: 401 });

        let params: Awaited<ReturnType<typeof chatParamsFromRequest>>;
        try {
          params = await chatParamsFromRequest(request);
        } catch (error) {
          if (error instanceof Response) return error;
          throw error;
        }

        const facilityId = params.forwardedProps.facilityId;
        if (typeof facilityId !== "string" || facilityId.length === 0) {
          return new Response("A facility ID is required.", { status: 400 });
        }

        const db = createDatabase(env.DATABASE);
        const [facility] = await db
          .select({ name: schema.facility.name })
          .from(schema.facility)
          .where(eq(schema.facility.id, facilityId))
          .limit(1);
        if (!facility) return new Response("Facility not found.", { status: 404 });

        const stream = chat({
          adapter: createFacilityChatAdapter(),
          messages: params.messages,
          systemPrompts: [
            `You are the read-only facility intelligence assistant for "${facility.name}" (${facilityId}).

Answer questions using the facility tools. Never claim to have checked facility data unless you called the relevant tool in this turn or the result is already present in the conversation.

For questions that require synthesis, reason through the task privately and make as many tool calls as needed before answering. Start with get_facility_overview when the user asks a broad or ambiguous question. Combine overview, events, sensor history, recordings, and media inspection when that would materially improve the answer.

You can read information and inspect facility media, but you cannot create, update, delete, start, stop, or otherwise change anything. If asked to write or control the facility, explain that this assistant is currently read-only.

When citing evidence, name the device, timestamp, event, or media asset when available. Distinguish observed facts from inference. Keep the final answer concise and operational.`,
          ],
          tools: createFacilityChatTools(facilityId),
          agentLoopStrategy: maxIterations(8),
          modelOptions: {
            maxCompletionTokens: 1800,
            temperature: 0.2,
            parallelToolCalls: true,
          },
          threadId: params.threadId,
          runId: params.runId,
          parentRunId: params.parentRunId,
        });

        return toServerSentEventsResponse(stream);
      },
    },
  },
});
