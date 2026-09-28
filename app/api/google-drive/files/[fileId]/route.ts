import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDriveClient } from "@/lib/googleDrive";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }

    const { fileId } = await params;
    const drive = getDriveClient(session.accessToken);

    const response = await drive.files.get(
      {
        fileId,
        alt: "media",
      },
      {
        responseType: "arraybuffer",
      },
    );

    return new NextResponse(response.data as ArrayBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    console.error("GOOGLE_DRIVE_DOWNLOAD_FAILED:", error);

    return NextResponse.json(
      { error: "Failed to download file from Google Drive" },
      { status: 500 },
    );
  }
}
