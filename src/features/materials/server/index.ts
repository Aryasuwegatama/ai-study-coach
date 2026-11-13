// Other features import Materials only through this barrel (PRD Section 4
// module rule). `requireMaterial()` is here for later features (topics,
// quizzes) that act on a material.
export {
  listMaterials,
  createMaterial,
  completeMaterial,
  retryMaterial,
  getMaterialFile,
  deleteMaterial,
  requireMaterial,
} from "./materials-service";
export type { MaterialRecord } from "./materials-service";
export type { MaterialResponse } from "../materials-schemas";
// The `process_material` job's step handler, run by `src/server/jobs/jobs-runner.ts`.
export { processMaterialJob } from "./process-material";
