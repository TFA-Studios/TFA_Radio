'use client';

import { useEffect, useRef, useState } from 'react';

// Keeps a loading state (and therefore the <Preloader/> that's gated on it)
// visible for at least `ms` milliseconds, even if the underlying data
// resolves faster than that — otherwise on a fast connection/local dev the
// brand animation can flash for under a frame and never actually be seen.
//
// `isLoading` is the real underlying condition (data still fetching, brief
// not yet loaded, ...). The hook returns true until BOTH the real loading is
// done AND at least `ms` have passed since this hook first mounted/started
// loading.
export default function useMinDelay(isLoading, ms = 2000) {
  const [minElapsed, setMinElapsed] = useState(false);
  const startedAt = useRef(null);

  useEffect(() => {
    if (startedAt.current === null) startedAt.current = Date.now();
    if (!isLoading) {
      // Real work is already done — but still honor the minimum display time.
      const elapsed = Date.now() - startedAt.current;
      const remaining = Math.max(0, ms - elapsed);
      const timer = setTimeout(() => setMinElapsed(true), remaining);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isLoading, ms]);

  return isLoading || !minElapsed;
}
