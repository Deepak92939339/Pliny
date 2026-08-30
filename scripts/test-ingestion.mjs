import assert from "node:assert/strict";
import { xlsxProcessor } from "../src/lib/document-processing/plugins/xlsx.ts";

const fixture = Buffer.from(
  "UEsDBBQAAAAIAKELH13xqbA++gAAAKQCAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbLWSzU7DMBCEX8XyFcVOe0AIJemBnyNwKA+wOJvEiv/kdUt4e5y0cEClEhI9reydmW9kudpM1rA9RtLe1XwlSs7QKd9q19f8dftY3PBNU20/AhLLUkc1H1IKt1KSGtACCR/Q5U3no4WUj7GXAdQIPcp1WV5L5V1Cl4o0Z/CmuscOdiaxhylfH7ARDXF2dxDOrJpDCEYrSHkv9679QSmOBJGdi4YGHegqC7g8SZg3vwOOvuf8DlG3yF4gpiewWSUnI999HN+8H8X5kBMtfddpha1XO5stgkJEaGlATNaIZQoL2n31PsNfxCSXsfrnIt/5f+yxvnQPuXy75hNQSwMEFAAAAAgAoQsfXRxJ976kAAAAFgEAAAsAAABfcmVscy8ucmVsc43PsQ6CMBAG4FdpbpeigzGGwmJMWA0+QC1HaaC9pq2Kb29HMQ6Ol/vvu/xVs9iZPTBEQ07AtiiBoVPUG6cFXLvz5gBNXV1wlikn4mh8ZPnERQFjSv7IeVQjWhkL8ujyZqBgZcpj0NxLNUmNfFeWex4+DVibrO0FhLbfAuteHv+xaRiMwhOpu0WXfrz4SmRZBo1JwDLzJ4XpRjQVGQVeV3xVsH4DUEsDBBQAAAAIAKELH13SKAN8vAAAADkBAAAPAAAAeGwvd29ya2Jvb2sueG1sjZC7DsIwDEV/JfIOKR0QqtqyABILE3xAaF0a0cSVHR6fT6BUohuTX0f32s7XT9epO7JY8gUs5gko9BXV1l8KOB13sxWsy/xBfD0TXVWkvRTQhtBnWkvVojMypx59nDTEzoRY8kVLz2hqaRGD63SaJEvtjPUwKGT8jwY1ja1wQ9XNoQ+DCGNnQtxVWtsLlPnHQb5ReeOwgO0zagkKqE93X8fDQHFmY8L7egF6yh8oTOD0B07fsB5d9PiI8gVQSwMEFAAAAAgAoQsfXYprOxqvAAAApAEAABoAAAB4bC9fcmVscy93b3JrYm9vay54bWwucmVsc72QyQrCMBBAfyXM3U7bg4g07UWEXqV+QEinC20Wkrj9vUFQLPTgydMw25vHFNVdzexKzo9Gc8iSFBhpadpR9xzOzXGzg6osTjSLECf8MFrP4or2HIYQ7B7Ry4GU8ImxpGOnM06JEFPXoxVyEj1hnqZbdN8MWDJZ3XJwdZsBax6WfmGbrhslHYy8KNJh5QTejJv8QBQiVLieAodPyeMrZEmkAq7L5H+Wyd8yuHh3+QRQSwMEFAAAAAgAoQsfXY7CBknPAAAAcgEAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0MS54bWx1kNFOwzAMRX8lyjtzVyGEUJoJGPwA8AFRa9aIxqkc0+3zccdUbdL2ltzk5OTabQ5pMBNyiZkau15V1iC1uYu0a+zX5/vdo914t8/8U3pEMXqdSmN7kfEJoLQ9plBWeUTSk+/MKYhueQdlZAzdEUoD1FX1AClEst4ds22Q4B3nvWHVatrOi+e1NdLYSEMk/BDWPBbvxG9xDCwJSRyIdzCn0J6ol1vU20H/VfASAZUu5nox1zfeeB3yb3dN+g/MhSZ/r/0qB9O5Ac56wjJA/wdQSwMEFAAAAAgAoQsfXS7IbMDJAAAAfgEAABgAAAB4bC93b3Jrc2hlZXRzL3NoZWV0Mi54bWx1kN1uwjAMhV8lyv1w6cU0TWnQponLTdrGA0TB0IjGqRyL8viEH1WA6J197HM+2WZxiJ3aI+eQqNHzWaUVkk/rQNtGr/6XL296Yc2QeJdbRFFlnXKjW5H+HSD7FqPLs9QjlckmcXRSWt5C7hnd+myKHdRV9QrRBdLWnLUvJ84aToPigi2qPxUfc62k0YG6QPgnXPSQrRH7MxCyAbEGTgL4q+FzyvCdBO/3ocBGYj0S64mAZSBH/iHjwpyy/OI+4PCMCjc3w/hMewRQSwECFAAUAAAACAChCx9d8amwPvoAAACkAgAAEwAAAAAAAAAAAAAAAAAAAAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIAKELH10cSfe+pAAAABYBAAALAAAAAAAAAAAAAAAAACsBAABfcmVscy8ucmVsc1BLAQIUABQAAAAIAKELH13SKAN8vAAAADkBAAAPAAAAAAAAAAAAAAAAAPgBAAB4bC93b3JrYm9vay54bWxQSwECFAAUAAAACAChCx9dims7Gq8AAACkAQAAGgAAAAAAAAAAAAAAAADhAgAAeGwvX3JlbHMvd29ya2Jvb2sueG1sLnJlbHNQSwECFAAUAAAACAChCx9djsIGSc8AAAByAQAAGAAAAAAAAAAAAAAAAADIAwAAeGwvd29ya3NoZWV0cy9zaGVldDEueG1sUEsBAhQAFAAAAAgAoQsfXS7IbMDJAAAAfgEAABgAAAAAAAAAAAAAAAAAzQQAAHhsL3dvcmtzaGVldHMvc2hlZXQyLnhtbFBLBQYAAAAABgAGAIsBAADMBQAAAAA=",
  "base64"
);

const input = {
  bytes: fixture,
  filename: "quarterly-expenses.xlsx",
  mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

assert.equal(xlsxProcessor.canProcess(input), true);
assert.equal(xlsxProcessor.canProcess({ ...input, filename: "legacy.xls" }), false);
assert.equal(xlsxProcessor.canProcess({ ...input, mimeType: "application/pdf" }), false);
assert.throws(
  () => xlsxProcessor.validate({ ...input, filename: "legacy.xls" }),
  /Only \.xlsx spreadsheet files are supported/
);
assert.throws(
  () => xlsxProcessor.validate({ ...input, bytes: Buffer.from("not-a-workbook") }),
  /valid XLSX package/
);

const extracted = await xlsxProcessor.extract(input);
assert.equal(extracted.kind, "xlsx");
assert.equal(extracted.units.length, 2);
assert.equal(extracted.units[0].sheetName, "Expenses");
assert.equal(extracted.units[1].sheetName, "Notes");
assert.equal(extracted.plainText.includes("Department=Cloud"), true);
assert.equal(extracted.plainText.includes("Owner=Finance"), true);
assert.equal(extracted.units[0].locationLabel, "Sheet: Expenses · Rows 2–2");

console.log("XLSX ingestion regression tests passed.");
