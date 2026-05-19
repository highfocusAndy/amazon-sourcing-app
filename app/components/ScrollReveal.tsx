"use client";

import { useEffect, useRef } from "react";

/**
 * Wraps children in a div that fades-up into view when it enters the viewport.
 * Uses IntersectionObserver — no external dependency needed.
 * The host page must include the .lp-reveal / .lp-revealed CSS (in LandingStyles).
 */
export function ScrollReveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("lp-revealed");
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -48px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`lp-reveal${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: delay ? `${delay}ms` : "0ms" }}
    >
      {children}
    </div>
  );
}
