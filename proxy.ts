import { NextResponse, type NextRequest } from "next/server";

/**
 * Password-protects the whole dashboard (browser login prompt; any username works).
 * Set DASHBOARD_PASSWORD in Vercel. Without it, the dashboard only opens locally.
 */
export function proxy(req: NextRequest) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) {
    return process.env.NODE_ENV === "production"
      ? new NextResponse("Set DASHBOARD_PASSWORD to open the dashboard.", { status: 503 })
      : NextResponse.next();
  }
  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    const decoded = atob(header.slice(6));
    if (decoded.slice(decoded.indexOf(":") + 1) === password) return NextResponse.next();
  }
  return new NextResponse("Login required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Auto Apply"' },
  });
}

export const config = { matcher: "/((?!_next/static|_next/image|favicon.ico).*)" };
