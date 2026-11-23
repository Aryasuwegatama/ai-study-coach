import { and, desc, eq, exists, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/db-client";
import { attemptItems, attempts, deckSessions, itemSources, learningItems, materials, planItems, studySets, studySpaces } from "@/server/db/schema";
import type { SessionUser } from "@/server/auth/auth-session";
import { getAllProgress, type SpaceProgress } from "@/features/progress/server";
import { PLAN_TITLE_MAX, SUGGESTION_KINDS, type Suggestion, type SuggestionKind, type UnfinishedDeck, type UnfinishedQuiz } from "../plan-schemas";

const clip = (text: string) => (text.length <= PLAN_TITLE_MAX ? text : `${text.slice(0, PLAN_TITLE_MAX - 1)}…`);
const questions = (n: number) => `${n} question${n === 1 ? "" : "s"}`;

/** Quizzes the student started and hasn't submitted, in live spaces, most recently touched first. */
export async function getUnfinishedQuizzes(user: SessionUser): Promise<UnfinishedQuiz[]> {
  const answered = sql<number>`(count(${attemptItems.itemId}) filter (where ${attemptItems.selectedIndex} is not null))::int`;
  const lastActivity = sql`coalesce(max(${attemptItems.answeredAt}), ${attempts.startedAt})`;
  const rows = await db
    .select({
      attemptId: attempts.id,
      setId: attempts.setId,
      title: studySets.title,
      spaceId: attempts.spaceId,
      spaceName: studySpaces.name,
      total: attempts.total,
      answered,
      lastActivity,
    })
    .from(attempts)
    .innerJoin(studySets, eq(studySets.id, attempts.setId))
    .innerJoin(studySpaces, eq(studySpaces.id, attempts.spaceId))
    .leftJoin(attemptItems, eq(attemptItems.attemptId, attempts.id))
    .where(and(eq(attempts.studentId, user.id), eq(attempts.status, "in_progress"), eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt)))
    .groupBy(attempts.id, studySets.title, studySpaces.name)
    .orderBy(desc(lastActivity));
  return rows.map(({ lastActivity: at, ...r }) => ({
    ...r,
    kind: "quiz" as const,
    href: `/spaces/${r.spaceId}/quizzes/${r.setId}`,
    lastActivityAt: new Date(at as string | Date).toISOString(),
  }));
}

/**
 * Decks the student started practising and hasn't finished, in live spaces,
 * most recently touched first. "N of M rated" counts the ratings of cards that
 * can still be practised (a card whose material was deleted is out of both).
 */
export async function getUnfinishedDecks(user: SessionUser): Promise<UnfinishedDeck[]> {
  const practisableCards = db
    .select({ id: learningItems.id })
    .from(learningItems)
    .where(
      and(
        eq(learningItems.setId, deckSessions.setId),
        eq(learningItems.status, "active"),
        inArray(learningItems.kind, ["recall", "short_answer"]),
        exists(db.select({ one: sql`1` }).from(itemSources).where(eq(itemSources.itemId, learningItems.id))),
      ),
    );
  const rows = await db
    .select({
      sessionId: deckSessions.id,
      setId: deckSessions.setId,
      title: studySets.title,
      spaceId: deckSessions.spaceId,
      spaceName: studySpaces.name,
      rated: sql<number>`(select count(*) from (${practisableCards}) c where (${deckSessions.ratings} ->> c.id::text) is not null)::int`,
      total: sql<number>`(select count(*) from (${practisableCards}) c)::int`,
      updatedAt: deckSessions.updatedAt,
    })
    .from(deckSessions)
    .innerJoin(studySets, eq(studySets.id, deckSessions.setId))
    .innerJoin(studySpaces, eq(studySpaces.id, deckSessions.spaceId))
    .where(and(eq(deckSessions.studentId, user.id), eq(deckSessions.status, "in_progress"), eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt)))
    .orderBy(desc(deckSessions.updatedAt));
  return rows
    // A deck whose cards are all gone can only be deleted: nothing to resume.
    .filter((r) => r.total > 0)
    .map((r) => ({
      kind: "deck" as const,
      sessionId: r.sessionId,
      setId: r.setId,
      title: r.title,
      spaceId: r.spaceId,
      spaceName: r.spaceName,
      rated: r.rated,
      total: r.total,
      href: `/spaces/${r.spaceId}/flashcards/${r.setId}`,
      lastActivityAt: r.updatedAt.toISOString(),
    }));
}

/**
 * The ranked suggestions (PRD Section 2 "My Plan and reviewing mistakes"),
 * built from the student's analytics. Kinds, in this order: a weak topic;
 * mistakes to review; not enough evidence; an unfinished quiz; an unfinished
 * flashcard deck; a topic not tested yet; a material waiting for topic
 * review. Within a kind: weak by lowest percent, mistakes by most, not enough
 * evidence by fewest needed, unfinished quiz or deck by most recent, the rest
 * by name.
 *
 * Weak, not-enough-evidence and not-tested suggestions only cover topics with
 * a Ready material (they lead to Practise); a topic from a deleted material
 * only ever gives "mistakes to review". Suggestions are advice, not a
 * schedule: nothing here is mandatory and nothing carries a date.
 *
 * `progress`, `unfinished` and `unfinishedDecks` can be passed in by a caller
 * that already has them (the dashboard), so nothing is read twice.
 */
