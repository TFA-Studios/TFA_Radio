'use client';

import { useEffect, useRef } from 'react';

// A textarea that grows with its content, so long scripts are always fully
// visible without dragging the resize handle or scrolling inside the field.
export default function AutoTextarea({ value, minHeight = 120, style, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(minHeight, el.scrollHeight + 2) + 'px';
  }, [value, minHeight]);
  return <textarea ref={ref} value={value} style={{ ...style, minHeight, resize: 'none', overflow: 'hidden' }} {...rest} />;
}
