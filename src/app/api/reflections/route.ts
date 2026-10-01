import { authed } from "@/lib/api";
import { reflectionSchema } from "@/lib/validation";
import { saveReflection } from "@/server/account";

export const POST = authed(async ({ user, body }) => saveReflection(user, reflectionSchema.parse(body)));
