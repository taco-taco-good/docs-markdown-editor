import { useState, useCallback, useRef } from "react";
import { api, type SearchResult } from "../api/client";

export function useSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const search = useCallback((q: string) => {
    setQuery(q);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!q.trim()) {
      requestIdRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const data = await api.search(q, { limit: 20 }, { signal: controller.signal });
        if (requestId !== requestIdRef.current) return;
        setResults(data);
        setError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (requestId !== requestIdRef.current) return;
        console.error("Search failed:", error);
        setResults([]);
        setError("검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    }, 150);
  }, []);

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
    abortRef.current = null;
    setQuery("");
    setResults([]);
    setLoading(false);
    setError(null);
  }, []);

  return { query, results, loading, error, search, reset };
}
