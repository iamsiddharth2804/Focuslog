import { publicRoute } from "@/lib/api";
import { destroySession } from "@/lib/auth/session";

export const POST = publicRoute(async () => {
  await destroySession();
  return { ok: true };
});
