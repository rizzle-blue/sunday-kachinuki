import { describe, expect, test } from "bun:test";
import { validateSundayDeploymentEnvironment } from "./deploy-guard";

const SAFE_REF = "abcdefghijklmnopqrst";

describe("Sunday deployment guard", () => {
  test("accepts a separate hosted project", () => {
    expect(() => validateSundayDeploymentEnvironment({
      SUNDAY_SUPABASE_PROJECT_REF: SAFE_REF,
      SUPABASE_URL: `https://${SAFE_REF}.supabase.co`,
    })).not.toThrow();
  });

  test("rejects a project ref that does not match the URL", () => {
    expect(() => validateSundayDeploymentEnvironment({
      SUNDAY_SUPABASE_PROJECT_REF: SAFE_REF,
      SUPABASE_URL: "https://differentprojectref.supabase.co",
    })).toThrow("must match");
  });

  test("rejects a service-role credential", () => {
    expect(() => validateSundayDeploymentEnvironment({
      SUNDAY_SUPABASE_PROJECT_REF: SAFE_REF,
      SUPABASE_URL: `https://${SAFE_REF}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: "secret",
    })).toThrow("Service-role");
  });
});
