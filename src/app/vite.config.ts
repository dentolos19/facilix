import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
  server: {
    port: 3000,
    allowedHosts: true,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    cloudflare({
      viteEnvironment: {
        name: "ssr",
      },
      tunnel: {
        autoStart: true,
        name: "Local",
      },
    }),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    devtools({
      injectSource: {
        enabled: false,
      },
    }),
  ],
});

export default config;
