import { authed } from "@/lib/api";
import { studyAreaSchema } from "@/lib/validation";
import { createStudyArea, listStudyAreas } from "@/server/study";

export const GET = authed(async ({ user, url }) => listStudyAreas(user, { includeArchived: url.searchParams.get("archived") === "1" }));
export const POST = authed(async ({ user, body }) => createStudyArea(user, studyAreaSchema.parse(body)));
