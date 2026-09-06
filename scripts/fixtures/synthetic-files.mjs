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
