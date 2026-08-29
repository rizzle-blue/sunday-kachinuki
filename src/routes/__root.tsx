import type { ReactNode } from "react";
import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import styles from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "robots", content: "noindex,nofollow,noarchive" },
      { title: "Sunday Kachinuki" },
      { name: "description", content: "A secret Sunday Team-3 survivor loop." },
    ],
    links: [{ rel: "stylesheet", href: styles }],
  }),
  component: Root,
  notFoundComponent: () => <State title="Lạc khỏi võ đường" detail="Trang này không tồn tại trong Sunday Kachinuki." />,
  errorComponent: () => <State title="Tạm mất nhịp" detail="Hãy tải lại trang hoặc báo cho host." />,
});

function Root() {
  return <Document><header className="site-header shell"><Link className="brand" to="/">Sunday Kachinuki</Link><Link className="host-link" to="/host">Host</Link></header><Outlet /></Document>;
}

function Document({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="vi"><head><HeadContent /></head><body>{children}<Scripts /></body></html>;
}

function State({ title, detail }: Readonly<{ title: string; detail: string }>) {
  return <main className="page shell"><section className="panel"><p className="kicker">Sunday Kachinuki</p><h1 className="page-title">{title}</h1><p className="muted">{detail}</p><Link className="button" to="/">Về cổng vào</Link></section></main>;
}
