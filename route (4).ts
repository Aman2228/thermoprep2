import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { getFiguresByIds } from "@/lib/figures";

/** Fetch stored textbook figures by id (used to show figures next to a revealed answer). */
export async function GET(req: NextRequest) {
  return handle(async () => {
    const user = await requireUser(req);
    const ids = (req.nextUrl.searchParams.get("ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);

    return { figures: await getFiguresByIds(user.email, ids) };
  });
}