export async function getSuggestions(
  user: SessionUser,
  options: { progress?: SpaceProgress[]; unfinished?: UnfinishedQuiz[]; unfinishedDecks?: UnfinishedDeck[] } = {},
): Promise<Suggestion[]> {
  const [progress, unfinished, unfinishedDecks, reviewMaterials, openPlan] = await Promise.all([
    options.progress ?? getAllProgress(user),
    options.unfinished ?? getUnfinishedQuizzes(user),
    options.unfinishedDecks ?? getUnfinishedDecks(user),
    db
      .select({ id: materials.id, name: materials.originalName, spaceId: materials.spaceId, spaceName: studySpaces.name })
      .from(materials)
      .innerJoin(studySpaces, eq(studySpaces.id, materials.spaceId))
      .where(and(eq(materials.status, "review_topics"), eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt))),
    db
      .select({ kind: planItems.kind, topicId: planItems.topicId, setId: planItems.setId, materialId: planItems.materialId })
      .from(planItems)
      .leftJoin(studySpaces, eq(studySpaces.id, planItems.spaceId))
      .where(and(eq(planItems.studentId, user.id), isNull(planItems.doneAt), or(isNull(planItems.spaceId), isNull(studySpaces.deletedAt)))),
  ]);

  const inPlanKeys = new Set(openPlan.map((p) => `${p.kind}:${p.topicId ?? p.setId ?? p.materialId}`));
  const byKind = new Map<SuggestionKind, { sort: (string | number)[]; suggestion: Omit<Suggestion, "inPlan"> }[]>(SUGGESTION_KINDS.map((k) => [k, []]));
  const add = (kind: SuggestionKind, sort: (string | number)[], suggestion: Omit<Suggestion, "inPlan" | "kind">) =>
    byKind.get(kind)!.push({ sort, suggestion: { ...suggestion, kind } });

  for (const space of progress) {
    for (const topic of space.topics) {
      const where = { spaceId: space.spaceId, spaceName: space.spaceName };
      const practise = { actionLabel: "Practise this topic", href: `/spaces/${space.spaceId}/quizzes/new?topic=${topic.topicId}`, plan: { kind: "practise_topic", topicId: topic.topicId } } as const;

      if (topic.hasReadyMaterial && topic.status === "weak") {
        add("weak_topic", [topic.percent ?? 0, topic.name.toLowerCase()], {
          ...where,
          ...practise,
          key: `weak_topic:${topic.topicId}`,
          title: clip(`Practise ${topic.name}`),
          detail: `${topic.name} is weak (${topic.percent}% of the latest ${topic.counted}). Practise it.`,
        });
      }
      if (topic.mistakes > 0) {
        add("mistakes", [-topic.mistakes, topic.name.toLowerCase()], {
          ...where,
          key: `mistakes:${topic.topicId}`,
          title: clip(`Review mistakes in ${topic.name}`),
          detail: `${questions(topic.mistakes)} you got wrong in ${topic.name}`,
          actionLabel: "Review mistakes",
          href: `/plan/review?topicId=${topic.topicId}`,
          plan: { kind: "review_mistakes", topicId: topic.topicId },
        });
      }
      if (topic.hasReadyMaterial && topic.status === "insufficient") {
        add("not_enough_evidence", [topic.needed, topic.name.toLowerCase()], {
          ...where,
          ...practise,
          key: `not_enough_evidence:${topic.topicId}`,
          title: clip(`Practise ${topic.name}`),
          detail: `Answer ${topic.needed} more question${topic.needed === 1 ? "" : "s"} on ${topic.name} to get a score`,
        });
      }
      if (topic.hasReadyMaterial && topic.status === "not_assessed") {
        add("not_tested", [topic.name.toLowerCase()], {
          ...where,
          ...practise,
          key: `not_tested:${topic.topicId}`,
          title: clip(`Practise ${topic.name}`),
          detail: `${topic.name} hasn't been tested yet`,
        });
      }
    }
  }

  unfinished.forEach((quiz, position) =>
    add("unfinished_quiz", [position], {
      key: `unfinished_quiz:${quiz.setId}`,
      spaceId: quiz.spaceId,
      spaceName: quiz.spaceName,
      title: clip(`Resume ${quiz.title}`),
      detail: `Resume ${quiz.title}, ${quiz.answered} of ${quiz.total} answered`,
      actionLabel: "Resume quiz",
      href: quiz.href,
      plan: { kind: "resume_quiz", setId: quiz.setId },
    }),
  );

  unfinishedDecks.forEach((deck, position) =>
    add("unfinished_deck", [position], {
      key: `unfinished_deck:${deck.setId}`,
      spaceId: deck.spaceId,
      spaceName: deck.spaceName,
      title: clip(`Resume ${deck.title}`),
      detail: `Resume ${deck.title}, ${deck.rated} of ${deck.total} rated`,
      actionLabel: "Resume practice",
      href: deck.href,
      plan: { kind: "practise_deck", setId: deck.setId },
    }),
  );

  for (const material of reviewMaterials) {
    add("topic_review", [material.name.toLowerCase()], {
      key: `topic_review:${material.id}`,
      spaceId: material.spaceId,
      spaceName: material.spaceName,
      title: clip(`Confirm topics for ${material.name}`),
      detail: `${material.name} has topics ready to confirm`,
      actionLabel: "Confirm topics",
      href: `/spaces/${material.spaceId}/materials/${material.id}/topics`,
      plan: { kind: "review_topics", materialId: material.id },
    });
  }

  const compare = (a: (string | number)[], b: (string | number)[]) => {
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      return typeof a[i] === "number" ? (a[i] as number) - (b[i] as number) : String(a[i]).localeCompare(String(b[i]));
    }
    return 0;
  };
  return SUGGESTION_KINDS.flatMap((kind) =>
    byKind
      .get(kind)!
      .sort((a, b) => compare(a.sort, b.sort))
      .map(({ suggestion }) => {
        const { plan } = suggestion;
        const target = plan.topicId ?? plan.setId ?? plan.materialId;
        return { ...suggestion, inPlan: inPlanKeys.has(`${plan.kind}:${target}`) };
      }),
  );
}
