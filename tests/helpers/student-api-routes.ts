import { randomUUID } from "node:crypto";
import { studentRequest } from "./auth-test-students";

type Handler = (request: Request, context: { params: Promise<{ id: string; spaceId: string }> }) => Promise<Response>;
type RouteModule = Record<string, unknown>;
// Auth endpoints have their own public contract; /jobs/step authenticates QStash,
// not students. Every other current API module belongs in this list.
const routes: [string, () => Promise<RouteModule>][] = [
  ["spaces", () => import("@/app/api/spaces/route")],
  ["spaces/[spaceId]", () => import("@/app/api/spaces/[spaceId]/route")],
  ["spaces/[spaceId]/materials", () => import("@/app/api/spaces/[spaceId]/materials/route")],
  ["spaces/[spaceId]/topics", () => import("@/app/api/spaces/[spaceId]/topics/route")],
  ["spaces/[spaceId]/sets", () => import("@/app/api/spaces/[spaceId]/sets/route")],
  ["spaces/[spaceId]/progress", () => import("@/app/api/spaces/[spaceId]/progress/route")],
  ["materials/[id]", () => import("@/app/api/materials/[id]/route")],
  ["materials/[id]/complete", () => import("@/app/api/materials/[id]/complete/route")],
  ["materials/[id]/file", () => import("@/app/api/materials/[id]/file/route")],
  ["materials/[id]/retry", () => import("@/app/api/materials/[id]/retry/route")],
  ["materials/[id]/topic-draft", () => import("@/app/api/materials/[id]/topic-draft/route")],
  ["materials/[id]/topic-draft/confirm", () => import("@/app/api/materials/[id]/topic-draft/confirm/route")],
  ["topics/[id]", () => import("@/app/api/topics/[id]/route")],
  ["topics/[id]/mastery", () => import("@/app/api/topics/[id]/mastery/route")],
  ["sets/[id]", () => import("@/app/api/sets/[id]/route")],
  ["sets/[id]/attempts", () => import("@/app/api/sets/[id]/attempts/route")],
  ["attempts/[id]", () => import("@/app/api/attempts/[id]/route")],
  ["attempts/[id]/answers", () => import("@/app/api/attempts/[id]/answers/route")],
  ["attempts/[id]/submit", () => import("@/app/api/attempts/[id]/submit/route")],
  ["progress", () => import("@/app/api/progress/route")],
  ["revision", () => import("@/app/api/revision/route")],
  ["revision/session", () => import("@/app/api/revision/session/route")],
  ["revision/items/[id]/review", () => import("@/app/api/revision/items/[id]/review/route")],
];

export const studentApiPaths = routes.map(([path]) => path);

export async function studentApiCases() {
  const cases: { name: string; call: (cookie?: string) => Promise<Response> }[] = [];
  const id = randomUUID();
  for (const [path, load] of routes) {
    const routeModule = await load();
    for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
      if (typeof routeModule[method] !== "function") continue;
      const handler = routeModule[method] as Handler;
      cases.push({
        name: `${method} /api/${path}`,
        call: (cookie) => handler(
          studentRequest(`/api/${path.replace(/\[(?:id|spaceId)\]/g, id)}`, method, cookie, ["GET", "DELETE"].includes(method) ? undefined : {}),
          { params: Promise.resolve({ id, spaceId: id }) },
        ),
      });
    }
  }
  return cases;
}
