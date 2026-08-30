import { SundayApiError } from "./api";

type EntranceKind = "invite" | "register";

export function entranceErrorMessage(cause: unknown, kind: EntranceKind): string {
  if (cause instanceof SundayApiError) {
    if (cause.code === "anonymous_provider_disabled") {
      return "Cổng đăng nhập tạm thời chưa được bật. Báo host để kiểm tra cấu hình Sunday.";
    }
    if (cause.code === "P0002" && kind === "invite") {
      return "Invite code chưa đúng. Kiểm tra lại và thử lần nữa nhé.";
    }
    if (cause.code === "23514") {
      return "Tài khoản Host không thể dùng làm Kenshi. Hãy logout Host rồi thử lại.";
    }
    if (/rate.?limit/i.test(`${cause.code} ${cause.message}`)) {
      return "Có quá nhiều lượt đăng nhập cùng lúc. Chờ một chút rồi thử lại nhé.";
    }
  }

  return kind === "invite"
    ? "Chưa thể kiểm tra invite code lúc này. Kiểm tra mạng rồi thử lại nhé."
    : "Chưa thể tạo Kenshi profile lúc này. Kiểm tra mạng rồi thử lại nhé.";
}
