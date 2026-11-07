import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * The only font in the design (Figma "Light · reusable UI", node 11:2).
 * Named `--font-sans` (not `--font-geist-sans`) so it lines up with
 * `globals.css`'s `@theme inline { --font-sans: var(--font-sans); }`,
 * which shadcn's init generated expecting a font variable of that exact
 * name.
 */
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Study Coach",
  description: "AI-powered learning analytics and study coach for students.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
