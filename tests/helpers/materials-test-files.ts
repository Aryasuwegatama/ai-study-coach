import { strToU8, zipSync } from "fflate";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Reuse T-07a's shared fixtures when available; until #51 lands, generate
 * equivalent small inputs at runtime rather than duplicating its binaries. */
export function materialSecurityFixture(
  name: "invalid-pdf.pdf" | "missing-presentation.pptx" | "whitespace-only.txt",
  fallback: () => Buffer,
): Buffer {
  try {
    return readFileSync(resolve("tests/fixtures/security", name));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return fallback();
  }
}

/** Tiny synthetic PDF; byte offsets are calculated, not fixture placeholders. */
export function materialTestPdf(pages: string[]): Buffer {
  const objects: string[] = [];
  const ids = pages.map((_, index) => 4 + index * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${ids.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  pages.forEach((text, index) => {
    const content = `BT /F1 11 Tf 40 750 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`;
    objects[ids[index]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${ids[index] + 1} 0 R >>`;
    objects[ids[index] + 1] =
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  });
  let output = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output);
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const start = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++)
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(output, "latin1");
}

/** Archive entries are reversed to catch accidental filename-order extraction. */
export function materialTestPptx(slides: string[]): Buffer {
  const files: Record<string, Uint8Array> = {};
  const escape = (value: string) =>
    value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  files["ppt/presentation.xml"] = strToU8(
    `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slides.map((_, index) => `<p:sldId id="${index + 256}" r:id="rId${index + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`,
  );
  files["ppt/_rels/presentation.xml.rels"] = strToU8(
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slides.length - index}.xml"/>`).join("")}</Relationships>`,
  );
  slides.forEach((text, index) => {
    files[`ppt/slides/slide${slides.length - index}.xml`] = strToU8(
      `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${escape(text)}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
    );
  });
  return Buffer.from(zipSync(files));
}

export function missingPresentationArchive(): Buffer {
  return Buffer.from(
    zipSync({
      "synthetic-note.txt": strToU8("Synthetic fixture: not a presentation"),
    }),
  );
}
