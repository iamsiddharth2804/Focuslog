import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import type { User } from "@/db/schema";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Record") => new ApiError(404, "NOT_FOUND", `${what} not found`);
export const conflict = (code: string, msg: string) => new ApiError(409, code, msg);
export const badRequest = (msg: string, code = "BAD_REQUEST") => new ApiError(400, code, msg);

type Ctx = { params: Promise<Record<string, string>> };

export function errorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input",
          issues: err.issues,
        },
      },
      { status: 400 },
    );
  }
  // Postgres unique violation
  const pgCode = (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  if (pgCode === "23505") {
    return NextResponse.json(
      { error: { code: "DUPLICATE", message: "That already exists." } },
      { status: 409 },
    );
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong on our side." } }, { status: 500 });
}

async function readJson(req: Request) {
  if (req.method === "GET" || req.method === "HEAD") return {};
  const text = await req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw badRequest("Request body must be valid JSON");
  }
}

/** Authenticated route handler: resolves the user, parses JSON, maps errors. */
export function authed<T>(
  fn: (args: { user: User; req: Request; body: unknown; params: Record<string, string>; url: URL }) => Promise<T>,
) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Please sign in again.");
      const body = await readJson(req);
      const params = (await ctx?.params) ?? {};
      const result = await fn({ user, req, body, params, url: new URL(req.url) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function publicRoute<T>(fn: (args: { req: Request; body: unknown; url: URL }) => Promise<T>) {
  return async (req: Request) => {
    try {
      const body = await readJson(req);
      const result = await fn({ req, body, url: new URL(req.url) });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
