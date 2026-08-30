import { describe, expect, test } from "bun:test";
import { SundayApiError } from "./api";
import { entranceErrorMessage } from "./entrance-error";

describe("entranceErrorMessage", () => {
  test("does not report a disabled anonymous provider as an invalid invite", () => {
    expect(entranceErrorMessage(new SundayApiError("anonymous_provider_disabled"), "invite"))
      .toContain("Cổng đăng nhập tạm thời chưa được bật");
  });

  test("reports a missing invite only for the invite RPC not-found code", () => {
    expect(entranceErrorMessage(new SundayApiError("P0002"), "invite"))
      .toBe("Invite code chưa đúng. Kiểm tra lại và thử lần nữa nhé.");
  });

  test("uses a connectivity message for unknown entrance failures", () => {
    expect(entranceErrorMessage(new Error("network unavailable"), "invite"))
      .toContain("Chưa thể kiểm tra invite code");
  });
});
