import { defineConfig } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import viteTsConfigPaths from "vite-tsconfig-paths"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"
import { caddyPlugin } from "./src/vite-plugin-caddy"

// Use cloudflare-pages preset for production deployments, otherwise use default for local dev
const nitroPreset = process.env.CF_PAGES ? `cloudflare-pages` : undefined

const config = defineConfig({
  plugins: [
    devtools(),
    nitro({
      preset: nitroPreset,
      cloudflare: {
        pages: {
          routes: {
            exclude: [`/assets/*`],
          },
        },
      },
    }),
    viteTsConfigPaths({
      projects: [`./tsconfig.json`],
    }),
    caddyPlugin(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  optimizeDeps: {
    exclude: [`@tanstack/start-server-core`],
  },
  ssr: {
    noExternal: [`zod`, `drizzle-orm`],
  },
})

export default config
