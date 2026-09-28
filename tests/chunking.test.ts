import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkDocument, extractCaption, splitSentences, type ExtractedPage } from "../lib/chunking";

const body = (text: string) => ({ text, size: 11 });
const head = (text: string) => ({ text, size: 16 });

const pages: ExtractedPage[] = [
  {
    pageNumber: 1,
    isScanned: false,
    lines: [
      head("5.1 Rankine Cycle"),
      body("The Rankine cycle is the ideal cycle for vapor power plants. Water is pumped to boiler pressure. Heat is added at constant pressure in the boiler."),
      body("Fig. 5.2 T-s diagram of the simple Rankine cycle"),
      body("Steam then expands isentropically in the turbine, producing work. It is condensed at constant pressure."),
    ],
  },
  {
    pageNumber: 2,
    isScanned: false,
    lines: [
      head("5.2 Reheat Cycle"),
      body("Reheating raises the average temperature of heat addition. It also reduces moisture at the turbine exit."),
    ],
  },
  { pageNumber: 3, isScanned: true, lines: [] },
];

test("detects headings as topics and tags chunks with them", () => {
  const { chunks, topics } = chunkDocument(pages);
  assert.deepEqual(topics.map((t) => t.label), ["5.1 Rankine Cycle", "5.2 Reheat Cycle"]);
  assert.ok(chunks.every((c) => c.sectionTitle.length > 0));
  assert.equal(chunks[0].sectionTitle, "5.1 Rankine Cycle");
});

test("captions attach to the chunk on their page and are not treated as headings", () => {
  const { chunks } = chunkDocument(pages);
  const withFigure = chunks.find((c) => c.figures.length > 0);
  assert.ok(withFigure);
  assert.match(withFigure!.figures[0].caption, /Fig\. 5\.2/);
});

test("scanned pages without OCR text contribute nothing", () => {
  const { chunks } = chunkDocument(pages);
  assert.ok(chunks.every((c) => c.pageEnd <= 2));
});

test("chunks never start mid-sentence", () => {
  const { chunks } = chunkDocument(pages);
  for (const c of chunks) assert.match(c.content[0], /[A-Z0-9(]/);
});

test("sentence splitter keeps abbreviations together", () => {
  const s = splitSentences("See Fig. 5.3 for details. The value is 3.5 kg. e.g. steam is used. Next point.");
  assert.equal(s[0], "See Fig. 5.3 for details.");
});

test("extractCaption parses figure lines", () => {
  assert.equal(extractCaption("Figure 3.4: Brayton cycle layout"), "Fig. 3.4 Brayton cycle layout");
  assert.equal(extractCaption("Not a caption at all"), null);
});
