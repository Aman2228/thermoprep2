# ThermoPrep v2

Spaced-repetition prep for thermal / mechanical engineering, grounded in your own textbook PDFs.
A ground-up rebuild of ThermoPrep AI with four goals: a smarter quiz strategy, a better interface,
structure-aware chunking with real figure capture, and OCR for pages whose text can't be selected.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill it in (Google OAuth, Supabase, Gemini or OpenAI key).
3. Run `supabase/migration.sql` once in the Supabase SQL editor.
4. `npm run dev` and open http://localhost:3000

Google OAuth is used only for identity. No Drive scopes are requested; PDFs never leave your browser.
Embeddings are 768-dimensional (matches the `vector(768)` column).

Checks: `npm run typecheck`, `npm test`.

## How it works

### 1. Ingest (all in the browser: `lib/pdf-extract.ts`, `lib/ocr.ts`)
- pdf.js renders every page once to a canvas and extracts text lines with **font sizes**.
- **Scanned pages** (fewer than 40 selectable characters) are OCR'd with Tesseract.js, so their content still becomes searchable and quizzable. First OCR use downloads the language model from a CDN (browser needs internet).
- **Figures**: the page's operator list is replayed on a throwaway canvas context to track the transform matrix natively, giving the exact bounding box of every embedded image. Captions ("Fig. 5.3 ...") are matched to the nearest image and the image is cropped from the rendered page. If a caption has no nearby raster image (typical for vector T-s / p-V diagrams), the full page is captured instead.
- Optional: OCR the text inside figures (axis labels etc.).
- Text goes to the server in batches of pages, figures in small batches, so no request gets large.

### 2. Chunking (`lib/chunking.ts`, `/api/documents/[id]/finalize`)
- Headings are detected from font size and numbering ("5.3 Rankine Cycle"). Each heading becomes an auto-detected **topic**.
- Sections are split into overlapping chunks on **sentence boundaries only** (abbreviation-aware), with tiny tails merged.
- Every chunk stores its topic, section title and page range.

### 3. Quiz strategy (`lib/srs.ts`, `lib/quiz-engine.ts`)
- Questions are generated once, saved to a **question bank** with topic and difficulty, and reused.
- Each (user, question) has an **SM-2** review record; a session pulls what is due first.
- Rolling per-topic **mastery** drives weak-topic targeting and the difficulty asked of the AI.
- Modes: **Adaptive** (due + weakest topics), **Topic** drill, **Mock** (stratified across topics, timed, answers hidden until the end).
- Per-question feedback with page citation and the textbook's own figures. Short answers are AI-graded with partial credit.

### 4. Interface
Engineering-logbook look (blueprint ink, brass accent, "worksheet" cards), a topic picker instead of a free-text box, keyboard shortcuts in practice (1-4 to choose, Enter to submit/continue), live pipeline progress on upload, dashboard with due count, streak and weakest topics.

## Known limits
- The PDF is not stored. Re-upload it to re-process.
- Heading detection depends on font-size differences; on OCR'd pages there is no font data, so those pages fall into the preceding topic.
- Figures are stored as compressed JPEG data URLs, capped at 60 per document.
- Untested against your live services: the code was typechecked, unit-tested (chunking, SRS, scoring, JSON, math) and production-built, but PDF extraction, OCR, Supabase and the AI calls were not run end to end.
