import { useCallback, useMemo, useRef, useState } from "react";

const idleState = (id) => ({
  id,
  state: "idle",
  durationMs: null,
  error: null,
  evidence: null,
  status: null,
});

export default function useTestRunner(cases) {
  const [results, setResults] = useState(() =>
    Object.fromEntries(cases.map((testCase) => [testCase.id, idleState(testCase.id)]))
  );
  const [activeRun, setActiveRun] = useState(null);
  const runningRef = useRef(false);
  const cancelRef = useRef(false);

  const patch = useCallback((id, changes) => {
    setResults((prev) => ({ ...prev, [id]: { ...prev[id], ...changes } }));
  }, []);

  const execute = useCallback(
    async (testCase) => {
      patch(testCase.id, {
        state: "running",
        error: null,
        evidence: null,
        status: null,
        durationMs: null,
      });
      const started = performance.now();
      try {
        const outcome = (await testCase.run()) || {};
        patch(testCase.id, {
          state: "passed",
          durationMs: Math.round(performance.now() - started),
          evidence: outcome.evidence ?? null,
          status: outcome.status ?? null,
        });
        return true;
      } catch (err) {
        patch(testCase.id, {
          state: "failed",
          durationMs: Math.round(performance.now() - started),
          error: err.message,
          evidence: err.evidence ?? null,
          status: err.status ?? null,
        });
        return false;
      }
    },
    [patch]
  );

  const runMany = useCallback(
    async (list, label = "custom") => {
      if (runningRef.current) return null;
      runningRef.current = true;
      cancelRef.current = false;
      setActiveRun(label);

      let passed = 0;
      let failed = 0;
      let cancelled = 0;

      try {
        for (const testCase of list) {
          if (cancelRef.current) {
            patch(testCase.id, {
              ...idleState(testCase.id),
              state: "cancelled",
              error: "Skipped because the run was cancelled.",
            });
            cancelled += 1;
            continue;
          }
          const ok = await execute(testCase);
          if (ok) passed += 1;
          else failed += 1;
        }
      } finally {
        runningRef.current = false;
        cancelRef.current = false;
        setActiveRun(null);
      }

      return { passed, failed, cancelled };
    },
    [execute, patch]
  );

  const runAll = useCallback(() => runMany(cases, "all"), [cases, runMany]);
  const runGroup = useCallback(
    (group) => runMany(group.cases, group.id),
    [runMany]
  );
  const runCase = useCallback(
    (testCase) => runMany([testCase], testCase.id),
    [runMany]
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
  }, []);

  const reset = useCallback(() => {
    if (runningRef.current) return;
    setResults(
      Object.fromEntries(cases.map((testCase) => [testCase.id, idleState(testCase.id)]))
    );
  }, [cases]);

  const summary = useMemo(() => {
    const counts = { passed: 0, failed: 0, running: 0, cancelled: 0, idle: 0 };
    for (const testCase of cases) {
      const state = results[testCase.id]?.state ?? "idle";
      counts[state] = (counts[state] ?? 0) + 1;
    }
    return { ...counts, total: cases.length };
  }, [cases, results]);

  return {
    results,
    summary,
    activeRun,
    isRunning: activeRun !== null,
    runAll,
    runGroup,
    runCase,
    cancel,
    reset,
  };
}
