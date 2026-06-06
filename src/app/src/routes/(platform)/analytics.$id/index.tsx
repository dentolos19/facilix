import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(platform)/analytics/$id/")({
  component: Page,
});

function Page() {
  return <div>Hi</div>;
}
