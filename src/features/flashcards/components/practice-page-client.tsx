"use client";

import { useState } from "react";
import { createApiFlashcardsClient } from "../client/api-flashcards-client";
import { PracticeView } from "./practice-view";

/** Owns the real `FlashcardsClient` for the practice screen (the same split the quiz attempt screen uses). */
export function PracticePageClient({ spaceId, setId }: { spaceId: string; setId: string }) {
  const [client] = useState(() => createApiFlashcardsClient(spaceId));
  return <PracticeView spaceId={spaceId} setId={setId} client={client} />;
}
