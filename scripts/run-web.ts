export {};

const assignmentPattern = /^([A-Z_][A-Z0-9_]*)=(?:"([^"]*)"|'([^']*)'|([^\s#]*))\s*$/gm;

function parseAssignments(output: string): ReadonlyMap<string, string> {
  const assignments = new Map<string, string>();
  for (const match of output.matchAll(assignmentPattern)) {
    assignments.set(match[1]!, match[2] ?? match[3] ?? match[4] ?? "");
  }
  return assignments;
}

const statusProcess = Bun.spawn(["bunx", "supabase", "status", "-o", "env"], {
  stdout: "pipe",
  stderr: "pipe",
});
const [stdout, exitCode] = await Promise.all([
  new Response(statusProcess.stdout).text(),
  statusProcess.exited,
]);
if (exitCode !== 0) {
  throw new Error("Sunday Supabase is not running; run bun run db:start first");
}

const statusValues = parseAssignments(stdout);
const url = statusValues.get("API_URL");
const publishableKey = statusValues.get("PUBLISHABLE_KEY") ?? statusValues.get("ANON_KEY");
if (url !== "http://127.0.0.1:55321" || !publishableKey) {
  throw new Error("Unexpected local Sunday Supabase configuration");
}

const [operation, ...extra] = process.argv.slice(2);
if (extra.length > 0 || (operation !== "dev" && operation !== "build")) {
  throw new Error("Usage: bun scripts/run-web.ts <dev|build>");
}

const child = Bun.spawn([
  "bunx",
  "--bun",
  "vite",
  operation,
  "--mode",
  "development",
  "--configLoader",
  "runner",
  ...(operation === "dev" ? ["--host", "127.0.0.1", "--port", "3001"] : []),
], {
  env: {
    PATH: process.env.PATH ?? "",
    SYSTEMROOT: process.env.SYSTEMROOT ?? "",
    TEMP: process.env.TEMP ?? "",
    TMP: process.env.TMP ?? "",
    SUNDAY_SUPABASE_PROJECT_REF: "local-sunday-kachinuki",
    SUPABASE_URL: url,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    VITE_SUPABASE_URL: url,
    VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    ...(operation === "build" ? { VERCEL: "1" } : {}),
  },
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});

process.exitCode = await child.exited;
