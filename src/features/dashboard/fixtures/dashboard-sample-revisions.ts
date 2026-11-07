import type { DashboardSampleRevisionItem } from "./dashboard-sample-types";

/**
 * Example "Upcoming Revisions" rows (Figma node 80:6946, "Scheduled
 * reviews"). Invented content only. Deleted once `GET /api/revision`
 * backs this list (T-14/T-15).
 */
export const dashboardSampleRevisions: DashboardSampleRevisionItem[] = [
  {
    id: "sql-basics",
    title: "SQL basics",
    spaceName: "Database Systems",
    kind: "flashcards",
    status: "overdue",
    dueLabel: "Overdue · 15 Oct",
  },
  {
    id: "semantic-html",
    title: "Semantic HTML elements",
    spaceName: "HTML Fundamentals",
    kind: "flashcards",
    status: "overdue",
    dueLabel: "Overdue · 16 Oct",
  },
  {
    id: "authentication",
    title: "Authentication",
    spaceName: "Cybersecurity Basics",
    kind: "flashcards",
    status: "today",
    dueLabel: "Today · 17 Oct",
  },
];
