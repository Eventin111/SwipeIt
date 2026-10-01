import React, { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './HintedInput.css';

// The portal keeps hints visible above scrollable forms and modal boundaries.
export default function HintedInput({ as: Tag = 'input', hint, ...props }) {
  const id = useId();
  const fieldRef = useRef(null);
  const hintRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const visible = Boolean(hint && (hovered || focused) && !dismissed);

  useLayoutEffect(() => {
    if (!visible) return undefined;
    const reposition = () => {
      const field = fieldRef.current.getBoundingClientRect();
      const width = Math.min(field.width, Math.max(0, window.innerWidth - 16));
      hintRef.current.style.width = `${width}px`;
      const bubble = hintRef.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(field.left, window.innerWidth - bubble.width - 8));
      const top = field.top >= bubble.height + 16
        ? field.top - bubble.height - 8
        : Math.max(8, Math.min(field.bottom + 8, window.innerHeight - bubble.height - 8));
      setPosition({ left, top, width });
    };
    const dismiss = (event) => {
      if (event.key === 'Escape') setDismissed(true);
    };
    reposition();
    const observer = new ResizeObserver(reposition);
    observer.observe(fieldRef.current);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('keydown', dismiss);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      document.removeEventListener('keydown', dismiss);
    };
  }, [visible, hint]);

  return <>
    <Tag
      {...props}
      ref={fieldRef}
      aria-describedby={[props['aria-describedby'], visible ? id : null].filter(Boolean).join(' ') || undefined}
      onMouseEnter={(event) => { setHovered(true); setDismissed(false); props.onMouseEnter?.(event); }}
      onMouseLeave={(event) => { setHovered(false); props.onMouseLeave?.(event); }}
      onFocus={(event) => { setFocused(true); setDismissed(false); props.onFocus?.(event); }}
      onBlur={(event) => { setFocused(false); props.onBlur?.(event); }}
    />
    {visible && createPortal(
      <div ref={hintRef} id={id} role="tooltip" className="field-rule-tooltip" style={position}>
        {hint}
      </div>, document.body
    )}
  </>;
}
