import { useCallback, useRef, useState } from "react";

const INITIAL = { busy: false, result: null, error: null };

export default function useAsyncAction() {
  const [state, setState] = useState(INITIAL);
  const runIdRef = useRef(0);

  const run = useCallback(async (fn) => {
    const runId = ++runIdRef.current;
    setState({ busy: true, result: null, error: null });
    try {
      const result = await fn();
      if (runIdRef.current === runId) {
        setState({ busy: false, result, error: null });
      }
      return result;
    } catch (err) {
      if (runIdRef.current === runId) {
        setState({ busy: false, result: null, error: err.message });
      }
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    setState(INITIAL);
  }, []);

  return { ...state, run, reset };
}
