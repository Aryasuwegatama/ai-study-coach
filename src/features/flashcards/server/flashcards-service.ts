import { and, asc, desc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { ApiError } from "@/lib/api-errors";
import { db } from "@/server/db/db-client";
import { chunks, deckSessions, itemSources, learningItems, materials, studySets, studySpaces, topics } from "@/server/db/schema";
import { requireSpace } from "@/server/auth/auth-space-access";
import type { SessionUser } from "@/server/auth/auth-session";
import { quizError, requireSet, toSetResponse } from "@/features/quizzes/server";
import {
  FLASHCARD_API_ERRORS,
  type DeckListItemResponse,
  type DeckSessionResponse,
  type FlashcardApiErrorCode,
  type LatestSessionSummary,
  type PracticeCard,
  type RateCardRequest,
  type Rating,
  type RatingResponse,
} from "../flashcards-schemas";

type SessionRow = typeof deckSessions.$inferSelect;
type SetRow = typeof studySets.$inferSelect;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CARD_KINDS = ["recall", "short_answer"];

export function flashcardError(code: FlashcardApiErrorCode): ApiError {
  const { status, message } = FLASHCARD_API_ERRORS[code];
  return new ApiError(code, message, status);
}

function hasPgCode(error: unknown, code: string): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code === code || e?.cause?.code === code;
}

/** Active cards that still cite a chunk: a card whose material was deleted leaves practice (PRD Section 2). */
const practisable = (setId: string) =>
  and(
    eq(learningItems.setId, setId),
    eq(learningItems.status, "active"),
    inArray(learningItems.kind, CARD_KINDS),
    exists(db.select({ one: sql`1` }).from(itemSources).where(eq(itemSources.itemId, learningItems.id))),
  );

/** A deck (not a quiz) the user owns, in a space that isn't deleted; a quiz id is "not found". */
async function requireDeck(setId: string, user: SessionUser): Promise<SetRow> {
  const set = await requireSet(setId, user);
  if (set.kind !== "deck") throw quizError("SET_NOT_FOUND");
  return set;
}

async function requireSession(sessionId: string, user: SessionUser): Promise<SessionRow> {
  if (!UUID.test(sessionId)) throw flashcardError("DECK_SESSION_NOT_FOUND");
  const [row] = await db
    .select({ session: deckSessions })
    .from(deckSessions)
    .innerJoin(studySpaces, eq(studySpaces.id, deckSessions.spaceId))
    .where(and(eq(deckSessions.id, sessionId), eq(deckSessions.studentId, user.id), eq(studySpaces.ownerId, user.id), isNull(studySpaces.deletedAt)))
    .limit(1);
  if (!row) throw flashcardError("DECK_SESSION_NOT_FOUND");
  return row.session;
}

/** Tallies of a session's ratings over the cards that can still be practised. */
function tally(ratings: SessionRow["ratings"], cardIds: string[]) {
  const rated = cardIds.filter((id) => ratings[id] !== undefined);
  const gotIt = rated.filter((id) => ratings[id] === "got_it").length;
  return { ratedCount: rated.length, totalCount: cardIds.length, gotIt, again: rated.length - gotIt };
}

// ---------------------------------------------------------------------------
// The Deck Library's list
// ---------------------------------------------------------------------------

/**
 * Each deck with the student's newest session and how many cards can still
 * be practised. Three queries for the whole list (sets, the student's
 * sessions, practisable counts), not one per deck.
 */
