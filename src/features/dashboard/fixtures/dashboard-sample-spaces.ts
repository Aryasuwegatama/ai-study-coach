import type { DashboardSampleSpace } from "./dashboard-sample-types";

/**
 * Example Study Spaces (Figma node 80:6946, "My Study Spaces" +
 * sidebar "Study Space children"). One list, read by both the sidebar
 * (`app-sidebar.tsx`) and the dashboard's space cards
 * (`dashboard-space-cards.tsx`), so they always show the same spaces.
 *
 * Invented content only (this repository is public) — no real course
 * material. T-05 deletes this file once real Study Spaces exist.
 */
export const dashboardSampleSpaces: DashboardSampleSpace[] = [
  {
    id: "html-fundamentals",
    name: "HTML Fundamentals",
    materialsCount: 6,
    topicsCount: 4,
    finalQuizAccuracyPercent: 70,
    tone: "blue",
  },
  {
    id: "web-development",
    name: "Web Development",
    materialsCount: 8,
    topicsCount: 6,
    finalQuizAccuracyPercent: 60,
    tone: "purple",
  },
  {
    id: "cybersecurity-basics",
    name: "Cybersecurity Basics",
    materialsCount: 3,
    topicsCount: 3,
    finalQuizAccuracyPercent: 80,
    tone: "green",
  },
  {
    id: "database-systems",
    name: "Database Systems",
    materialsCount: 1,
    topicsCount: 3,
    finalQuizAccuracyPercent: 66.7,
    tone: "blue",
  },
];
