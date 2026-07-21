/// <reference types="vitest/config" />

import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tanstackRouter({ autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 4173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:8080" },
  },
})
