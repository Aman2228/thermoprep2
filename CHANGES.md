# Changes from v1

| Area | v1 | v2 |
|---|---|---|
| Source | Google Drive import, server-side pdf-parse | Browser upload, client-side pdf.js; no Drive, no PDF storage |
| Scanned pages | Silently empty | Tesseract OCR |
| Figures | Whole page shown when a caption regex matched | Cropped embedded images matched to captions; full-page fallback for vector diagrams; optional OCR of figure text |
| Chunking | Fixed-size windows over flattened text | Heading-aware sections, sentence-boundary splits, auto topics |
| Topic choice | Free-text box | Detected topics with mastery/due counts |
| Quizzing | Generate fresh, score whole quiz once | Question bank, SM-2 scheduling, per-question attempts, topic mastery, adaptive difficulty |
| Feedback | After whole quiz | Immediately per question (not in mock mode) |
| Auth | NextAuth + Drive scopes + token refresh | NextAuth identity only |

## Dropped on purpose
AI-drawn SVG diagrams (replaced by real captured figures), separate History / Mock-test pages (folded into Practice), and the extension mini-quiz/interview generators.
