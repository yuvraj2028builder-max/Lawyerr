import React from "react";

export function DemoBadge({ lang = "en" }: { lang?: "en" | "hi" }) {
  return (
    <span className="badge badge--demo" role="note" aria-label="Demo data">
      <span aria-hidden>●</span> {lang === "hi" ? "डेमो डेटा — कानूनी सलाह नहीं" : "DEMO DATA — NOT LEGAL ADVICE"}
    </span>
  );
}

export function Badge({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "success" | "warn" | "demo";
}) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}
