import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listDrivePdfs } from "@/lib/googleDrive";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const files = await listDrivePdfs(session.accessToken);

    return NextResponse.json({ files });
  } catch (error) {
    console.error("GOOGLE_DRIVE_FILES_FAILED:", error);

    return NextResponse.json(
      { error: "Failed to access Google Drive" },
      { status: 500 },
    );
  }
}
