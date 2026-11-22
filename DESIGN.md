# Design System

Facilix should read as a professional facility monitoring console: dense, neutral, and calm, with color reserved for status and alerts.

## Framework

- The UI uses React 19 with TanStack Router file routes in [`src/app/src/routes`](src/app/src/routes).
- Components come from shadcn/ui in the `radix-vega` style on Radix UI primitives, configured in [`src/app/components.json`](src/app/components.json). Generated primitives live in [`src/app/src/components/ui`](src/app/src/components/ui).
- Icons come from Lucide.
- Charts use Recharts through the shadcn/ui chart wrapper.
- The facility editor draws the 2D map with Konva and the 3D view with React Three Fiber and Drei. 3D facility objects live in [`src/app/src/components/objects`](src/app/src/components/objects).
- Toasts use Sonner, and assistant messages render Markdown with Streamdown.

## Styling

- Styling uses Tailwind CSS 4 with tokens defined in [`src/app/src/styles.css`](src/app/src/styles.css). Do not add a Tailwind config file.
- Use the semantic color utilities (`bg-background`, `text-muted-foreground`, `border-border`) instead of raw palette colors, except for status colors such as red alerts.
- Theme switching uses `next-themes` with the `class` attribute and follows the system theme by default. The `dark` variant targets `.dark` descendants.

## Tokens

- **Colors**: The neutral shadcn/ui palette in OKLCH, with light values on `:root` and dark values on `.dark`. Tokens cover background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, five chart colors, and sidebar colors.
- **Radius**: `--radius` is `0.625rem`. The `sm` to `4xl` radius scale is derived from it by multiplication.
- **Fonts**: Geist Variable is the sans font, and Geist Mono Variable is the heading font (`font-heading`). Both are bundled through Fontsource.
- **Typography plugin**: `@tailwindcss/typography` styles long-form Markdown.

## Layout

- Authenticated pages sit under the `(platform)` route group, which requires a session.
- Dashboard pages under `(dashboard)` use `SidebarProvider` with the app sidebar and `SidebarInset` for content.
- The facility editor at `facility.$id` uses resizable panels around the map canvas, with a component palette, properties panel, and detail panels for zones, devices, events, and monitoring.

## Component Rules

- Prefer existing primitives in `src/app/src/components/ui` before adding new ones, and add new primitives with the shadcn CLI.
- Most panels and primitives use square corners (`rounded-none`). Keep `rounded-full` for status dots and spinners.
- Dense editor panels use small text sizes such as `text-[10px]` and `text-[11px]` with muted foreground colors.
- Use `font-mono` for identifiers, measurements, and timestamps.
