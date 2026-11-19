# Capstone 2 PRD v1.2 — Section 2: Product Rules & Screens

Version 1.2 · 2 November 2026 · Owner: Arya

The product follows the Capstone 1 Figma design, with five rules that keep it simple to build:

1. **Topics need confirmation.** AI suggests topics; the student confirms them before generating quizzes or flashcards.
2. **Quizzes can cover several topics.** Each question is tagged with one topic.
3. **Short answer is a flashcard style.** It is not a quiz question type.
4. **Students plan their own study.** The app shows analytics and suggests what to focus on; the student decides what to study and when. Mistakes can be re-answered whenever the student chooses and are checked automatically; reviewing mistakes never changes mastery. (Changed after lecturer feedback on 13 November 2026: no revision schedule.)
5. **Two Figma extras are Core:** resuming an in-progress quiz and the notification bell.

Scope and stack are in Section 1; how the AI parts work is in Section 3.

## The student journey

One loop, nine steps; the 6 Nov demo shows steps 1–6 and 8–9 working with real data, and step 7 (flashcards) follows in Week 2.

1. **Sign up** and land on the Dashboard.
2. **Create a Study Space** (for example "Database Systems").
3. **Upload** a PDF, PPTX or TXT. Processing runs in the background; the student can leave the page.
4. **Review suggested topics:** edit, remove or add, then **Confirm**.
5. **Generate a quiz** from chosen materials and topics; it appears in the Quiz Library when ready.
6. **Take the quiz,** submit, and see the score, per-topic results, explanations and sources.
7. **Generate and practise flashcards** (recall or short-answer cards) and rate each one.
8. **Check analytics:** mastery per topic, weak topics, and a "Practise this topic" shortcut.
9. **Plan your study in My Plan and review mistakes:** suggestions come from your analytics; you choose what to study and when.

## Rules per feature

These are the rules the team builds and tests against; each bullet is meant to be checkable.

### Study Spaces

