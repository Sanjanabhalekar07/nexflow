import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nexflow — Visual Workflow Builder",
  description: "Design, configure, and simulate visual workflows.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
