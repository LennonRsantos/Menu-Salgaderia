import { isAuthConfigured, neonAuth } from "@/lib/neon-auth";

type Ctx = { params: Promise<{ path: string[] }> };
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

let handlers: ReturnType<ReturnType<typeof neonAuth>["handler"]> | undefined;

// Proxies the browser's auth calls to Neon Auth. Staff accounts are created by
// a manager in the panel, so public sign-up through this app is refused.
function proxy(method: Method) {
  return async (request: Request, ctx: Ctx) => {
    if (!isAuthConfigured) return Response.json({ message: "Login não configurado." }, { status: 503 });
    const { path } = await ctx.params;
    if (path[0] === "sign-up") return Response.json({ message: "Cadastro desativado." }, { status: 403 });
    handlers ??= neonAuth().handler();
    return handlers[method](request, ctx);
  };
}

export const GET = proxy("GET");
export const POST = proxy("POST");
export const PUT = proxy("PUT");
export const PATCH = proxy("PATCH");
export const DELETE = proxy("DELETE");
