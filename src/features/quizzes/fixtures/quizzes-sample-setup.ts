import type { SetupMaterial } from "./quizzes-sample-types";

/**
 * EXAMPLE DATA (sample-data rule, `docs/CONTRIBUTING.md` "File naming"):
 * the Generate Quiz setup screen's per-material confirmed-topics listing
 * (gap 2 — `quizzes-sample-types.ts`). Two Ready materials the student
 * can choose from, plus one still `review_topics` so the setup screen's
 * "not selectable" row has something real to show.
 */
export const quizzesSampleSetupMaterials: SetupMaterial[] = [
  {
    id: "material-bio-ch4",
    name: "Biology Chapter 4.pdf",
    status: "ready",
    topics: [
      { id: "topic-cell-structure", name: "Cell structure" },
      { id: "topic-mitosis", name: "Mitosis" },
      { id: "topic-photosynthesis", name: "Photosynthesis" },
    ],
  },
  {
    id: "material-econ-notes",
    name: "Economics Notes.pptx",
    status: "ready",
    topics: [
      { id: "topic-supply-demand", name: "Supply and demand" },
      { id: "topic-market-equilibrium", name: "Market equilibrium" },
      { id: "topic-elasticity", name: "Elasticity" },
    ],
  },
  {
    id: "material-ch5-draft",
    name: "Chapter 5 Draft.pdf",
    status: "review_topics",
    topics: [],
  },
];
