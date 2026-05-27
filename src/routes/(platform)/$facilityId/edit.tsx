import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(platform)/$facilityId/edit")({
  component: Page,
});

function Page() {
  return <div>Hello "/(platform)/$facilityId/edit"!</div>;
}
