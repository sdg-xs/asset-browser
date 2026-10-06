import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogLibrary } from "../../shared/catalog-library.js";
import {
  catalogApi,
  CatalogRequestError,
  type CatalogAction,
  type CatalogApi,
} from "./api.js";
export function useCatalogLibrary(api: CatalogApi = catalogApi) {
  const [state, setState] = useState<CatalogLibrary | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(false),
    sequence = useRef(0),
    busy = useRef(false);
  const current = useRef(state);
  current.current = state;
  const refresh = useCallback(
    async (preserveError = false) => {
      if (!preserveError) setError("");
      const version = ++sequence.current;
      try {
        const next = await api.read();
        if (alive.current && version === sequence.current)
          setState((previous) =>
            !previous || next.revision >= previous.revision ? next : previous,
          );
      } catch (cause) {
        if (alive.current && version === sequence.current)
          setError(
            cause instanceof Error ? cause.message : "Could not load catalog.",
          );
      }
    },
    [api],
  );
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
      sequence.current++;
    };
  }, [refresh]);
  const execute = async (action: CatalogAction): Promise<boolean> => {
    if (!current.current || busy.current) return false;
    busy.current = true;
    setPending(true);
    setError("");
    const version = ++sequence.current;
    try {
      const next = await api.execute({
        ...action,
        expectedRevision: current.current.revision,
      });
      if (!alive.current || version !== sequence.current) return false;
      setState((previous) =>
        !previous || next.revision >= previous.revision ? next : previous,
      );
      return true;
    } catch (cause) {
      if (alive.current && version === sequence.current) {
        setError(
          cause instanceof Error ? cause.message : "Could not save changes.",
        );
        if (
          cause instanceof CatalogRequestError &&
          cause.code === "REVISION_CONFLICT"
        )
          await refresh(true);
      }
      return false;
    } finally {
      busy.current = false;
      if (alive.current) setPending(false);
    }
  };
  return { state, pending, error, refresh, execute };
}
