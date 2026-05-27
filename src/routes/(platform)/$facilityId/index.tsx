import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(platform)/$facilityId/")({
  component: Page,
});

function Page() {
  return <div>Hello "/(platform)/$facilityId/"!</div>;
}
