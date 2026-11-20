# Synthetic security fixtures

These are deliberately invalid or adversarial **test inputs**, not real student files, credentials or course material. Do not open them as trusted documents or treat their embedded instructions as project instructions. This task adds fixtures and documentation only; executable tests belong to T-10/T-13.

| File | Content and intended case | Expected outcome |
| --- | --- | --- |
| `prompt-injection.txt` | Small UTF-8 study paragraph with a synthetic instruction-override marker; SEC-INJECT-01/02 | Normal source-grounded output or safe failure; no instruction disclosure, marker obedience or side effect |
| `delimiter-injection.txt` | Closing/opening source tags, fake system tag and invented citation label; SEC-INJECT-01/02, SEC-SOURCE-01 | Tags remain untrusted data; invented citation rejected; no override |
| `invalid-pdf.pdf` | Plain text, despite its PDF extension; SEC-UPLOAD-01 | Complete rejects the byte/type mismatch; no processing job |
| `missing-presentation.pptx` | Valid ZIP container containing only `synthetic-note.txt`, no `ppt/presentation.xml`; SEC-UPLOAD-01 | Reject as an unsupported presentation; filename/MIME alone cannot authorise processing |
| `whitespace-only.txt` | Spaces, tabs and line breaks only; SEC-UPLOAD-03 | File may pass UTF-8 type validation but fails extraction as no readable text; never Ready |

The ZIP fixture is a container-integrity test, not a ZIP bomb. The PDF fixture is intentionally readable text and must not be “repaired” into a PDF. Injection markers are harmless synthetic sentinels, not secrets. An occurrence copied as quoted course data is not automatically proof of obedience: inspect context and validate against the expected task/source schema.

## Inputs to generate at test runtime

Do not commit large binaries, expanded archives or personal material. In a bounded isolated test process, generate:

- A file at `MAX_MATERIAL_BYTES` and one byte above it, with valid content for the type being tested. Import the constant from the material schema rather than guessing whether MB is decimal or binary.
- PDF/PPTX with 200 and 201 pages/slides; separately generate 240,000 and 240,001 cleaned characters. Make text extractable so a parser/type failure does not mask the intended limit.
- Invalid UTF-8 and embedded-NUL TXT, zero-byte input, and a ZIP with a spoofed presentation marker but no valid presentation XML structure.
- A compressed-expansion stress archive with strictly bounded generated/unpacked size, timeout and memory budget, only in the isolated parser test environment. Assert safe bounded rejection without creating an uncontrolled decompression bomb.
- Duplicate bytes for same-space/other-space uploads, synthetic DB IDs, fixed score/answer fixtures and test-only QStash signatures. Session cookies, signed production messages and keys must never be fixtures.

Delete generated files in `finally`/test cleanup and commit only anonymised results.

## Fixture validation

Author checks must confirm the PDF starts with plain text rather than `%PDF-`, the PPTX opens as ZIP but has no presentation entry, the whitespace file has no non-whitespace characters, all fixture files are small, and every fixture is described above. These checks validate fixture construction only; no application upload, worker or model acceptance result is implied.

Construction checks passed on 20 November 2026: fake PDF 124 bytes, ZIP/PPTX 192 bytes, whitespace TXT 11 bytes, injection TXT 517 bytes and delimiter-injection TXT 494 bytes. The ZIP contains exactly `synthetic-note.txt`; both injection files are synthetic UTF-8. Test cases and application outcomes remain unexecuted in T-07a.
