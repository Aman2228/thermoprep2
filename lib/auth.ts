import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { db } from "@/lib/supabase";

/**
 * v1 requested Google Drive scopes and carried a refresh-token dance through every
 * request, because textbooks lived in Drive. v2 uploads PDFs straight from the
 * browser and never touches Drive, so this is just identity: who is signed in.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],

  callbacks: {
    async signIn({ user }) {
      if (user.email) {
        const { error } = await db()
          .from("users_app")
          .upsert({ email: user.email, name: user.name, image: user.image });

        if (error) console.error("USERS_APP_UPSERT_FAILED:", error.message);
      }

      return true;
    },

    async jwt({ token }) {
      return token;
    },

    async session({ session }) {
      return session;
    },
  },
};
