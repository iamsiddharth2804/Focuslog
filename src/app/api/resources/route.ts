import { authed } from "@/lib/api";
import { resourceSchema } from "@/lib/validation";
import { createResource } from "@/server/study";

export const POST = authed(async ({ user, body }) => createResource(user, resourceSchema.parse(body)));
