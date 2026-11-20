"use client";

import { useState } from "react";
import { createApiFlashcardsClient } from "../client/api-flashcards-client";
import { DeckSetupForm } from "./deck-setup-form";

/** Owns the real `FlashcardsClient` for the setup screen, the same split `quiz-setup-page-client.tsx` uses. */
export function DeckSetupPageClient({ spaceId }: { spaceId: string }) {
  const [client] = useState(() => createApiFlashcardsClient(spaceId));
  return <DeckSetupForm spaceId={spaceId} client={client} />;
}
