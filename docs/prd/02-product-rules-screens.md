# Capstone 2 PRD v1.2 — Section 2: Product Rules & Screens

Version 1.2 · 2 November 2026 · Owner: Arya

The product follows the Capstone 1 Figma design, with five rules that keep it simple to build:

1. **Topics need confirmation.** AI suggests topics; the student confirms them before generating quizzes or flashcards.
2. **Quizzes can cover several topics.** Each question is tagged with one topic.
3. **Short answer is a flashcard style.** It is not a quiz question type.
4. **Revision is a hybrid.** Due MCQs are re-answered and checked automatically; cards are self-rated; revision never changes mastery.
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
8. **Check progress:** mastery per topic, weak topics, and a "Practise this topic" shortcut.
9. **Do due reviews** in My Revision; the next review dates update.

## Rules per feature

These are the rules the team builds and tests against; each bullet is meant to be checkable.

### Study Spaces

- A student can create, rename, open and delete their own spaces. A name is required (1–150 characters).
- Everything inside a space is visible only to its owner. Another student opening its URL gets "not found".
- Deleting a space asks for confirmation, immediately blocks access to its study data and starts a durable removal workflow for dependent records and Blob files. The UI must not claim complete erasure until external file deletion succeeds; historical-retention policy is explicitly recorded before implementing account/space deletion.

### Materials

- Accepted: PDF, PPTX, TXT, up to 10 MB. A space holds up to 20 materials. Anything else is rejected with a clear message before upload starts.
- Upload shows real progress and can be cancelled.
- Status after upload: **Processing** → **Review topics** (topics are ready for review) → **Ready** (topics confirmed). Or **Failed**, with a reason and a **Retry** button.
- Scanned or image-only files fail with "No readable text found (scanned pages are not supported)". Files over 200 pages or slides fail with "File too long (maximum 200 pages)", and files with more than 240,000 characters of text fail with "Too much text. Split the file into smaller parts." Uploading a file that is already in the space shows "This file is already in this space".
- Deleting a material removes it from all future quizzes, cards and revision. Past quiz results stay, and their sources show "Source removed".

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

### Flashcards

- Setup: materials and topics as for quizzes; card style: **Recall**, **Short answer** or **Mix**; 1–20 cards. Each deck counts toward the daily generation limit.
- Recall card: front prompt → flip → short answer.
- Short-answer card: front question with a typing box → flip → model answer plus 2–4 key points. What the student typed is shown beside it, never marked and not saved.
- After flipping, the student rates **Again** or **Got it**, then **Next**. Each rating saves when the student presses Next, so leaving mid-deck keeps progress ("Paused practice").
- Cards carry an **AI-generated** label and **View source**. Ratings never affect mastery.

### Mastery and progress

- Only **submitted, server-scored MCQ** answers count. For each confirmed topic, select the latest submitted eligible answer to each distinct immutable question ID, then keep the newest 10 distinct IDs (deterministic timestamp and ID tie-breaker). Exclude unanswered, invalidated or removed items and revision/card ratings. If an item is retaken, only its most recent eligible submitted response counts.
- Status:
    - **Not assessed:** no quiz answers yet.
    - **Insufficient evidence:** 1–4 questions. Shows "3 of 5 needed" and no percentage.
    - **Weak:** at least 5 questions and below 60%.
    - **On track:** at least 5 questions and 60% or above.
- My Progress shows all spaces. Study Space Progress shows topics, with weak topics first. Topic detail lists the questions counted.
- Weak and insufficient topics have a **Practise this topic** button, which opens quiz setup with only that topic ticked.
- A question removed/invalidated through Report issue no longer counts toward current mastery or future practice, but completed attempt results retain the original recorded scores and versioned item references.

### Revision

- A review item is created when a student answers an MCQ **wrong** in a quiz, or first rates a card. It is due the next day. Items already scheduled are not duplicated. Correct quiz answers do not create review items; they already count toward mastery.
- My Revision lists **Overdue**, **Today** and the **next 7 days**, with weak topics first within each group. "Today" means the student's local calendar day.
- A revision session takes up to **20** due items, weak topics first:
    - **MCQ items** show the 4 options; the app checks the answer and shows right or wrong with the explanation. Right counts as Got it; wrong counts as Again.
    - **Cards** are flipped and self-rated, as in practice.
- Schedule: initial creation after a wrong MCQ or first card rating is due in **1 day**. On the first successful scheduled review, move the next due date to **3 days**; on the second and later successful reviews, use **7 days** (capped at 7). Any unsuccessful review resets the next due date to **1 day** and success streak to zero. Each outcome advances the task at most once, using a stable request key; a duplicate call returns the previous result.
- Revision never changes mastery. Exiting keeps saved items; unsaved ones stay due. Items from a deleted material, or removed through Report issue, leave revision.

### Reports

- Reasons: Incorrect answer, Unclear wording, Wrong source, Other, plus an optional comment.
- The student can also tick **Remove from my practice**. The item then leaves future quizzes, revision and mastery.
- Reports are kept for the AI-quality evaluation. There is no admin screen in Core.

### Notifications

