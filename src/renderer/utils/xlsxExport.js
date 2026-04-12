const textEncoder = new TextEncoder();

function crc32(bytes) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ -1) >>> 0;
}

function dosDateTime() {
  const now = new Date();
  const year = Math.max(1980, now.getFullYear());
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = Math.floor(now.getSeconds() / 2);
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosDate, dosTime };
}

function concatUint8(arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  arrays.forEach((arr) => {
    out.set(arr, offset);
    offset += arr.length;
  });
  return out;
}

function u16(value) {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value, true);
  return out;
}

function u32(value) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value >>> 0, true);
  return out;
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function buildSheetXml(rows) {
  const rowXml = rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, colIndex) => {
          const ref = `${colName(colIndex)}${rowIndex + 1}`;
          const numeric = typeof value === 'number' && Number.isFinite(value);
          if (numeric) {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
        })
        .join('');
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowXml}</sheetData>
</worksheet>`;
}

function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  const { dosDate, dosTime } = dosDateTime();
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = textEncoder.encode(file.name);
    const dataBytes = textEncoder.encode(file.content);
    const crc = crc32(dataBytes);

    const localHeader = concatUint8([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes
    ]);
    const localFile = concatUint8([localHeader, dataBytes]);
    localParts.push(localFile);

    const centralHeader = concatUint8([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(dosTime),
      u16(dosDate),
      u32(crc),
      u32(dataBytes.length),
      u32(dataBytes.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes
    ]);
    centralParts.push(centralHeader);
    offset += localFile.length;
  });

  const centralDirectory = concatUint8(centralParts);
  const end = concatUint8([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0)
  ]);

  return concatUint8([...localParts, centralDirectory, end]);
}

/**
 * Build a multi-sheet XLSX workbook blob from an array of { name, rows } objects.
 * @param {Array<{name: string, rows: Array<Array<any>>}>} sheets
 * @returns {Blob}
 */
export function buildMultiSheetWorkbookBlob(sheets) {
  const sheetFiles = sheets.map((sheet, i) => ({
    name: `xl/worksheets/sheet${i + 1}.xml`,
    content: buildSheetXml(sheet.rows)
  }));

  const overrides = sheets
    .map(
      (_, i) =>
        `  <Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('\n');

  const sheetEntries = sheets
    .map((s, i) => `    <sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('\n');

  const rels = sheets
    .map(
      (_, i) =>
        `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('\n');

  const files = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${overrides}
</Types>`
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${sheetEntries}
  </sheets>
</workbook>`
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
</Relationships>`
    },
    ...sheetFiles
  ];

  const zipBytes = zipStore(files);
  return new Blob([zipBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}

/** Backward-compatible single-sheet wrapper */
export function buildGstr1WorkbookBlob(rows) {
  return buildMultiSheetWorkbookBlob([{ name: 'GSTR1', rows }]);
}
