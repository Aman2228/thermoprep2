"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Callout from "@/components/Callout";
import MeterBar from "@/components/MeterBar";
import Navbar from "@/components/Navbar";
import RequireAuth from "@/components/RequireAuth";
import { useApi } from "@/hooks/useApi";
import type { StatsSummary } from "@/types/app";

const TILES = [
  { href: "/library", title: "Library", desc: "Upload a PDF and it's chunked, topic-tagged, and figure-captured." },
  { href: "/learn", title: "Learn", desc: "A derivation-first explainer for one topic at a time." },
  { href: "/session?mode=adaptive", title: "Adaptive review", desc: "Whatever's due, plus your weakest topics." },
  { href: "/session?mode=mock", title: "Mock test", desc: "Timed, stratified across every topic you've processed." },
];

export default function DashboardPage() {
  const { call, error } = useApi<{ stats: StatsSummary }>();
  const [stats, setStats] = useState<StatsSummary | null>(null);

  useEffect(() => {
    call("/api/stats").then((data) => data && setStats(data.stats));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <RequireAuth>
      <main className="min-h-screen">
        <Navbar />

        <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-8">
          <section>
            <h1 className="font-display text-3xl font-semibold mb-1">Dashboard</h1>
            <p className="text-chalk-400">Your logbook, at a glance.</p>
          </section>

          {error && <Callout kind="error">{error}</Callout>}

          {stats && (
            <>
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  ["Due for review", stats.dueToday],
                  ["Day streak", stats.streakDays],
                  ["30-day accuracy", `${Math.round(stats.averageAccuracy * 100)}%`],
                  ["Topics mastered", stats.masteredTopics],
                ].map(([label, value]) => (
                  <div key={label as string} className="worksheet p-4">
                    <p className="text-sm text-chalk-400">{label}</p>
                    <p className="font-display text-3xl font-semibold mt-1">{value}</p>
                  </div>
                ))}
              </section>

              {stats.dueToday > 0 && (
                <Link
                  href="/session?mode=adaptive"
                  className="block worksheet p-5 border-brass-500/60 hover:border-brass-400 transition-colors"
                >
                  <p className="font-medium">
                    {stats.dueToday} question{stats.dueToday === 1 ? "" : "s"} due for review →
                  </p>
                  <p className="text-sm text-chalk-400 mt-1">Start an adaptive session and clear the queue.</p>
                </Link>
              )}

              {stats.weakTopics.length > 0 && (
                <section className="worksheet p-5">
                  <h2 className="font-medium mb-4">Weakest topics</h2>
                  <div className="space-y-3">
                    {stats.weakTopics.map((t) => (
                      <div key={t.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{t.label}</span>
                          <span className="text-chalk-400">{Math.round(t.mastery * 100)}%</span>
                        </div>
                        <MeterBar value={t.mastery} tone={t.mastery < 0.35 ? "danger" : "brass"} />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <section className="grid sm:grid-cols-2 gap-4">
            {TILES.map((tile) => (
              <Link key={tile.href} href={tile.href} className="worksheet p-5 hover:border-brass-400 transition-colors">
                <h3 className="font-medium mb-1">{tile.title}</h3>
                <p className="text-sm text-chalk-400">{tile.desc}</p>
              </Link>
            ))}
          </section>
        </div>
      </main>
    </RequireAuth>
  );
}