- Toasts appear when an upload finishes, processing finishes or fails, and a quiz or deck is ready or fails, while the student is in the app.
- The bell lists the last 20 of these events, newest first. A dot marks events since the bell was last opened.
- Statuses on the page always show the true state, even if the student missed the toast.

### Account

- Create account (name, email, password with at least 8 characters), sign in, sign out.
- After the first sign-in with no spaces, the student is taken to Create Study Space.
- Profile: change name. Security: change password (current password required).
- Security: **Delete account** (planned Week 2) reauthenticates, blocks further access and initiates a recoverable deletion process. A completion confirmation is issued only once scoped database records and private objects are removed according to the approved retention policy.
- Light theme only in Core.

### Accessibility and devices

- Every action works by keyboard: Tab moves between controls, Space flips a card, arrow keys move between answer options, Enter submits.
- Visible focus outlines, a label on every input, and text contrast that meets WCAG 2.1 AA.
- Screens stay usable down to phone width (375px); there is no separate mobile design.

## Figma screen inventory

Most of the Figma design is built as designed. Six screen groups change (plus one new button on the progress screens), and four groups are deferred. Changes marked "Change in Figma" are made in code during development; the Figma file stays as the Capstone 1 design.

| Figma flow | Screens and states | Plan | Change needed |
| --- | --- | --- | --- |
| Authentication | Sign in, Create account, First-time setup, Profile, Security | Build | First-time setup = straight to Create Study Space. |
| Authentication | Forgot password, Reset password, Appearance, Course connections tab, Instructor profile | Defer | Week 3 polish or future work. |
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
| Analytics | My Progress (populated, empty), Study Space Progress, Weak topics, Topic mastery detail, Insufficient evidence | Build | Add a "Practise this topic" button on weak and insufficient topics. |
| Revision | Revision session (front, revealed, rated, incomplete, completed) | Change in Figma | Add an MCQ variant: 4 options, auto-checked, then right or wrong with explanation. |
| Revision | My Revision calendar view | Defer | Week 3 polish; the list view is Core. |
| Revision | My Revision list (default, empty, updated schedule), Exit with unsaved rating | Build | — |
| Shared UI | Appearance menu (dark mode) | Defer | Light theme only in Core; components, toasts and the notification bell are built. |
| Course Connection & Instructor | All 16 student and instructor screens | Defer | Future work (as set in Section 1); keep them in the report as designed. |

## Key decisions

- Topics need student confirmation before generation; exact-name matches link to the existing topic.
- Quizzes are MCQ only, built from chosen materials and topics, with each question tagged to one topic; "Practise this topic" pre-selects one topic.
- Partial quizzes publish with at least 5 valid questions; retakes shuffle question and option order.
- Flashcard decks hold Recall and Short-answer cards; ratings (Again or Got it) only schedule reviews.
- Mastery uses quiz answers only: latest 10 distinct questions; fewer than 5 is insufficient evidence; below 60% is weak.
- Revision is a hybrid: wrong quiz answers and rated cards enter revision; MCQs are checked automatically and cards are self-rated; up to 20 items per session; intervals of 1, 3 and 7 days, resetting to 1; revision never changes mastery.
- Limits: 20 generations per student per day; 10 MB, 200 pages and 240,000 characters per file; 20 materials per space; no duplicate files.
- AI labels, View source, keyboard access and phone-width layouts apply to every screen.
- Core extras: resuming an in-progress quiz and the notification bell. Week 2: delete account. Deferred: forgot and reset password, dark mode, the revision calendar.
- Screen changes from the Figma design are built directly in code; this document is the source of truth.

## v1.2 product-choice record and safety clarifications

- **Current v1 product decisions retained:** AI topics require confirmation before practice; quizzes may contain multiple topics, with one topic ID per MCQ; typed short-answer cards are self-rated, not scored. These replace the older Notion Master PRD v0.2 choices. Do not silently revert them based on the older draft.
- Reporting/removing an item from future practice must preserve historical attempt integrity; mastery excludes removed/invalidated questions but saved prior attempt results remain truthful to what was answered at the time.
- For one Study Space, a client-provided topic, material, quiz, attempt or revision identifier cannot grant access to another student's information; cross-space and cross-set membership must be checked on the server and enforced in database relationships where possible.
- Calendar-day due dates and generation quotas must use the student's validated IANA time zone consistently; record timestamps in UTC and compute local date boundaries server-side.

## v1.2 acceptance notes for deletion and revision

- The student may open historical scored attempts even after a source material is removed, showing **Source removed** rather than exposing the deleted document. For full account/Study Space deletion, historical retention and legal/consent limits must be decided before implementing the destructive operation; deleted student data must not remain accessible merely because cleanup is pending.
- A review task is unique by student and item; initial due date is the next local calendar day, followed by 3 and 7 days on scheduled success, and 1 day after any scheduled failure. Use a durable request ID to prevent double advancement. Time-zone changes must not retroactively duplicate review events.
- For a multi-topic quiz, every MCQ has exactly one valid confirmed topic from selected source materials. Material selection is enforced for retrieval, generation, source citation and final persistence—not just on the setup screen.