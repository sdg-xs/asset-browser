import { useEffect, useState } from "react";
import type { LibraryModel } from "../../shared/contracts.js";
import type { LibraryApi } from "../library/api.js";
export type SourceAvailability =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; models: LibraryModel[] };
export function useSourceAvailability(
  api: LibraryApi,
  workspace: string,
  revision: number | undefined,
) {
  const [availability, setAvailability] = useState<SourceAvailability>({
    kind: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setAvailability({ kind: "loading" });
    void api
      .list()
      .then((models) => {
        if (active) setAvailability({ kind: "ready", models });
      })
      .catch((cause) => {
        if (active)
          setAvailability({
            kind: "failed",
            message:
              cause instanceof Error
                ? cause.message
                : "Could not check sources.",
          });
      });
    return () => {
      active = false;
    };
  }, [api, workspace, revision, attempt]);
  return { availability, retry: () => setAttempt((value) => value + 1) };
}
