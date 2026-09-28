import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import { searchCommonsImages } from "@/lib/figures";

export async function GET(req: NextRequest) {
  return handle(async () => {
    await requireUser(req);

    const query = req.nextUrl.searchParams.get("q")?.trim();
    if (!query) throw new ApiError(400, "q is required.");

    const images = await searchCommonsImages(query, 4);
    return { images };
  });
}
