import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { validateSundayDeploymentEnvironment } from "./deployment-target.ts";

function requirePair() {
  validateSundayDeploymentEnvironment(process.env);
  const serverUrl = process.env.SUPABASE_URL;
  const serverKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const browserUrl = process.env.VITE_SUPABASE_URL;
  const browserKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!serverUrl || !serverKey || !browserUrl || !browserKey) throw new Error("Sunday Supabase public configuration is required");
  if (serverUrl !== browserUrl || serverKey !== browserKey) throw new Error("Sunday Supabase browser/server configuration must match");
}

export default defineConfig(() => {
  requirePair();
  return {
    envDir: false as const,
    resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
    plugins: [tailwindcss(), tanstackStart(), nitro({ preset: process.env.VERCEL ? "vercel" : "bun" }), viteReact()],
  };
});
