"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

const targets = [1000, 50, 2500, 24, 7];
const delays = [0, 120, 240, 360, 360];
const format = (value: number) => new Intl.NumberFormat("ru-RU").format(value);

function Counter({ value, target }: { value: number; target: number }) {
  return <span className="stat-number"><span className="stat-sizer">{format(target)}</span><span className="stat-count">{format(value)}</span></span>;
}

export default function ProofStats() {
  const section = useRef<HTMLElement>(null);
  const [values, setValues] = useState(targets);
  const [motion, setMotion] = useState("static");

  useEffect(() => {
    const element = section.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!element || preference.matches || !("IntersectionObserver" in window)) return;

    let frame = 0;
    let finished = false;
    let started = false;
    let disposed = false;
    setMotion("waiting");

    const finish = () => {
      finished = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (!disposed) { setValues(targets); setMotion("complete"); }
    };

    const observer = new IntersectionObserver(entries => {
      if (started || !entries.some(entry => entry.isIntersecting)) return;
      started = true;
      observer.disconnect();
      setValues(targets.map(() => 0));
      setMotion("playing");
      const start = performance.now();
      const tick = (now: number) => {
        if (disposed || finished) return;
        const elapsed = now - start;
        setValues(targets.map((target, i) => {
          const progress = Math.min(1, Math.max(0, (elapsed - delays[i]) / 1550));
          return Math.round(target * (1 - Math.pow(1 - progress, 3)));
        }));
        if (elapsed < 1910) frame = requestAnimationFrame(tick);
        else finish();
      };
      frame = requestAnimationFrame(tick);
    }, { threshold: 0.25 });

    const onPreferenceChange = () => { if (preference.matches) finish(); };
    preference.addEventListener("change", onPreferenceChange);
    observer.observe(element);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      preference.removeEventListener("change", onPreferenceChange);
    };
  }, []);

  const labels = [
    <>реализованных проектов<br />в России и Казахстане</>,
    <>суммарная мощность<br />поставленных ДГУ</>,
    <>собственные<br />производственные мощности</>,
    <>аварийная<br />сервисная поддержка</>,
  ];
  const accessibleValues = ["1 000+", "50 МВт", "2 500 м²", "24/7"];

  return <section className="proof-strip" id="company-stats" aria-label="Компания в цифрах" ref={section} data-motion={motion}>
    <div className="wrap proof-grid">
      {labels.map((label, i) => <div className="proof-stat" key={accessibleValues[i]} style={{ "--stat-delay": `${i * 120}ms` } as CSSProperties}>
        <b><span className="sr-only">{accessibleValues[i]}</span><span className="stat-visual" aria-hidden="true">
          <Counter value={values[i]} target={targets[i]} />
          <span className={`stat-unit${i === 1 || i === 2 ? " spaced" : ""}`}>{["+", "МВт", "м²", "/"][i]}</span>
          {i === 3 && <Counter value={values[4]} target={targets[4]} />}
        </span></b>
        <p>{label}</p>
      </div>)}
    </div>
  </section>;
}
