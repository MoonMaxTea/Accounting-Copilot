import { describe, expect, it } from "vitest";
import { parseCitation, resolveCitation, scanCitations } from "./citations";
import type { ParagraphIndexEntry } from "../types";

const sampleIndex: ParagraphIndexEntry[] = [
  {
    standard_id: "IFRS 11",
    paragraph: "7-8",
    paragraph_normalized: "7",
    pack_path: "current/IFRS/x.md",
    char_start: 10,
    char_end: 20,
    snippet_en: "Joint control",
    status: "current",
  },
  {
    standard_id: "IAS 28",
    paragraph: "16",
    paragraph_normalized: "16",
    pack_path: "current/IFRS/y.md",
    char_start: 100,
    char_end: 130,
    snippet_en: "Significant influence",
    status: "current",
  },
  {
    standard_id: "ASC 740",
    paragraph: "740-10-25-5",
    paragraph_normalized: "740-10-25-5",
    pack_path: "current/ASC/z.md",
    char_start: 50,
    char_end: 80,
    snippet_en: "Deferred tax",
    status: "current",
  },
];

describe("parseCitation", () => {
  it("parses IFRS 11 §7–8", () => {
    expect(parseCitation("IFRS 11 §7–8")).toEqual({
      standardId: "IFRS 11",
      paragraph: "7-8",
    });
  });

  it("parses IAS 28 §16", () => {
    expect(parseCitation("IAS 28 §16")).toEqual({
      standardId: "IAS 28",
      paragraph: "16",
    });
  });

  it("parses ASC 740-10-25-5", () => {
    expect(parseCitation("ASC 740-10-25-5")).toEqual({
      standardId: "ASC 740",
      paragraph: "740-10-25-5",
    });
  });

  it("returns null for unrelated text", () => {
    expect(parseCitation("not a citation")).toBeNull();
  });
});

describe("resolveCitation", () => {
  it("resolves IFRS citation against paragraph index", () => {
    const target = resolveCitation("IFRS 11 §7-8", sampleIndex);
    expect(target).toMatchObject({
      standard_id: "IFRS 11",
      paragraph: "7-8",
      char_start: 10,
      resolved: true,
    });
  });

  it("returns null when paragraph is missing", () => {
    expect(resolveCitation("IFRS 99 §1", sampleIndex)).toBeNull();
  });
});

describe("scanCitations", () => {
  it("finds multiple citations in note text", () => {
    const found = scanCitations(
      "See IFRS 11 §7-8 and ASC 740-10-25-5 for details.",
    );
    expect(found).toEqual(["ASC 740-10-25-5", "IFRS 11 §7-8"]);
  });
});
