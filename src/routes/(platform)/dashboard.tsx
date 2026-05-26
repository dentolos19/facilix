import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(platform)/dashboard")({
  component: Page,
});

function Page() {
  return <div>Dashboard</div>;
}
