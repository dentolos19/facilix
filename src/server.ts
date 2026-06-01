import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

export { Monitor } from "#/lib/bindings/monitor";
export { Observer } from "#/lib/bindings/observer";

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request);
  },
});
