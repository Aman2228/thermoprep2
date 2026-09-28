"use client";

import { signIn, useSession } from "next-auth/react";

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return <main className="min-h-screen flex items-center justify-center text-chalk-400">Loading…</main>;
  }

  if (!session) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="worksheet max-w-md w-full p-8 text-center">
          <h1 className="text-2xl font-semibold mb-3">Sign in required</h1>
          <p className="text-chalk-400 mb-6">Sign in with Google to open ThermoPrep.</p>
          <button
            onClick={() => signIn("google")}
            className="bg-brass-400 hover:bg-brass-300 text-ink-950 font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
