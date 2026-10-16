const MINIMAL_DOCX_BASE64 =
  "UEsDBAoAAAAIAMltJl15bjPX6AAAAK0BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QyU7DMBD9FWuuKHHggBCK0wPLETiUDxjZk8SqN3nc0v49Tlt6QIXjzFv1+tXeO7GjzDYGBbdtB4KCjsaGScHn+rV5AMEFg0EXAyk4EMNq6NeHRCyqNrCCuZT0KCXrmTxyGxOFiowxeyz1zJNMqDc4kbzrunupYygUSlMWDxj6Zxpx64p42df3qUcmxyCeTsQlSwGm5KzGUnG5C+ZXSnNOaKvyyOHZJr6pBJBXExbk74Cz7r0Ok60h8YG5vKGvLPkVs5Em6q2vyvZ/mys94zhaTRf94pZy1MRcF/euvSAebfjpL49zD99QSwMECgAAAAAAyW0mXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMECgAAAAgAyW0mXZv9N+qtAAAAKQEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4KtE3mlaBoRQ0y4IqSsqB7ASN61oHkrCo7cnAwNFDIy2f3+W6/ZpZnanECdnBVRFCYysdGqyWsClP232wGJCq3B2lgQsFKFt6jPNmPJKHCcfWTZsFDCm5A+cRzmSwVg4TzZPBhcMplwGzT3KK2ri27Lc8fBpwNpknRIQOlUB6xdP/9huGCZJRydvhmz6ceIrkWUMmpKAhwuKq3e7yCzwpuarF5sXUEsDBAoAAAAAAMltJl0AAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMECgAAAAgAyW0mXY2EWfTSAAAAOwEAABEAAAB3b3JkL2RvY3VtZW50LnhtbG2PTWrEMAyFryK8b5x2UUpIMsymy1JoewCPrZkYbNnIymRy+9rTRaF084R+3sfTeLjFAFfk4hNN6rHrFSDZ5DxdJvX1+frwoqCIIWdCIpzUjkUd5nEbXLJrRBKoACrDNqlFJA9aF7tgNKVLGanuzomjkdryRW+JXeZksZTKj0E/9f2zjsaTashTcnuruQk3kfljJ1lQvIWcWMzJBy87nP1NVsZu1O2mKd81/7W/VdNS8zMcBYNHBpNrgis6qFgQLAK80v+gglbeWd8HP9n079/zN1BLAQIUAAoAAAAIAMltJl15bjPX6AAAAK0BAAATAAAAAAAAAAAAAAAAAAAAAABbQ29udGVudF9UeXBlc10ueG1sUEsBAhQACgAAAAAAyW0mXQAAAAAAAAAAAAAAAAYAAAAAAAAAAAAQAAAAGQEAAF9yZWxzL1BLAQIUAAoAAAAIAMltJl2b/TfqrQAAACkBAAALAAAAAAAAAAAAAAAAAD0BAABfcmVscy8ucmVsc1BLAQIUAAoAAAAAAMltJl0AAAAAAAAAAAAAAAAFAAAAAAAAAAAAEAAAABMCAAB3b3JkL1BLAQIUAAoAAAAIAMltJl2NhFn00gAAADsBAAARAAAAAAAAAAAAAAAAADYCAAB3b3JkL2RvY3VtZW50LnhtbFBLBQYAAAAABQAFACABAAA3AwAAAAA=";

function escapePdfText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildSyntheticDocxFixture() {
  return Buffer.from(MINIMAL_DOCX_BASE64, "base64");
}

export function buildSyntheticPdfFixture() {
  const lines = [
    "Synthetic PDF ingestion fixture for Pliny reliability tests.",
    "The document contains readable text, stable page provenance, and no private data.",
    "Aster Field Labs calibrates every sensor after one hundred and eighty operating days.",
    "This final sentence keeps the fixture above the minimum extraction word count.",
  ];
  const content = lines
    .map((line, index) => `BT /F1 11 Tf 60 ${750 - index * 22} Td (${escapePdfText(line)}) Tj ET`)
    .join("\n");
  const objects = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] = "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[5] = `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 1; index <= 5; index += 1) {
    offsets[index] = Buffer.byteLength(pdf);
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefPosition = Buffer.byteLength(pdf);
  pdf += "xref\n0 6\n0000000000 65535 f \n";
  for (let index = 1; index <= 5; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPosition}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

/**
 * A structurally valid, text-extractable PDF of exactly `targetBytes` bytes. The size comes from
 * a never-painted image stream (like the embedded scans that make real PDFs large), so it parses
 * and extracts quickly while still exercising the byte size of the upload path.
 */
export function buildSizedPdfFixture(targetBytes, { pages = 12, seed = "sized" } = {}) {
  const pageCount = pages;
  const fontObject = 3 + pageCount * 2;
  const imageObject = fontObject + 1;
  const objectCount = imageObject;

  function build(fillerLength) {
    const objects = [];
    objects[1] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>");
    const kids = Array.from({ length: pageCount }, (_, index) => `${3 + index * 2} 0 R`).join(" ");
    objects[2] = Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`);

    for (let page = 0; page < pageCount; page += 1) {
      const pageObject = 3 + page * 2;
      const contentObject = pageObject + 1;
      const lines = Array.from(
        { length: 14 },
        (_, line) =>
          `${seed} fixture page ${page + 1} line ${line + 1}: Aster Field Labs records calibration reading ${page * 100 + line} for sensor group ${(page + line) % 9} in the quarterly review.`
      );
      const content = lines.map((line, index) => `BT /F1 10 Tf 40 ${760 - index * 18} Td (${escapePdfText(line)}) Tj ET`).join("\n");
      const xobject = page === 0 ? ` /XObject << /Im0 ${imageObject} 0 R >>` : "";
      objects[pageObject] = Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontObject} 0 R >>${xobject} >> /Contents ${contentObject} 0 R >>`
      );
      objects[contentObject] = Buffer.from(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    }

    objects[fontObject] = Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    // Deterministic filler so repeated runs upload identical bytes.
    const filler = Buffer.alloc(fillerLength);
    let state = 0x9e3779b9 ^ seed.length;
    for (let index = 0; index < fillerLength; index += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      filler[index] = state >>> 24;
    }
    objects[imageObject] = Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${fillerLength} >>\nstream\n`
      ),
      filler,
      Buffer.from("\nendstream"),
    ]);

    const chunks = [Buffer.from("%PDF-1.4\n")];
    const offsets = [0];
    let position = chunks[0].length;

    for (let index = 1; index <= objectCount; index += 1) {
      offsets[index] = position;
      const body = Buffer.concat([Buffer.from(`${index} 0 obj\n`), objects[index], Buffer.from("\nendobj\n")]);
      chunks.push(body);
      position += body.length;
    }

    let xref = `xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index <= objectCount; index += 1) {
      xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`;
    chunks.push(Buffer.from(xref));

    return Buffer.concat(chunks);
  }

  let fillerLength = Math.max(0, targetBytes - 20_000);
  let pdf = build(fillerLength);

  for (let attempt = 0; attempt < 5 && pdf.length !== targetBytes; attempt += 1) {
    fillerLength += targetBytes - pdf.length;
    pdf = build(fillerLength);
  }

  if (pdf.length !== targetBytes) {
    throw new Error(`Unable to build a ${targetBytes}-byte PDF fixture (got ${pdf.length}).`);
  }

  return pdf;
}
