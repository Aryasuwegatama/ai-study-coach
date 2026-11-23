#!/usr/bin/env tsx
/**
 * Verifies T-18: flashcard practice sessions and ratings, and how decks reach
 * My Plan and the dashboard, end to end through the route handlers against the
 * dev database. Decks are seeded directly (`check:quiz-generation` covers how
 * they are generated); no AI is called.
 *
 * Run with: pnpm run check:flashcards
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { randomUUID } from "node:crypto";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { buildTestAuth } from "../src/server/auth/auth-test-instance";
import type { SessionUser } from "../src/server/auth/auth-session";
import { db } from "../src/server/db/db-client";
import {
  attemptItems,
  chunks,
  deckSessions,
  itemSources,
  learningItems,
  materials,
  materialTopics,
  revisionItems,
  studySets,
  studySpaces,
  topics,
} from "../src/server/db/schema";
import { normalizePrompt } from "../src/features/quizzes/quizzes-schemas";
import type { AttemptResponse } from "../src/features/attempts/attempts-schemas";
import type { DeckListItemResponse, DeckSessionResponse, RatingResponse } from "../src/features/flashcards/flashcards-schemas";
import type { PlanItemResponse, Suggestion } from "../src/features/plan/plan-schemas";
import { getDashboardSummary } from "../src/features/dashboard/server/dashboard-service";
import { getActivity } from "../src/features/progress/server";
import { POST as practiceRoute } from "../src/app/api/sets/[id]/practice/route";
import { POST as ratingRoute } from "../src/app/api/items/[id]/rating/route";
import { DELETE as deleteSetRoute, PATCH as renameSetRoute } from "../src/app/api/sets/[id]/route";
import { GET as listRoute } from "../src/app/api/spaces/[spaceId]/sets/route";
import { POST as startAttemptRoute } from "../src/app/api/sets/[id]/attempts/route";
import { PATCH as answerRoute } from "../src/app/api/attempts/[id]/answers/route";
import { GET as spaceProgressRoute } from "../src/app/api/spaces/[spaceId]/progress/route";
import { GET as mistakesRoute } from "../src/app/api/revision/mistakes/route";
import { GET as suggestionsRoute } from "../src/app/api/plan/suggestions/route";
import { GET as planListRoute, POST as planCreateRoute } from "../src/app/api/plan/items/route";

type CheckResult = { name: string; ok: boolean; message: string };
const results: CheckResult[] = [];
const BASE = "http://localhost:3000";

function check(name: string, ok: boolean, message = "") {
  results.push({ name, ok, message });
}
function safeMessage(error: unknown): string {
  const raw = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  return raw.replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]").slice(0, 600);
}

type Session = { userId: string; cookie: string };
function req(path: string, session: Session | null, method = "GET", body?: unknown) {
  const headers = new Headers({ "content-type": "application/json" });
  if (session) headers.set("cookie", session.cookie);
  return new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const p = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
const errorCode = async (res: Response) => ((await res.json()) as { error?: { code?: string } }).error?.code;

async function main() {
  const test = (await buildTestAuth().$context).test;
  const stamp = Date.now();
  const sessions: Session[] = [];
  const users: SessionUser[] = [];
  for (const label of ["a", "b"]) {
    const email = `check-flashcards-${label}-${stamp}@example.com`;
    const saved = await test.saveUser(test.createUser({ email, name: `Check Flashcards ${label}`, role: "student" }));
    const { headers } = await test.login({ userId: saved.id });
    sessions.push({ userId: saved.id, cookie: headers.get("cookie") ?? "" });
    users.push({ id: saved.id, email, name: `Check Flashcards ${label}`, role: "student", timeZone: null });
  }

  try {
    await e2e(sessions[0], sessions[1], users[0]);
  } catch (error) {
    check("End-to-end run completed", false, safeMessage(error));
  } finally {
    for (const s of sessions) await test.deleteUser(s.userId);
    const [{ left }] = await db
      .select({ left: count() })
      .from(deckSessions)
      .where(inArray(deckSessions.studentId, sessions.map((s) => s.userId)));
    check("Deleting a user deletes their practice sessions (no FK blocks it)", left === 0);
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.ok || !r.message ? "" : ` — ${r.message}`}`);
  const failedCount = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failedCount}/${results.length} passed`);
  process.exit(failedCount ? 1 : 0);
}

type SeedCard = { kind: "recall" | "short_answer"; chunkId: string; topicId: string };

/** A ready deck whose cards sit at positions 0, 1, 2…; each card cites one chunk. */
async function seedDeck(
  spaceId: string,
  title: string,
  cards: SeedCard[],
  over: Partial<typeof studySets.$inferInsert> = {},
) {
  const [set] = await db
    .insert(studySets)
    .values({
      spaceId,
      kind: "deck",
      title,
      cardStyle: "mix",
      materialIds: [],
      topicIds: [...new Set(cards.map((c) => c.topicId))],
      requestedCount: cards.length,
      generatedCount: cards.length,
      status: "ready",
      ...over,
    })
    .returning();
  const items = cards.length
    ? await db
        .insert(learningItems)
        .values(
          cards.map((c, i) => ({
            setId: set.id,
            spaceId,
            topicId: c.topicId,
            kind: c.kind,
            position: i,
            prompt: `${title} front ${i}?`,
            answerText: `${title} back ${i}.`,
            keyPoints: c.kind === "short_answer" ? [`${title} point A${i}`, `${title} point B${i}`] : null,
            normalizedPrompt: normalizePrompt(`${set.id} front ${i}`),
            promptVersion: "cards-v1",
          })),
        )
        .returning()
    : [];
  if (items.length) await db.insert(itemSources).values(items.map((it, i) => ({ spaceId, itemId: it.id, chunkId: cards[i].chunkId })));
  return { set, items: items.sort((x, y) => x.position - y.position) };
}