export async function listDecks(user: SessionUser, spaceId: string): Promise<DeckListItemResponse[]> {
  const space = await requireSpace(spaceId, user);
  const rows = await db
    .select()
    .from(studySets)
    .where(and(eq(studySets.spaceId, space.id), eq(studySets.kind, "deck")))
    .orderBy(desc(studySets.createdAt));
  if (rows.length === 0) return [];
  const setIds = rows.map((r) => r.id);

  const sessions = await db
    .select()
    .from(deckSessions)
    .where(and(inArray(deckSessions.setId, setIds), eq(deckSessions.studentId, user.id)))
    .orderBy(desc(deckSessions.startedAt));
  const latestBySet = new Map<string, SessionRow>();
  for (const s of sessions) if (!latestBySet.has(s.setId)) latestBySet.set(s.setId, s);

  const cards = await db
    .select({ setId: learningItems.setId, id: learningItems.id })
    .from(learningItems)
    .where(
      and(
        inArray(learningItems.setId, setIds),
        eq(learningItems.status, "active"),
        inArray(learningItems.kind, CARD_KINDS),
        exists(db.select({ one: sql`1` }).from(itemSources).where(eq(itemSources.itemId, learningItems.id))),
      ),
    );
  const practisableBySet = new Map<string, string[]>();
  for (const c of cards) practisableBySet.set(c.setId, [...(practisableBySet.get(c.setId) ?? []), c.id]);

  return rows.map((row) => {
    const cardIds = practisableBySet.get(row.id) ?? [];
    const practisableCount = cardIds.length;
    const latest = latestBySet.get(row.id);
    let latestSession: LatestSessionSummary = { status: "none" };
    if (latest) {
      if (latest.status === "in_progress") {
        // Only ratings of cards still in the deck count: a card whose material was deleted drops out.
        const { ratedCount, totalCount } = tally(latest.ratings, cardIds);
        latestSession = { status: "in_progress", sessionId: latest.id, ratedCount, totalCount };
      } else {
        // A finished session's result is a record of that session, so it keeps every rating.
        const values = Object.values(latest.ratings);
        const gotIt = values.filter((r) => r === "got_it").length;
        latestSession = { status: "completed", sessionId: latest.id, gotIt, again: values.length - gotIt, total: values.length };
      }
    }
    return { ...toSetResponse(row), latestSession, practisableCount };
  });
}

// ---------------------------------------------------------------------------
// Practice
// ---------------------------------------------------------------------------

async function loadCards(setId: string): Promise<PracticeCard[]> {
  const rows = await db
    .select({ li: learningItems, topicName: topics.name })
    .from(learningItems)
    .innerJoin(topics, eq(topics.id, learningItems.topicId))
    .where(practisable(setId))
    .orderBy(asc(learningItems.position));
  if (!rows.length) return [];

  const sourceRows = await db
    .select({ itemId: itemSources.itemId, chunk: chunks, materialName: materials.originalName })
    .from(itemSources)
    .innerJoin(chunks, eq(chunks.id, itemSources.chunkId))
    .innerJoin(materials, eq(materials.id, chunks.materialId))
    .where(inArray(itemSources.itemId, rows.map((r) => r.li.id)));

  return rows.map(({ li, topicName }) => ({
    id: li.id,
    kind: li.kind as PracticeCard["kind"],
    topicId: li.topicId,
    topicName,
    front: li.prompt,
    back: li.answerText ?? "",
    keyPoints: li.kind === "short_answer" ? (li.keyPoints ?? []) : null,
    sources: sourceRows
      .filter((s) => s.itemId === li.id)
      .map((s) => ({
        chunkId: s.chunk.id,
        materialName: s.materialName,
        pages: s.chunk.pageStart === s.chunk.pageEnd ? `${s.chunk.pageStart}` : `${s.chunk.pageStart}-${s.chunk.pageEnd}`,
        excerpt: s.chunk.content.slice(0, 600),
      })),
  }));
}

async function toSessionResponse(session: SessionRow, set: SetRow, cards: PracticeCard[]): Promise<DeckSessionResponse> {
  return {
    id: session.id,
    setId: set.id,
    title: set.title,
    cardStyle: set.cardStyle as DeckSessionResponse["cardStyle"],
    status: session.status as DeckSessionResponse["status"],
    currentPosition: session.currentPosition,
    ratings: session.ratings,
    cards,
  };
}