- A student can create, rename, open and delete their own spaces. A name is required (1–150 characters).
- Everything inside a space is visible only to its owner. Another student opening its URL gets "not found".
- Deleting a space asks for confirmation, immediately blocks access to its study data and starts a durable removal workflow for dependent records and Blob files. The UI must not claim complete erasure until external file deletion succeeds; historical-retention policy is explicitly recorded before implementing account/space deletion.
- **Retention policy (Arya, 2026-11-08):** a deleted Study Space keeps no history for the student — from the moment of deletion it behaves exactly like a space that never existed, with no "deleted spaces" list and no way to recover it. T-05 implements this as a soft delete: the row stays, marked with `deleted_at`, so a later cleanup job (materials' T-06b and the daily cleanup job) can still find and purge its dependent records and Blob files. The database row's continued existence until that cleanup runs is an internal implementation detail; the student never sees or regains access to it.

### Materials

- Accepted: PDF, PPTX, TXT, up to 10 MB. A space holds up to 20 materials. Anything else is rejected with a clear message before upload starts.
- Upload shows real progress and can be cancelled.
- Status after upload: **Processing** → **Review topics** (topics are ready for review) → **Ready** (topics confirmed). Or **Failed**, with a reason and a **Retry** button.
- Scanned or image-only files fail with "No readable text found (scanned pages are not supported)". Files over 200 pages or slides fail with "File too long (maximum 200 pages)", and files with more than 240,000 characters of text fail with "Too much text. Split the file into smaller parts." Uploading a file that is already in the space shows "This file is already in this space".
- Deleting a material removes it from all future quizzes, cards and mistake reviews. Past quiz results stay, and their sources show "Source removed".
- A topic that only came from that material is deleted with it, unless the student already made a quiz or flashcards from it — those topics stay, with their results, and the Overview lists them separately as "Topics from deleted materials" until a new material brings them back.

### Topics

- After processing, AI suggests 3–12 topics for the material, each with an **AI-suggested** label until the student confirms it.
- The student can rename, remove or add topics, then press **Confirm topics**. **Save & exit** keeps an unconfirmed draft.
- Quizzes and flashcards can only use **confirmed** topics from **Ready** materials.
- If a suggested name matches a confirmed topic already in the space (ignoring case and spaces), confirming links it to that existing topic instead of creating a duplicate.
- Renaming a topic keeps its history and mastery. A topic that has quiz history can be archived but not deleted.

### Quizzes (MCQ only)

- Setup: choose one or more Ready materials; all their confirmed topics start ticked and can be unticked; choose 5, 10, 15 or 20 questions. If more topics are ticked than requested MCQs, ask the student to select fewer topics or increase question count so every selected topic can receive at least one item. Questions come only from the ticked materials, even if a topic also appears in other materials.
- Questions are spread as evenly as possible across ticked topics. Each question has 4 options, one correct answer, an explanation, one topic and at least one source (page or slide).
- Generation runs in the background, at most 2 at once across the app. The Quiz Library shows **Generating**, then **Ready** or **Failed** with **Try again**.
- **Daily limit:** each student can generate up to 20 quizzes and decks combined per day. After that: "Daily limit reached, try again tomorrow."
- If fewer valid questions are produced than requested but at least 5, the quiz is published with a note such as "8 of 10 generated". Fewer than 5 means the generation failed.
- During an attempt, answers save as the student goes, and **Resume quiz** continues later. There is no time limit. Correct answers and explanations are never sent to the browser before submission.
- Submitting asks for confirmation (unanswered questions are listed). Then the server scores it.
- Results show the total score, a score per topic, each question with the student's answer, the correct answer, the explanation and the source. Every question carries an **AI-generated** label. **View source** shows the cited excerpt with its page or slide number; the original file opens only for its owner.
- A quiz can be retaken; each retake shuffles question and option order. Every question has a **Report issue** button.
- **A quiz with submitted results can't be deleted** (Arya, 2026-11-14, #35): its score, per-topic results, mastery evidence and mistakes are the student's record. A quiz that failed, is still generating, was never taken or has only an unfinished attempt can be deleted. Hiding a taken quiz from the Quiz Library while keeping its records is planned as Week 3 polish.

### Flashcards

- Setup: materials and topics as for quizzes; card style: **Recall**, **Short answer** or **Mix**; 1–20 cards. Each deck counts toward the daily generation limit.
- Recall card: front prompt → flip → short answer.
- Short-answer card: front question with a typing box → flip → model answer plus 2–4 key points. What the student typed is shown beside it, never marked and not saved.
- After flipping, the student rates **Again** or **Got it**, then **Next**. Each rating saves when the student presses Next, so leaving mid-deck keeps progress ("Paused practice").
- Cards carry an **AI-generated** label and **View source**. Ratings never affect mastery.

### Mastery and progress

- Only **submitted, server-scored MCQ** answers count. For each confirmed topic, select the latest submitted eligible answer to each distinct immutable question ID, then keep the newest 10 distinct IDs (deterministic timestamp and ID tie-breaker). Exclude unanswered, invalidated or removed items, mistake reviews and card ratings. If an item is retaken, only its most recent eligible submitted response counts.
- Status:
    - **Not assessed:** no quiz answers yet.
    - **Insufficient evidence:** 1–4 questions. Shows "3 of 5 needed" and no percentage.
    - **Weak:** at least 5 questions and below 60%.
    - **On track:** at least 5 questions and 60% or above.
- **My Analytics** (renamed from My Progress after lecturer feedback, 13 Nov 2026) shows all spaces: one card per space with its topic counts by status, its open mistakes and its weakest topics. **Study Space Analytics** shows the space's confirmed topics, weak first; **View weak topics** filters them. **Topic detail** lists the questions counted, newest first, each Correct or Incorrect with its date, under "Counting the latest 10 questions". Wording: **Not assessed**; **Not enough evidence** ("3 of 5 needed", no percentage); **Weak** and **On track** with the percentage ("50% of the latest 8"). There is never one overall mastery score or an average across topics, on any screen, including the Dashboard.
- A topic whose materials were all deleted stays confirmed with its history, so it still appears, with a **No material** label and no Practise button.
- Weak, insufficient and not-assessed topics that still have a Ready material have a **Practise this topic** button, which opens quiz setup with only that topic ticked. A topic with open mistakes also shows **Review mistakes (N)**.
- A question removed/invalidated through Report issue no longer counts toward current mastery or future practice, but completed attempt results retain the original recorded scores and versioned item references.

### My Plan and reviewing mistakes

*Changed after lecturer feedback at the progress demonstration (Friday 13 November 2026): the app shows analytics and suggestions, and students plan their own study; no app-set due dates.* This replaces the earlier Revision section (My Revision, the 1, 3 and 7-day schedule, Overdue and Today).

- The app sets no days, shows nothing as "overdue", sends no reminders and schedules no re-attempts. Everything here is advice or the student's own choice.
- **My Plan** (`/plan`) opens with one line: "Suggestions come from your quiz results. You decide what to study and when." It has two parts.
- **Suggested for you** is a ranked list built from the analytics, in this order: (1) a weak topic ("SQL basics is weak (50% of the latest 8). Practise it."); (2) mistakes to review ("4 questions you got wrong in Normalisation"); (3) not enough evidence ("Answer 3 more questions on Encryption to get a score"); (4) an unfinished quiz ("Resume Database concepts check, 4 of 10 answered"); (5) a topic not tested yet; (6) a material waiting for topic review. Within a kind: weak by lowest percentage, mistakes by most, not enough evidence by fewest answers needed, an unfinished quiz by most recent, the rest by name. Weak, not-enough-evidence and not-tested suggestions cover only topics with a Ready material (they lead to Practise); a topic from a deleted material only produces "mistakes to review". Each suggestion has its action (Practise this topic, Review mistakes, Resume quiz, Review topics) and **Add to my plan**; once added it shows "In my plan". The top 8 show, with "Show all" when there are more. Nothing is mandatory.
- **My plan** is the student's own list. Adding a suggestion creates an item with its title and link; **Add your own** creates a free-text item (1–120 characters), optionally tied to one of the student's Study Spaces. At most 100 items can be open at once.
    - Each item can have an optional day the student picks themselves ("Planned for"); with no day it is "Anytime". Open items sort by planned day, then Anytime. A planned day in the past is shown as a plain date: no red, no "overdue". The app never compares it with today.
    - An item can be marked done (it moves to a collapsed "Done" list, with Undo), edited (title and day) or removed (after a confirmation).
    - Empty state: "Your plan is empty. Add a suggestion or write your own."
    - The server builds each item's link from its kind and target, so a request can't plant a link. If the target is deleted the item keeps its title and loses its link. Items in a deleted Study Space are never shown.
    - How flashcards and card ratings enter My Plan is left to the flashcards task.
- **Review mistakes** (`/plan/review?topicId=…` or `?spaceId=…`) starts from a topic's "Review mistakes (N)", a space's Analytics, or a My Plan suggestion.
    - A **mistake** is a question the student answered wrong in a submitted quiz, that is still active (not removed through Report issue) and still sourced (its material not deleted), on a confirmed topic. A session takes up to **20**, weak topics first, then oldest first.
    - Each question shows the 4 options. The student picks one and presses **Check**; the server checks it and the screen shows right or wrong, the correct answer and the explanation, then **Next**. Progress reads "Question 2 of 5" with a bar.
    - **Exit** keeps what is already checked. With an answer picked but not checked it asks "Leave without checking this answer?".
    - The completed screen summarises right and wrong. If more than 20 mistakes were open it says how many are left, with **Review more**. No dates are shown.
- **A correct check clears the mistake; a wrong one leaves it open.** A later wrong quiz answer to the same question reopens it; a later correct quiz answer clears it. There is one mistake per student per question. Each check carries a stable request key, so a double click or retry counts once and returns the first result.
- **Reviewing mistakes never changes mastery:** only quiz answers count, and the completed screen says so. A topic can be On track and still have open mistakes from older answers; that is expected, because the mistakes list is about questions and mastery is about the latest 10 answers.
- Questions removed through Report issue, or whose material was deleted, leave the mistakes list and its counts.

### Dashboard

- **Learning Snapshot:** four numbers, no dates: Active study spaces; Quizzes completed (submitted attempts); Weak topics (across all spaces, linking to My Analytics); Mistakes to review (linking to My Plan). No overall accuracy or average.
- **Resume quiz:** the student's most recent unfinished quiz ("Database concepts check · Database Systems · 4 of 10 answered"), hidden when there is none. (Flashcards do not exist yet, so there is no "Resume flashcards".)
- **Suggested for you:** the top 3 suggestions with their actions, and **Open My Plan**. Empty: "No suggestions yet. Take a quiz to get some."

### Reports

- Reasons: Incorrect answer, Unclear wording, Wrong source, Other, plus an optional comment.
- The student can also tick **Remove from my practice**. The item then leaves future quizzes, mistake reviews and mastery.
- Reports are kept for the AI-quality evaluation. There is no admin screen in Core.

### Notifications

- Toasts appear when an upload finishes, processing finishes or fails, and a quiz or deck is ready or fails, while the student is in the app.
- The bell lists the last 20 of these events, newest first. A dot marks events since the bell was last opened.
- Statuses on the page always show the true state, even if the student missed the toast.

### Account

- Create account and sign in with Google only (decision 2026-11-06, T-01c) — no passwords are stored; sign out.
- After the first sign-in with no spaces, the student is taken to Create Study Space.
- Profile: change name.
- Security: **Delete account** (planned Week 2) reauthenticates with a fresh Google sign-in, blocks further access and initiates a recoverable deletion process. A completion confirmation is issued only once scoped database records and private objects are removed according to the approved retention policy.
- A public **Privacy policy** page (no sign-in required) states what is collected, why, which third-party services (including the Vercel AI Gateway, which reaches OpenAI and Google; T-02b) process it, and how to request deletion. Linked from the sign-in page and from the Google OAuth consent screen.
- Light theme only in Core.

### Accessibility and devices

- Every action works by keyboard: Tab moves between controls, Space flips a card, arrow keys move between answer options, Enter submits.
- Visible focus outlines, a label on every input, and text contrast that meets WCAG 2.1 AA.
- Screens stay usable down to phone width (375px); there is no separate mobile design.

## Figma screen inventory

Most of the Figma design is built as designed. Six screen groups change (plus one new button on the analytics screens), and four groups are deferred. Changes marked "Change in Figma" are made in code during development; the Figma file stays as the Capstone 1 design.

| Figma flow | Screens and states | Plan | Change needed |
| --- | --- | --- | --- |
| Authentication | Sign in (Google only), First-time setup, Profile, Security, Privacy policy | Build | First-time setup = straight to Create Study Space. Sign in and Create account are one Google-sign-in screen (decision 2026-11-06, T-01c); Privacy policy is new, not in the Capstone 1 Figma design. |
| Authentication | Create account (separate screen), Forgot password, Reset password, Appearance, Course connections tab, Instructor profile | Defer | Password-based flows no longer apply (Google-only sign-in). Appearance, course connections and instructor profile remain Week 3 polish or future work. |
| Dashboard & Navigation | Dashboard, collapsed sidebar, Study Spaces flyout, My Study Spaces, Create space dialog and errors | Build | — |
| Materials & Topics | Overview (empty and populated), Materials Library, Upload (validation, in progress, cancel), Processing, Processing failed | Build | — |
| Materials & Topics | Review suggested topics, Edited draft, Draft saved, Confirm | Build | — |
| Materials & Topics | (new) Duplicate topic note | Change in Figma | Add a small "Already in this space — will be linked" label on matching suggestions. |
| Quizzes | Quiz Library (empty, populated, generating, failed), Attempt (MCQ), Saved attempt, Resume, Confirm submission, Answer review, Report issue | Build | — |
| Quizzes | Generate Quiz setup | Change in Figma | Remove the Short answer type; add topic checkboxes (all ticked by default). |
| Quizzes | Results | Change in Figma | Remove provisional short answers; add a per-topic score row. |
| Quizzes | Attempt (Short answer), Short-answer feedback (provisional) | Change in Figma | Remove from quizzes (short answer now lives in flashcards). |
| Flashcards | Deck Library (all states), Practice (front, revealed, rated, next, paused, completed), Exit with unsaved rating | Build | — |
| Flashcards | Generate Flashcards setup, Practice front | Change in Figma | Add card style (Recall / Short answer / Mix); add a typing box on short-answer card fronts. |
| Analytics | My Analytics (populated, empty), Study Space Analytics, Weak topics, Topic detail, Insufficient evidence | Change in Figma | Renamed from My Progress and Study Space Progress (lecturer feedback, 13 Nov 2026). Add a "Practise this topic" button on weak, insufficient and not-assessed topics. Leave out the trend chart, finalised-attempt counts, the flashcards card and the period selector (no data behind them yet). |
| My Plan | My Plan (replaces My Revision list) | Change in Figma | Layout reference only: "Suggested for you" and "My plan" replace Overdue, Today and Upcoming; every due-date element is removed. |
| My Plan | Review mistakes (question, checked, exit with an unchecked answer, completed) | Change in Figma | Adapted from the Revision session: the MCQ "Check" flow, no "Reveal answer" or "Again / Got it", no "View source", no next-review dates. |
| My Plan | My Revision calendar view | Dropped | The app sets no dates, so there is no calendar. |
| Shared UI | Appearance menu (dark mode) | Defer | Light theme only in Core; components, toasts and the notification bell are built. |
| Course Connection & Instructor | All 16 student and instructor screens | Defer | Future work (as set in Section 1); keep them in the report as designed. |

## Key decisions

- Topics need student confirmation before generation; exact-name matches link to the existing topic.
- Quizzes are MCQ only, built from chosen materials and topics, with each question tagged to one topic; "Practise this topic" pre-selects one topic.
- Partial quizzes publish with at least 5 valid questions; retakes shuffle question and option order.
- Flashcard decks hold Recall and Short-answer cards; ratings (Again or Got it) are self-assessment only: they never affect mastery and schedule nothing. How cards enter My Plan is decided with the flashcards task.
- Mastery uses quiz answers only: latest 10 distinct questions; fewer than 5 is insufficient evidence; below 60% is weak.
- **My Plan replaces scheduled revision** (lecturer feedback, 13 Nov 2026): the app shows analytics and suggestions, and students plan their own study; no app-set due dates, no overdue, no reminders. Wrong quiz answers become mistakes the student can re-answer in Review mistakes whenever they choose (up to 20 per session, checked on the server); reviewing mistakes never changes mastery.
- Limits: 20 generations per student per day; 10 MB, 200 pages and 240,000 characters per file; 20 materials per space; no duplicate files.
- AI labels, View source, keyboard access and phone-width layouts apply to every screen.
- Core extras: resuming an in-progress quiz and the notification bell. Week 2: delete account. Deferred: dark mode. Dropped: the revision calendar and the 1, 3 and 7-day schedule. Forgot/reset password no longer apply — sign-in is Google-only (decision 2026-11-06, T-01c).
- Screen changes from the Figma design are built directly in code; this document is the source of truth.

## v1.2 product-choice record and safety clarifications

- **Current v1 product decisions retained:** AI topics require confirmation before practice; quizzes may contain multiple topics, with one topic ID per MCQ; typed short-answer cards are self-rated, not scored. These replace the older Notion Master PRD v0.2 choices. Do not silently revert them based on the older draft.
- Reporting/removing an item from future practice must preserve historical attempt integrity; mastery excludes removed/invalidated questions but saved prior attempt results remain truthful to what was answered at the time.
- For one Study Space, a client-provided topic, material, quiz, attempt, mistake or plan-item identifier cannot grant access to another student's information; cross-space and cross-set membership must be checked on the server and enforced in database relationships where possible.
- Dates shown to the student (for example when they answered a question) and generation quotas must use the student's validated IANA time zone consistently; record timestamps in UTC and compute local date boundaries server-side. A plan item's "Planned for" day is a plain calendar date the student picked: it is stored and shown as picked and never compared with today.

## v1.2 acceptance notes for deletion and mistakes

- The student may open historical scored attempts even after a source material is removed, showing **Source removed** rather than exposing the deleted document. For full account/Study Space deletion, historical retention and legal/consent limits must be decided before implementing the destructive operation; deleted student data must not remain accessible merely because cleanup is pending.
- A mistake is unique by student and question. A wrong quiz answer opens it, or reopens a cleared one; a later correct quiz answer clears it; a correct check in Review mistakes clears it and a wrong check leaves it open. Use a durable request key so each check counts once and a duplicate call returns the first result. There are no dates to reschedule, so a time-zone change cannot duplicate or move anything.
- For a multi-topic quiz, every MCQ has exactly one valid confirmed topic from selected source materials. Material selection is enforced for retrieval, generation, source citation and final persistence—not just on the setup screen.