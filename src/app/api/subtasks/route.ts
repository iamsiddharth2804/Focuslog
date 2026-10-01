import { authed } from "@/lib/api";
import { subtaskSchema } from "@/lib/validation";
import { createSubtask } from "@/server/study";

export const POST = authed(async ({ user, body }) => createSubtask(user, subtaskSchema.parse(body)));