/** Starts a practice session, or returns the in-progress one (`created: false`). */
export async function startPractice(user: SessionUser, setId: string): Promise<{ session: DeckSessionResponse; created: boolean }> {
  const set = await requireDeck(setId, user);
  if (set.status !== "ready") throw flashcardError("SET_NOT_READY");

  const cards = await loadCards(set.id);
  if (!cards.length) throw flashcardError("DECK_NO_CARDS");
  const cardIds = cards.map((c) => c.id);

  const inProgress = async () =>
    (await db.select().from(deckSessions).where(and(eq(deckSessions.setId, set.id), eq(deckSessions.studentId, user.id), eq(deckSessions.status, "in_progress"))))[0];

  const existing = await inProgress();
  if (existing) {
    if (tally(existing.ratings, cardIds).ratedCount < cardIds.length) {
      return { session: await toSessionResponse(existing, set, cards), created: false };
    }
    // Every card still in the deck was rated (the rest were removed since): that session is over, start a fresh one.
    await db
      .update(deckSessions)
      .set({ status: "completed", finishedAt: sql`now()`, updatedAt: sql`now()` })
      .where(and(eq(deckSessions.id, existing.id), eq(deckSessions.status, "in_progress")));
  }

  try {
    const [row] = await db.insert(deckSessions).values({ spaceId: set.spaceId, setId: set.id, studentId: user.id }).returning();
    return { session: await toSessionResponse(row, set, cards), created: true };
  } catch (error) {
    // The deck was deleted while this start waited.
    if (hasPgCode(error, "23503")) throw quizError("SET_NOT_FOUND");
    // Two tabs pressed Practise at once: the other one won, resume it.
    const winner = hasPgCode(error, "23505") ? await inProgress() : undefined;
    if (!winner) throw error;
    return { session: await toSessionResponse(winner, set, cards), created: false };
  }
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

function toRatingResponse(session: SessionRow, cardIds: string[]): RatingResponse {
  return { session: { status: session.status as RatingResponse["session"]["status"], currentPosition: session.currentPosition, ...tally(session.ratings, cardIds) } };
}

/**
 * Saves a rating (called when the student presses Next). Setting a value, not
 * adding one, makes a retry or a double click harmless, so there is no request
 * key. Locks the session row so two ratings at once can't lose one.
 */
export async function rateCard(user: SessionUser, itemId: string, input: RateCardRequest): Promise<RatingResponse> {
  const owned = await requireSession(input.sessionId, user);
  if (!UUID.test(itemId)) throw flashcardError("ITEM_NOT_FOUND");
  const [item] = await db
    .select({ id: learningItems.id, position: learningItems.position })
    .from(learningItems)
    .where(and(eq(learningItems.id, itemId), eq(learningItems.setId, owned.setId), inArray(learningItems.kind, CARD_KINDS)));
  if (!item) throw flashcardError("ITEM_NOT_FOUND");

  const cardIds = (await db.select({ id: learningItems.id }).from(learningItems).where(practisable(owned.setId))).map((r) => r.id);

  return db.transaction(async (tx) => {
    const [locked] = await tx.select().from(deckSessions).where(eq(deckSessions.id, owned.id)).for("update");
    // Gone: its deck was deleted while this request waited.
    if (!locked) throw flashcardError("DECK_SESSION_NOT_FOUND");
    if (locked.status === "completed") {
      if (locked.ratings[item.id] === input.rating) return toRatingResponse(locked, cardIds);
      throw flashcardError("DECK_SESSION_COMPLETED");
    }
    const ratings: Record<string, Rating> = { ...locked.ratings, [item.id]: input.rating };
    const done = tally(ratings, cardIds).ratedCount >= cardIds.length;
    const [updated] = await tx
      .update(deckSessions)
      .set({
        ratings,
        currentPosition: Math.max(locked.currentPosition, item.position + 1),
        // The database clock, like the other timestamps the dashboard compares.
        updatedAt: sql`now()`,
        ...(done ? { status: "completed", finishedAt: sql`now()` } : {}),
      })
      .where(eq(deckSessions.id, locked.id))
      .returning();
    return toRatingResponse(updated, cardIds);
  });
}
