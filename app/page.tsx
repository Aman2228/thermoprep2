"use client";

import { signIn, useSession } from "next-auth/react";
import Link from "next/link";

const POINTS = [
  ["Spaced-repetition quizzing", "Every question is scheduled with SM-2, not re-asked at random."],
  ["Real textbook figures", "Diagrams are cropped straight from your PDF, not redrawn by an AI."],
  ["Reads scanned pages too", "OCR fills in pages with no selectable text."],
  ["Topics detected for you", "Chunking follows the book's own section headings."],
];

export default function Home() {
  const { data: session, status } = useSession();

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="worksheet max-w-3xl w-full p-8 md:p-10">
        <p className="text-brass-400 font-medium mb-2 text-sm tracking-wide">Thermal / mechanical engineering prep</p>
        <h1 className="font-display text-4xl md:text-5xl font-semibold mb-4">ThermoPrep v2</h1>
        <p className="text-chalk-200 text-lg mb-8 max-w-2xl">
          Upload a textbook once. It's chunked by section, its figures are captured as real images, and
          every question you get gets scheduled for review — so you spend time on what you're actually weak on.
        </p>

        <dl className="grid sm:grid-cols-2 gap-4 mb-8">
          {POINTS.map(([title, desc]) => (
            <div key={title} className="border border-ink-700 rounded-xl p-4">
              <dt className="font-medium mb-1">{title}</dt>
              <dd className="text-sm text-chalk-400">{desc}</dd>
            </div>
          ))}
        </dl>

        {status === "loading" ? (
          <button className="bg-ink-700 px-5 py-3 rounded-xl font-semibold" disabled>
            Loading…
          </button>
        ) : session ? (
          <Link href="/dashboard" className="inline-block bg-brass-400 hover:bg-brass-300 text-ink-950 px-5 py-3 rounded-xl font-semibold transition-colors">
            Go to dashboard
          </Link>
        ) : (
          <button
            onClick={() => signIn("google")}
            className="bg-brass-400 hover:bg-brass-300 text-ink-950 px-5 py-3 rounded-xl font-semibold transition-colors"
          >
            Sign in with Google
          </button>
        )}
      </div>
    </main>
  );
}
