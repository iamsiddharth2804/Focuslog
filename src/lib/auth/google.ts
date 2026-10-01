import "server-only";
import { Google } from "arctic";

export function googleEnabled() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleClient() {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return new Google(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    `${base}/api/auth/google/callback`,
  );
}
