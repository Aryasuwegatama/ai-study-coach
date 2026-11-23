import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { checkUploadedFile } from "@/features/materials/server/verify-file";
import { extractMaterialText } from "@/features/materials/server/extract-text";
import {
  MAX_MATERIAL_BYTES,
  MAX_MATERIAL_PAGES,
  MAX_MATERIAL_CHARS,
} from "@/features/materials/materials-schemas";
import {
  materialTestPdf,
  materialTestPptx,
  missingPresentationArchive,
} from "../helpers/materials-test-files";

describe("T-10 file verification and bounded extraction", () => {
  it.each([
    ["fake PDF", "notes.pdf", () => Buffer.from("synthetic plain text")],
    ["ZIP without presentation", "slides.pptx", missingPresentationArchive],
    ["invalid UTF-8", "notes.txt", () => Buffer.from([0xc3, 0x28])],
    ["NUL in UTF-8", "notes.txt", () => Buffer.from("safe\0unsafe")],
    ["zero bytes", "notes.txt", () => Buffer.alloc(0)],
    ["unrecognised extension", "notes.exe", () => Buffer.from("synthetic")],
  ] as const)(
    "SEC-UPLOAD-01: rejects %s based on server bytes/type",
    (_label, name, bytes) => {
      expect(checkUploadedFile(name, bytes())).toEqual({
        ok: false,
        code: "UNSUPPORTED_FILE_TYPE",
      });
    },
  );

  it.each(["notes.txt", "notes.PDF", "slides.pptx"])(
    "SEC-UPLOAD-01: valid synthetic %s passes real-byte checks",
    (name) => {
      const bytes = name.endsWith(".txt")
        ? Buffer.from("Synthetic study notes.")
        : name.endsWith(".PDF")
          ? materialTestPdf(["Synthetic PDF text."])
          : materialTestPptx(["Synthetic slide text."]);
      expect(checkUploadedFile(name, bytes)).toEqual({
        ok: true,
        hash: createHash("sha256").update(bytes).digest("hex"),
      });
    },
  );

  it("SEC-UPLOAD-02: exact byte cap passes and one byte above fails", () => {
    expect(
      checkUploadedFile("notes.txt", Buffer.alloc(MAX_MATERIAL_BYTES, 65)).ok,
    ).toBe(true);
    expect(
      checkUploadedFile("notes.txt", Buffer.alloc(MAX_MATERIAL_BYTES + 1, 65)),
    ).toEqual({ ok: false, code: "FILE_TOO_LARGE" });
  });

  it("SEC-UPLOAD-03: whitespace is valid UTF-8 but cannot become readable study content", async () => {
    const bytes = Buffer.from(" \t\r\n \n");
    expect(checkUploadedFile("notes.txt", bytes).ok).toBe(true);
    await expect(extractMaterialText("notes.txt", bytes)).rejects.toMatchObject(
      { code: "NO_READABLE_TEXT" },
    );
  });

  it("SEC-UPLOAD-03: extracted character cap is enforced at its boundary", async () => {
    expect(
      (
        await extractMaterialText(
          "notes.txt",
          Buffer.alloc(MAX_MATERIAL_CHARS, 65),
        )
      ).charCount,
    ).toBe(MAX_MATERIAL_CHARS);
    await expect(
      extractMaterialText(
        "notes.txt",
        Buffer.alloc(MAX_MATERIAL_CHARS + 1, 65),
      ),
    ).rejects.toMatchObject({ code: "TOO_MUCH_TEXT" });
  });

  it.each(["pdf", "pptx"] as const)(
    "SEC-UPLOAD-03: accepts 200 %s pages/slides, rejects 201",
    async (extension) => {
      const generate = extension === "pdf" ? materialTestPdf : materialTestPptx;
      const pages = Array.from(
        { length: MAX_MATERIAL_PAGES },
        (_, index) =>
          `Unique synthetic lecture content for section ${index + 1}.`,
      );
      expect(
        (await extractMaterialText(`notes.${extension}`, generate(pages)))
          .pageCount,
      ).toBe(MAX_MATERIAL_PAGES);
      await expect(
        extractMaterialText(
          `notes.${extension}`,
          generate([...pages, "An extra synthetic section."]),
        ),
      ).rejects.toMatchObject({ code: "TOO_MANY_PAGES" });
    },
  );

  it("SEC-UPLOAD-03: presentation relationships determine slide order", async () => {
    const result = await extractMaterialText(
      "slides.pptx",
      materialTestPptx([
        "First: database keys",
        "Second: network controls",
        "Third: transaction isolation",
      ]),
    );
    expect(result.units.map((unit) => unit.text)).toEqual([
      "First: database keys",
      "Second: network controls",
      "Third: transaction isolation",
    ]);
  });

  it("SEC-UPLOAD-01: marker spoofing cannot turn a malformed archive into extracted content", async () => {
    const bytes = Buffer.from(
      zipSync({
        "ppt/presentation.xml": strToU8("not valid presentation XML"),
      }),
    );
    // Initial byte heuristic can pass; the extractor must still fail safely.
    expect(checkUploadedFile("slides.pptx", bytes).ok).toBe(true);
    await expect(
      extractMaterialText("slides.pptx", bytes),
    ).rejects.toMatchObject({ code: "PROCESSING_FAILED" });
  });

  it("SEC-UPLOAD-03: rejects oversized declared ZIP expansion before inflating", async () => {
    const bytes = Buffer.from(
      zipSync({ "ppt/presentation.xml": strToU8("Tiny synthetic payload") }),
    );
    const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    expect(central).toBeGreaterThan(0);
    // Only the declared size is malicious; no large/bomb payload is allocated.
    bytes.writeUInt32LE(51_000_000, 22);
    bytes.writeUInt32LE(51_000_000, central + 24);
    expect(bytes.length).toBeLessThan(4096);
    await expect(
      extractMaterialText("slides.pptx", bytes),
    ).rejects.toMatchObject({ code: "TOO_MUCH_TEXT" });
  });
});
