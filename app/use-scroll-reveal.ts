"use client";

import { useEffect } from "react";

// Progressive enhancement: the page remains readable before JavaScript and with reduced motion.
export default function useScrollReveal() {
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches || !("IntersectionObserver" in window)) return;

    const elements = Array.from(document.querySelectorAll<HTMLElement>([
      ".section-heading", ".selection-hint", ".cases-grid .case",
      ".company-photos", ".company-copy", ".process-grid .process-item",
      ".faq-grid > div:first-child", ".faq-list", ".request-copy", ".form-card",
    ].join(",")));

    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.reveal = "visible";
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });

    for (const element of elements) {
      const parent = element.parentElement;
      const stagger = parent?.matches(".cases-grid, .process-grid")
        ? Math.min(Array.from(parent.children).indexOf(element) * 80, 240) : 0;
      element.style.setProperty("--reveal-delay", `${stagger}ms`);
      element.dataset.reveal = "waiting";
      observer.observe(element);
    }

    const revealAll = () => {
      if (!preference.matches) return;
      observer.disconnect();
      for (const element of elements) element.dataset.reveal = "visible";
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      const element = target?.closest<HTMLElement>("[data-reveal]");
      if (element) { element.dataset.reveal = "visible"; observer.unobserve(element); }
    };
    preference.addEventListener("change", revealAll);
    document.addEventListener("focusin", onFocus);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", revealAll);
      document.removeEventListener("focusin", onFocus);
      for (const element of elements) {
        delete element.dataset.reveal;
        element.style.removeProperty("--reveal-delay");
      }
    };
  }, []);
}
