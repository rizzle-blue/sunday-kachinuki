import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "src/routeTree.gen.ts",
      ".output/**",
      ".vercel/**",
      "supabase/.temp/**",
      "dist/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
