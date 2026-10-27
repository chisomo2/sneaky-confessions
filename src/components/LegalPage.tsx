import type { ReactNode } from "react";

export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-extrabold">{title}</h1>
      <p className="mt-1 text-xs text-muted-foreground">Last updated 25 October 2026</p>
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{intro}</p>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_h2]:mt-7 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-foreground [&_li]:mt-1 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
