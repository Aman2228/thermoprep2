import { google } from "googleapis";

export function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();

  auth.setCredentials({
    access_token: accessToken,
  });

  return google.drive({
    version: "v3",
    auth,
  });
}

export async function listDrivePdfs(accessToken: string) {
  const drive = getDriveClient(accessToken);

  const response = await drive.files.list({
    q: "trashed = false and mimeType = 'application/pdf'",
    fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: 100,
  });

  return response.data.files ?? [];
}