async function e2e(a: Session, b: Session, userA: SessionUser) {
  const stamp = Date.now();
  // --- Seed ---------------------------------------------------------------------------------
  const [space] = await db.insert(studySpaces).values({ ownerId: a.userId, name: "Flashcards check" }).returning();
  const [spaceB] = await db.insert(studySpaces).values({ ownerId: b.userId, name: "Other student's space" }).returning();
  const mat1 = randomUUID();
  const mat2 = randomUUID();
  const matB = randomUUID();
  await db.insert(materials).values([
    { id: mat1, spaceId: space.id, originalName: "notes.pdf", blobPath: `check/${mat1}.pdf`, status: "ready" },
    { id: mat2, spaceId: space.id, originalName: "slides.pptx", blobPath: `check/${mat2}.pptx`, status: "ready" },
    { id: matB, spaceId: spaceB.id, originalName: "b.pdf", blobPath: `check/${matB}.pdf`, status: "ready" },
  ]);
  const [c1] = await db.insert(chunks).values({ materialId: mat1, spaceId: space.id, chunkIndex: 0, content: "Keys identify rows. ".repeat(60), pageStart: 3, pageEnd: 4 }).returning();
  const [c2] = await db.insert(chunks).values({ materialId: mat2, spaceId: space.id, chunkIndex: 0, content: "Indexes speed up lookups.", pageStart: 7, pageEnd: 7 }).returning();
  const [cB] = await db.insert(chunks).values({ materialId: matB, spaceId: spaceB.id, chunkIndex: 0, content: "B's text.", pageStart: 1, pageEnd: 1 }).returning();
  const mk = (name: string, spaceId = space.id) => ({ spaceId, name, normalizedName: name.toLowerCase().replace(/\s/g, ""), status: "confirmed", origin: "ai" });
  const [tKeys, tIdx] = await db.insert(topics).values([mk("Keys"), mk("Indexing")]).returning();
  const [tB] = await db.insert(topics).values(mk("B topic", spaceB.id)).returning();
  await db.insert(materialTopics).values([
    { spaceId: space.id, materialId: mat1, topicId: tKeys.id },
    { spaceId: space.id, materialId: mat2, topicId: tIdx.id },
  ]);

  // The main deck: 4 cards in order; short-answer cards carry key points.
  const main = await seedDeck(space.id, "Keys and indexes", [
    { kind: "recall", chunkId: c1.id, topicId: tKeys.id },
    { kind: "short_answer", chunkId: c1.id, topicId: tKeys.id },
    { kind: "recall", chunkId: c2.id, topicId: tIdx.id },
    { kind: "short_answer", chunkId: c2.id, topicId: tIdx.id },
  ]);
  const other = await seedDeck(space.id, "Second deck", [{ kind: "recall", chunkId: c1.id, topicId: tKeys.id }, { kind: "recall", chunkId: c1.id, topicId: tKeys.id }]);
  const bDeck = await seedDeck(spaceB.id, "B deck", [{ kind: "recall", chunkId: cB.id, topicId: tB.id }]);
  const generating = await seedDeck(space.id, "Generating deck", [], { status: "generating", generatedCount: 0 });
  const failed = await seedDeck(space.id, "Failed deck", [], { status: "failed", generatedCount: 0, errorCode: "NO_CARDS" });
  const [quizSet] = await db
    .insert(studySets)
    .values({ spaceId: space.id, kind: "quiz", title: "A quiz", materialIds: [], topicIds: [tKeys.id], requestedCount: 5, generatedCount: 5, status: "ready" })
    .returning();

  const start = (s: Session | null, id: string) => practiceRoute(req(`/api/sets/${id}/practice`, s, "POST"), p({ id }));
  const rate = (s: Session | null, itemId: string, body: unknown) => ratingRoute(req(`/api/items/${itemId}/rating`, s, "POST", body), p({ id: itemId }));
  const sessionOf = async (res: Response) => ((await res.json()) as { session: DeckSessionResponse }).session;
  const ratingOf = async (res: Response) => ((await res.json()) as RatingResponse).session;
  const rowOf = async (id: string) => (await db.select().from(deckSessions).where(eq(deckSessions.id, id)))[0];

  // --- Starting a session -----------------------------------------------------------------------
  let res = await start(null, main.set.id);
  check("Start: signed out → 401", res.status === 401);
  res = await start(a, main.set.id);
  const s1 = await sessionOf(res);
  check("Start: 201 with an in-progress session at position 0", res.status === 201 && s1.status === "in_progress" && s1.currentPosition === 0 && Object.keys(s1.ratings).length === 0);
  check(
    "Start: cards in published order, with front, back, kind and topic",
    s1.cards.map((c) => c.id).join() === main.items.map((i) => i.id).join() &&
      s1.cards.every((c, i) => c.front === `Keys and indexes front ${i}?` && c.back === `Keys and indexes back ${i}.`) &&
      s1.cards.map((c) => c.kind).join() === "recall,short_answer,recall,short_answer" &&
      s1.cards[0].topicName === "Keys" && s1.cards[2].topicName === "Indexing",
  );
  check(
    "Start: short-answer cards carry 2–4 key points, recall cards none",
    s1.cards.filter((c) => c.kind === "short_answer").every((c) => c.keyPoints && c.keyPoints.length >= 2 && c.keyPoints.length <= 4) && s1.cards.filter((c) => c.kind === "recall").every((c) => c.keyPoints === null),
  );
  check(
    "Start: every card has its source with material name, pages and an excerpt of at most 600 characters",
    s1.cards.every((c) => c.sources.length === 1) && s1.cards[0].sources[0].materialName === "notes.pdf" && s1.cards[0].sources[0].pages === "3-4" && s1.cards[0].sources[0].excerpt.length === 600 && s1.cards[2].sources[0].pages === "7",
  );
  check("Start: the session carries the deck title and card style", s1.title === "Keys and indexes" && s1.cardStyle === "mix" && s1.setId === main.set.id);
  res = await start(a, main.set.id);
  const s1again = await sessionOf(res);
  check("Start again: 200, the same session", res.status === 200 && s1again.id === s1.id);

  // A start race on a fresh deck: two requests at once, one session.
  const [r1, r2] = await Promise.all([start(a, other.set.id), start(a, other.set.id)]);
  const [ra, rb] = [await sessionOf(r1), await sessionOf(r2)];
  const raceRows = await db.select().from(deckSessions).where(and(eq(deckSessions.setId, other.set.id), eq(deckSessions.studentId, a.userId)));
  check("Start race: two at once → one session, both responses return it", ra.id === rb.id && raceRows.length === 1 && [r1.status, r2.status].every((s) => s === 200 || s === 201) && [r1.status, r2.status].includes(201));

  // Not startable.
  res = await start(a, quizSet.id);
  check("Start: a quiz id → 404 SET_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "SET_NOT_FOUND");
  res = await start(b, main.set.id);
  check("Start: someone else's deck → 404 SET_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "SET_NOT_FOUND");
  res = await start(a, "not-a-uuid");
  check("Start: a malformed id → 404", res.status === 404);
  res = await start(a, generating.set.id);
  check("Start: a generating deck → 409 SET_NOT_READY", res.status === 409 && (await errorCode(res)) === "SET_NOT_READY");
  res = await start(a, failed.set.id);
  check("Start: a failed deck → 409 SET_NOT_READY", res.status === 409 && (await errorCode(res)) === "SET_NOT_READY");

  // --- Rating -------------------------------------------------------------------------------------
  const before = {
    progress: JSON.stringify(await (await spaceProgressRoute(req(`/api/spaces/${space.id}/progress`, a), p({ spaceId: space.id }))).json()),
    mistakes: JSON.stringify(await (await mistakesRoute(req(`/api/revision/mistakes?spaceId=${space.id}`, a))).json()),
  };
  res = await rate(a, main.items[0].id, { sessionId: s1.id, rating: "again" });
  let rated = await ratingOf(res);
  check("Rate: saved; position moves to just after the card; 1 of 4 rated", res.status === 200 && rated.status === "in_progress" && rated.currentPosition === 1 && rated.ratedCount === 1 && rated.totalCount === 4 && rated.again === 1 && rated.gotIt === 0, JSON.stringify(rated));
  res = await rate(a, main.items[0].id, { sessionId: s1.id, rating: "again" });
  rated = await ratingOf(res);
  check("Rate: the same rating twice changes nothing (no request key needed)", res.status === 200 && rated.ratedCount === 1 && rated.currentPosition === 1 && Object.keys((await rowOf(s1.id)).ratings).length === 1);
  res = await rate(a, main.items[0].id, { sessionId: s1.id, rating: "got_it" });
  rated = await ratingOf(res);
  check("Rate: sending a different rating for the same card sets it (still 1 rated)", res.status === 200 && rated.ratedCount === 1 && rated.gotIt === 1 && rated.again === 0);
  res = await rate(a, main.items[1].id, { sessionId: s1.id, rating: "got_it" });
  rated = await ratingOf(res);
  check("Rate: card 2 → position 2, 2 of 4 rated", rated.currentPosition === 2 && rated.ratedCount === 2 && rated.gotIt === 2);
  res = await rate(a, main.items[0].id, { sessionId: s1.id, rating: "got_it" });
  rated = await ratingOf(res);
  check("Rate: an earlier card again never moves the position backwards", rated.currentPosition === 2);
  res = await start(a, main.set.id);
  const resumed = await sessionOf(res);
  check("Resume: the same session with both ratings and position 2", res.status === 200 && resumed.id === s1.id && resumed.currentPosition === 2 && resumed.ratings[main.items[0].id] === "got_it" && resumed.ratings[main.items[1].id] === "got_it");

  // Refusals.
  res = await rate(a, other.items[0].id, { sessionId: s1.id, rating: "got_it" });
  check("Rate: a card from another deck → 404 ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "ITEM_NOT_FOUND");
  res = await rate(a, bDeck.items[0].id, { sessionId: s1.id, rating: "got_it" });
  check("Rate: another student's card → 404 ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "ITEM_NOT_FOUND");
  res = await rate(b, main.items[2].id, { sessionId: s1.id, rating: "got_it" });
  check("Rate: someone else's session → 404 DECK_SESSION_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "DECK_SESSION_NOT_FOUND");
  res = await rate(a, main.items[2].id, { sessionId: randomUUID(), rating: "got_it" });
  check("Rate: an unknown session → 404 DECK_SESSION_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "DECK_SESSION_NOT_FOUND");
  res = await rate(a, "not-a-uuid", { sessionId: s1.id, rating: "got_it" });
  check("Rate: a malformed card id → 404 ITEM_NOT_FOUND", res.status === 404 && (await errorCode(res)) === "ITEM_NOT_FOUND");
  res = await rate(a, main.items[2].id, { sessionId: s1.id, rating: "perfect" });
  check("Rate: an invalid rating → 400", res.status === 400);
  res = await rate(a, main.items[2].id, { sessionId: "nope", rating: "got_it" });
  check("Rate: a malformed session id → 400", res.status === 400);
  res = await rate(a, main.items[2].id, { sessionId: s1.id, rating: "got_it", studentId: b.userId, ratedCount: 99, status: "completed" });
  rated = await ratingOf(res);
  check("Rate: a client-sent student id, count or status is ignored", res.status === 200 && rated.status === "in_progress" && rated.ratedCount === 3 && (await rowOf(s1.id)).studentId === a.userId);
  res = await rate(null, main.items[2].id, { sessionId: s1.id, rating: "got_it" });
  check("Rate: signed out → 401", res.status === 401);

  // Finishing.
  res = await rate(a, main.items[3].id, { sessionId: s1.id, rating: "again" });
  rated = await ratingOf(res);
  const done = await rowOf(s1.id);
  check("Rate: the last unrated card completes the session (finished_at set), 3 Got it · 1 Again", rated.status === "completed" && rated.ratedCount === 4 && rated.gotIt === 3 && rated.again === 1 && done.status === "completed" && done.finishedAt !== null);
  res = await rate(a, main.items[3].id, { sessionId: s1.id, rating: "again" });
  const sameAgain = await ratingOf(res);
  check("Rate after completion: the same rating again returns the same result", res.status === 200 && JSON.stringify(sameAgain) === JSON.stringify(rated));
  res = await rate(a, main.items[3].id, { sessionId: s1.id, rating: "got_it" });
  check("Rate after completion: a different rating → 409 DECK_SESSION_COMPLETED", res.status === 409 && (await errorCode(res)) === "DECK_SESSION_COMPLETED" && (await rowOf(s1.id)).ratings[main.items[3].id] === "again");

  // Practise again.
  res = await start(a, main.set.id);
  const s2 = await sessionOf(res);
  check("Practise again: 201, a new session at position 0 with no ratings", res.status === 201 && s2.id !== s1.id && s2.currentPosition === 0 && Object.keys(s2.ratings).length === 0 && s2.cards.length === 4);
  check("Practise again: the first session keeps its ratings", Object.keys((await rowOf(s1.id)).ratings).length === 4);

  // Ratings never touch mastery, mistakes or quiz data.
  const after = {
    progress: JSON.stringify(await (await spaceProgressRoute(req(`/api/spaces/${space.id}/progress`, a), p({ spaceId: space.id }))).json()),
    mistakes: JSON.stringify(await (await mistakesRoute(req(`/api/revision/mistakes?spaceId=${space.id}`, a))).json()),
  };
  const [{ attemptRows }] = await db.select({ attemptRows: count() }).from(attemptItems).where(eq(attemptItems.spaceId, space.id));
  const [{ mistakeRows }] = await db.select({ mistakeRows: count() }).from(revisionItems).where(eq(revisionItems.spaceId, space.id));
  check("Ratings never change mastery or the mistakes list (before and after are identical)", before.progress === after.progress && before.mistakes === after.mistakes);
  check("Ratings never create attempt answers or mistakes", attemptRows === 0 && mistakeRows === 0);

  // --- The list -------------------------------------------------------------------------------------
  const list = async (s: Session) =>
    ((await (await listRoute(req(`/api/spaces/${space.id}/sets?kind=deck`, s), p({ spaceId: space.id }))).json()) as { sets: DeckListItemResponse[] }).sets;
  let decks = await list(a);
  const listedMain = decks.find((d) => d.id === main.set.id)!;
  check(
    "List: the newest session is shown (the fresh in-progress one, 0 of 4 rated), practisableCount 4, decks only",
    decks.every((d) => d.kind === "deck") && listedMain.latestSession.status === "in_progress" && listedMain.latestSession.sessionId === s2.id && listedMain.latestSession.ratedCount === 0 && listedMain.latestSession.totalCount === 4 && listedMain.practisableCount === 4,
    JSON.stringify(listedMain.latestSession),
  );
  const listedOther = decks.find((d) => d.id === other.set.id)!;
  check("List: an in-progress deck with no rating yet and a generating deck with no session", listedOther.latestSession.status === "in_progress" && decks.find((d) => d.id === generating.set.id)!.latestSession.status === "none");
  // Rate two cards on the new session, then complete the other deck's session: summaries.
  await rate(a, main.items[0].id, { sessionId: s2.id, rating: "got_it" });
  await rate(a, main.items[1].id, { sessionId: s2.id, rating: "again" });
  await rate(a, other.items[0].id, { sessionId: ra.id, rating: "got_it" });
  await rate(a, other.items[1].id, { sessionId: ra.id, rating: "again" });
  decks = await list(a);
  const listedMain2 = decks.find((d) => d.id === main.set.id)!;
  const listedOther2 = decks.find((d) => d.id === other.set.id)!;
  check("List: in progress shows ratedCount 2 of 4", listedMain2.latestSession.status === "in_progress" && listedMain2.latestSession.ratedCount === 2 && listedMain2.latestSession.totalCount === 4);
  check("List: a completed deck shows Got it 1 · Again 1 of 2", listedOther2.latestSession.status === "completed" && listedOther2.latestSession.gotIt === 1 && listedOther2.latestSession.again === 1 && listedOther2.latestSession.total === 2);
  // Topic tags and renaming a deck (UI redesign, 2026-11-23).
  check(
    "List: each deck carries its topics with names, in the chosen order (the card's tags)",
    listedMain.topics.length > 0 && listedMain.topics.map((t) => t.id).join() === listedMain.topicIds.join() && listedMain.topics.every((t) => t.name.length > 0),
  );
  let renameRes = await renameSetRoute(req(`/api/sets/${main.set.id}`, a, "PATCH", { title: "  Keys deck  " }), p({ id: main.set.id }));
  check("Rename a deck: 200, trimmed", renameRes.status === 200 && ((await renameRes.json()) as { set: { title: string } }).set.title === "Keys deck");
  renameRes = await renameSetRoute(req(`/api/sets/${main.set.id}`, b, "PATCH", { title: "Hijacked" }), p({ id: main.set.id }));
  check("Rename a deck: someone else's → 404 SET_NOT_FOUND", renameRes.status === 404 && (await errorCode(renameRes)) === "SET_NOT_FOUND");
  renameRes = await renameSetRoute(req(`/api/sets/${main.set.id}`, a, "PATCH", { title: "Keys and indexes" }), p({ id: main.set.id }));
  check("Rename a deck: back to its original name", renameRes.status === 200);
  check("List: another student sees none of these decks, and their own space is 404 to us", (await (await listRoute(req(`/api/spaces/${space.id}/sets?kind=deck`, b), p({ spaceId: space.id }))).status) === 404);

  // --- Cards from a deleted material leave practice -----------------------------------------------
  await db.delete(materials).where(eq(materials.id, mat2));
  // The 2 cards still sourced were both rated already, so that session is over and Practise starts a fresh one.
  res = await start(a, main.set.id);
  const s3 = await sessionOf(res);
  check(
    "Deleted material: its cards are left out of practice (2 of 4 remain); a session with every remaining card rated is finished and a fresh one starts",
    res.status === 201 && s3.id !== s2.id && s3.cards.length === 2 && s3.cards.every((c) => c.topicName === "Keys" && c.sources.length > 0) && (await rowOf(s2.id)).status === "completed" && s3.currentPosition === 0,
    `${res.status} ${s3.cards.length}`,
  );
  res = await rate(a, main.items[0].id, { sessionId: s3.id, rating: "again" });
  rated = await ratingOf(res);
  check("Deleted material: the new session counts only the 2 practisable cards (1 of 2 rated)", rated.ratedCount === 1 && rated.totalCount === 2 && rated.status === "in_progress");
  res = await start(a, main.set.id);
  const s3resumed = await sessionOf(res);
  check("Deleted material: resuming returns the same session with the 2 cards", res.status === 200 && s3resumed.id === s3.id && s3resumed.cards.length === 2);
  decks = await list(a);
  check("Deleted material: practisableCount drops to 2 and the in-progress summary counts only those", decks.find((d) => d.id === main.set.id)!.practisableCount === 2);
  await db.delete(materials).where(eq(materials.id, mat1));
  res = await start(a, main.set.id);
  check("Every material deleted: 409 DECK_NO_CARDS", res.status === 409 && (await errorCode(res)) === "DECK_NO_CARDS");
  decks = await list(a);
  check("Every material deleted: practisableCount 0 (the screen shows \"This deck's material was deleted\")", decks.find((d) => d.id === main.set.id)!.practisableCount === 0);
  res = await deleteSetRoute(req(`/api/sets/${main.set.id}`, a, "DELETE"), p({ id: main.set.id }));
  check("Delete: a deck whose material was deleted can still be deleted (204), its sessions go", res.status === 204 && (await db.select({ n: count() }).from(deckSessions).where(eq(deckSessions.setId, main.set.id)))[0].n === 0);

  // Rated cards whose material is then deleted stop counting as rated everywhere "N of M rated" is shown:
  // rate both cards of material A, delete A, and the 2 unrated cards of material B are "0 of 2", not "2 of 2".
  const [splitMatA] = await db.insert(materials).values({ id: randomUUID(), spaceId: space.id, originalName: "a.pdf", blobPath: `check/a-${stamp}.pdf`, status: "ready" }).returning();
  const [splitMatB] = await db.insert(materials).values({ id: randomUUID(), spaceId: space.id, originalName: "b.pdf", blobPath: `check/b-${stamp}.pdf`, status: "ready" }).returning();
  const [splitChunkA] = await db.insert(chunks).values({ materialId: splitMatA.id, spaceId: space.id, chunkIndex: 0, content: "A text.", pageStart: 1, pageEnd: 1 }).returning();
  const [splitChunkB] = await db.insert(chunks).values({ materialId: splitMatB.id, spaceId: space.id, chunkIndex: 0, content: "B text.", pageStart: 1, pageEnd: 1 }).returning();
  const split = await seedDeck(space.id, "Split deck", [splitChunkA, splitChunkA, splitChunkB, splitChunkB].map((c) => ({ kind: "recall" as const, chunkId: c.id, topicId: tKeys.id })));
  const ss = await sessionOf(await start(a, split.set.id));
  await rate(a, split.items[0].id, { sessionId: ss.id, rating: "got_it" });
  await rate(a, split.items[1].id, { sessionId: ss.id, rating: "again" });
  await db.delete(materials).where(eq(materials.id, splitMatA.id));
  const splitListed = (await list(a)).find((d) => d.id === split.set.id)!;
  check(
    "Deleted material after rating: the library shows 0 of 2 rated (ratings of removed cards don't count)",
    splitListed.latestSession.status === "in_progress" && splitListed.latestSession.ratedCount === 0 && splitListed.latestSession.totalCount === 2,
    JSON.stringify(splitListed.latestSession),
  );
  const splitSuggestion = (await (await suggestionsRoute(req(`/api/plan/suggestions`, a))).json() as { suggestions: Suggestion[] }).suggestions.find((s) => s.key === `unfinished_deck:${split.set.id}`);
  check("Deleted material after rating: the suggestion says 0 of 2 rated", splitSuggestion?.detail === "Resume Split deck, 0 of 2 rated", splitSuggestion?.detail);
  const splitResume = (await getDashboardSummary(userA)).resume;
  check("Deleted material after rating: the dashboard Resume card says 0 of 2", splitResume?.kind === "deck" && splitResume.title === "Split deck" && splitResume.rated === 0 && splitResume.total === 2, JSON.stringify(splitResume));
  await deleteSetRoute(req(`/api/sets/${split.set.id}`, a, "DELETE"), p({ id: split.set.id }));
  await db.delete(materials).where(eq(materials.id, splitMatB.id));

  // --- My Plan and the dashboard -----------------------------------------------------------------------
  const [mat3] = await db.insert(materials).values({ id: randomUUID(), spaceId: space.id, originalName: "later.pdf", blobPath: `check/later-${stamp}.pdf`, status: "ready" }).returning();
  const [c3] = await db.insert(chunks).values({ materialId: mat3.id, spaceId: space.id, chunkIndex: 0, content: "Later text.", pageStart: 1, pageEnd: 1 }).returning();
  await db.insert(materialTopics).values({ spaceId: space.id, materialId: mat3.id, topicId: tKeys.id });
  const planDeck = await seedDeck(space.id, "Resume me", Array.from({ length: 5 }, () => ({ kind: "recall" as const, chunkId: c3.id, topicId: tKeys.id })));
  const suggestions = async (s: Session) => ((await (await suggestionsRoute(req(`/api/plan/suggestions`, s))).json()) as { suggestions: Suggestion[] }).suggestions;
  check("Suggestions: no unfinished_deck before any practice", !(await suggestions(a)).some((s) => s.kind === "unfinished_deck" && s.key === `unfinished_deck:${planDeck.set.id}`));

  const ps = await sessionOf(await start(a, planDeck.set.id));
  await rate(a, planDeck.items[0].id, { sessionId: ps.id, rating: "got_it" });
  await rate(a, planDeck.items[1].id, { sessionId: ps.id, rating: "again" });
  let all = await suggestions(a);
  const unfinished = all.find((s) => s.kind === "unfinished_deck" && s.key === `unfinished_deck:${planDeck.set.id}`);
  check(
    "Suggestions: an unfinished deck → \"Resume Resume me, 2 of 5 rated\" with the action Resume practice, linking to the deck",
    unfinished?.detail === "Resume Resume me, 2 of 5 rated" && unfinished.actionLabel === "Resume practice" && unfinished.href === `/spaces/${space.id}/flashcards/${planDeck.set.id}` && unfinished.plan.kind === "practise_deck" && unfinished.plan.setId === planDeck.set.id && !unfinished.inPlan,
    JSON.stringify(unfinished),
  );
  check("Suggestions: no due date, overdue or schedule wording", !/overdue|due|next review|review again in/i.test(JSON.stringify(all.filter((s) => s.kind === "unfinished_deck"))));

  // Rank: right after an unfinished quiz, before not-tested and topic-review ones.
  const quizItems = await db.insert(learningItems).values({ setId: quizSet.id, spaceId: space.id, topicId: tKeys.id, kind: "mcq", position: 0, prompt: "Quiz q?", options: ["a", "b", "c", "d"], correctIndex: 0, normalizedPrompt: `quizq-${stamp}`, promptVersion: "seed" }).returning();
  await db.insert(itemSources).values({ spaceId: space.id, itemId: quizItems[0].id, chunkId: c3.id });
  res = await startAttemptRoute(req(`/api/sets/${quizSet.id}/attempts`, a, "POST"), p({ id: quizSet.id }));
  const attempt = ((await res.json()) as { attempt: AttemptResponse }).attempt;
  all = await suggestions(a);
  const kinds = all.map((s) => s.kind);
  check("Suggestions: the unfinished deck ranks right after the unfinished quiz", kinds.indexOf("unfinished_quiz") >= 0 && kinds.indexOf("unfinished_deck") === kinds.indexOf("unfinished_quiz") + 1, kinds.join());

  // The dashboard's Resume card: whichever was touched last.
  let summary = await getDashboardSummary(userA);
  check("Dashboard: the quiz attempt started after the last rating is the Resume card", summary.resume?.kind === "quiz" && summary.resume.title === "A quiz", JSON.stringify(summary.resume));
  await rate(a, planDeck.items[2].id, { sessionId: ps.id, rating: "got_it" });
  summary = await getDashboardSummary(userA);
  check(
    "Dashboard: after rating another card the deck is the Resume card (3 of 5 rated, links to the deck)",
    summary.resume?.kind === "deck" && summary.resume.title === "Resume me" && summary.resume.rated === 3 && summary.resume.total === 5 && summary.resume.href === `/spaces/${space.id}/flashcards/${planDeck.set.id}`,
    JSON.stringify(summary.resume),
  );
  const q = attempt.questions![0];
  await answerRoute(req(`/api/attempts/${attempt.id}/answers`, a, "PATCH", { itemId: q.itemId, selectedIndex: 0 }), p({ id: attempt.id }));
  // Answers are stamped with the app's clock and ratings with the database's; this machine's clock can trail
  // the database's by a second or two, so restamp the answer with the database's to compare like with like.
  await db.update(attemptItems).set({ answeredAt: sql`now()` }).where(eq(attemptItems.attemptId, attempt.id));
  summary = await getDashboardSummary(userA);
  check("Dashboard: after answering a quiz question the quiz is the Resume card again", summary.resume?.kind === "quiz" && summary.resume.title === "A quiz");
  await rate(a, planDeck.items[3].id, { sessionId: ps.id, rating: "got_it" });
  summary = await getDashboardSummary(userA);
  check("Dashboard: and the deck again after the next rating (4 of 5)", summary.resume?.kind === "deck" && summary.resume.rated === 4);

  // Analytics "Your activity" (UI redesign, 2026-11-23): finished practice sessions and their ratings.
  const finished = await db
    .select({ ratings: deckSessions.ratings })
    .from(deckSessions)
    .where(and(eq(deckSessions.studentId, a.userId), eq(deckSessions.status, "completed")));
  const activity = await getActivity(userA, null);
  const ratedInFinished = finished.reduce((sum, r) => sum + Object.keys(r.ratings).length, 0);
  check(
    "Activity: this week's flashcard sessions and cards rated match the finished sessions (in-progress ones don't count)",
    activity.weeks.at(-1)!.flashcardSessions === finished.length && activity.weeks.at(-1)!.cardsRated === ratedInFinished,
    `${activity.weeks.at(-1)!.flashcardSessions}/${finished.length}, ${activity.weeks.at(-1)!.cardsRated}/${ratedInFinished}`,
  );
  check(
    "Activity: each finished session is its own Got it / Again split, oldest first, at most 10",
    activity.deckSessions.length === Math.min(finished.length, 10) &&
      activity.deckSessions.every((d, i) => d.gotIt + d.again > 0 && (i === 0 || d.finishedAt >= activity.deckSessions[i - 1].finishedAt)),
  );

  // Plan items.
  const create = (s: Session, body: unknown) => planCreateRoute(req("/api/plan/items", s, "POST", body));
  res = await create(a, { kind: "practise_deck", title: "Resume Resume me", setId: planDeck.set.id });
  const item = ((await res.json()) as { item: PlanItemResponse }).item;
  check("Plan: a practise_deck item → 201 with the link to the deck and the deck's space derived on the server", res.status === 201 && item.kind === "practise_deck" && item.href === `/spaces/${space.id}/flashcards/${planDeck.set.id}` && item.spaceId === space.id && item.setId === planDeck.set.id, JSON.stringify(item));
  res = await create(a, { kind: "practise_deck", title: "x", setId: bDeck.set.id });
  check("Plan: someone else's deck → 404", res.status === 404 && (await errorCode(res)) === "SET_NOT_FOUND");
  res = await create(a, { kind: "practise_deck", title: "x", setId: quizSet.id });
  check("Plan: a quiz id for a practise_deck item → 404", res.status === 404);
  res = await create(a, { kind: "practise_deck", title: "x", topicId: tKeys.id });
  check("Plan: a practise_deck item needs a setId (a topic id is wrong for it) → 400", res.status === 400);
  res = await create(a, { kind: "resume_quiz", title: "x", setId: planDeck.set.id });
  check("Plan: a resume_quiz item can't point at a deck → 404", res.status === 404);
  all = await suggestions(a);
  check("Suggestions: once added the deck suggestion shows In my plan", all.find((s) => s.key === `unfinished_deck:${planDeck.set.id}`)?.inPlan === true);

  // Completing the session removes the suggestion and the Resume card.
  res = await rate(a, planDeck.items[4].id, { sessionId: ps.id, rating: "again" });
  check("Rate: the deck's last card completes it", (await ratingOf(res)).status === "completed");
  all = await suggestions(a);
  check("Suggestions: a completed deck is no longer suggested", !all.some((s) => s.key === `unfinished_deck:${planDeck.set.id}`));
  summary = await getDashboardSummary(userA);
  check("Dashboard: Resume falls back to the quiz once the deck is finished", summary.resume?.kind === "quiz");

  // Deleting a deck takes its plan item's link away (the item keeps its title) and its suggestion.
  await start(a, planDeck.set.id);
  res = await deleteSetRoute(req(`/api/sets/${planDeck.set.id}`, a, "DELETE"), p({ id: planDeck.set.id }));
  const items = ((await (await planListRoute(req("/api/plan/items", a))).json()) as { items: PlanItemResponse[] }).items;
  const kept = items.find((i) => i.id === item.id)!;
  check("Delete a paused deck: 204; its plan item keeps its title but loses its link; its suggestion is gone", res.status === 204 && kept.title === "Resume Resume me" && kept.href === null && !(await suggestions(a)).some((s) => s.key.startsWith("unfinished_deck:")));
}

main().catch((error) => {
  console.error(safeMessage(error));
  process.exit(1);
});
