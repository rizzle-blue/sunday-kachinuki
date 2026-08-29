const HOSTED_PROJECT_REF = /^[a-z0-9]{20}$/;

export function validateSundayDeploymentEnvironment(
  values: Readonly<Record<string, string | undefined>>,
): void {
  const projectRef = values.SUNDAY_SUPABASE_PROJECT_REF;
  const url = values.SUPABASE_URL;

  if (!projectRef) {
    throw new Error("SUNDAY_SUPABASE_PROJECT_REF is required");
  }
  if (values.SUPABASE_SERVICE_ROLE_KEY || values.VITE_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Service-role credentials are forbidden in the Sunday app environment");
  }
  if (!url) {
    throw new Error("SUPABASE_URL is required");
  }

  const parsed = new URL(url);
  const local = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (local) {
    if (projectRef !== "local-sunday-kachinuki") {
      throw new Error("Local Sunday builds require the isolated local project ref");
    }
    return;
  }

  if (!HOSTED_PROJECT_REF.test(projectRef)) {
    throw new Error("Hosted Sunday project ref must be an explicit 20-character Supabase ref");
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== `${projectRef}.supabase.co`) {
    throw new Error("SUNDAY_SUPABASE_PROJECT_REF must match the hosted SUPABASE_URL");
  }
}
