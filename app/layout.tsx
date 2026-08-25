import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowSpec — React architecture planner",
  description: "Plan React components and data flows, then generate a concise implementation prompt for VS Code chat.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
