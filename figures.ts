import { db } from "@/lib/supabase";
import type { CommonsImage, FigureRecord } from "@/types/app";

/**
 * Real figures now come from the textbook itself (extracted client-side, see
 * lib/pdf-extract.ts) and are stored in the `figures` table. Wikimedia Commons is
 * only a fallback for topics whose textbook pages carry no image at all.
 */

export async function getFiguresByIds(email: string, ids: string[]): Promise<FigureRecord[]> {
  if (ids.length === 0) return [];

  const { data, error } = await db()
    .from("figures")
    .select("id,document_id,page,kind,caption,ocr_text,image_data_url,documents(title)")
    .eq("user_email", email)
    .in("id", ids);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    documentId: String(row.document_id),
    documentTitle: String((row as { documents?: { title?: string } }).documents?.title ?? "Textbook"),
    page: Number(row.page),
    kind: row.kind === "full-page" ? "full-page" : "embedded",
    caption: String(row.caption ?? ""),
    ocrText: row.ocr_text ? String(row.ocr_text) : null,
    imageDataUrl: String(row.image_data_url),
  }));
}

export async function getFiguresForPages(
  email: string,
  documentId: string,
  pageStart: number,
  pageEnd: number,
  max = 3,
): Promise<FigureRecord[]> {
  const { data, error } = await db()
    .from("figures")
    .select("id,document_id,page,kind,caption,ocr_text,image_data_url,documents(title)")
    .eq("user_email", email)
    .eq("document_id", documentId)
    .gte("page", pageStart)
    .lte("page", pageEnd)
    .order("page", { ascending: true })
    .limit(max);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    documentId: String(row.document_id),
    documentTitle: String((row as { documents?: { title?: string } }).documents?.title ?? "Textbook"),
    page: Number(row.page),
    kind: row.kind === "full-page" ? "full-page" : "embedded",
    caption: String(row.caption ?? ""),
    ocrText: row.ocr_text ? String(row.ocr_text) : null,
    imageDataUrl: String(row.image_data_url),
  }));
}

const ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const OK_MIME = new Set(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]);

interface CommonsPage {
  title?: string;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    mime?: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
}

const stripHtml = (html: string) =>
  html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

export async function searchCommonsImages(query: string, limit = 4): Promise<CommonsImage[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrsearch: query,
    gsrlimit: String(Math.min(limit * 3, 12)),
    prop: "imageinfo",
    iiprop: "url|mime|extmetadata",
    iiurlwidth: "800",
  });

  const response = await fetch(`${ENDPOINT}?${params}`, {
    headers: { "User-Agent": "ThermoPrepAI/2.0 (personal study app)" },
    next: { revalidate: 60 * 60 * 24 },
  });

  if (!response.ok) return [];

  const json = (await response.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  const pages = Object.values(json.query?.pages ?? {});
  const images: CommonsImage[] = [];

  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl || !info.url || !info.mime || !OK_MIME.has(info.mime)) continue;

    images.push({
      title: (page.title ?? "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, ""),
      thumbUrl: info.thumburl,
      fullUrl: info.url,
      pageUrl: info.descriptionurl ?? info.url,
      license: stripHtml(info.extmetadata?.LicenseShortName?.value ?? "See source"),
      artist: stripHtml(info.extmetadata?.Artist?.value ?? "Unknown"),
    });

    if (images.length >= limit) break;
  }

  return images;
}
