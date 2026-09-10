import assert from 'node:assert/strict';
import { PdfImporter } from './scripts/pdf-importer.js';

const baseLines = [
  'Nome do equipamento',
  '1000',
  'Identificador',
  '1001'
];

const rows = PdfImporter.rowsFromLabels(baseLines, 'Nome do equipamento', 'Identificador');
assert.deepStrictEqual(rows.rows, [{ curto: '1000', longo: '1001', qr: '' }]);
assert.equal(rows.ignored, 0);

const complexLines = [
  'Nome do equipamento',
  '1000',
  'Identificador',
  '1001',
  'Qr Code',
  'abc123',
  'Nome do equipamento',
  '1002',
  'Identificador',
  '1003'
];

const multiRows = PdfImporter.rowsFromLabels(complexLines, 'Nome do equipamento', 'Identificador', 'Qr Code');
assert.deepStrictEqual(multiRows.rows, [
  { curto: '1000', longo: '1001', qr: 'abc123' },
  { curto: '1002', longo: '1003', qr: '' }
]);

const textContent = {
  items: [
    { str: 'Nome', transform: [1, 0, 0, 1, 0, 100], hasEOL: false },
    { str: 'do', transform: [1, 0, 0, 1, 50, 100], hasEOL: false },
    { str: 'equipamento', transform: [1, 0, 0, 1, 100, 100], hasEOL: true }
  ]
};
assert.deepStrictEqual(PdfImporter.linesFromTextContent(textContent), ['Nome do equipamento']);

const geometryRuns = PdfImporter.textRuns([
  { str: 'Nome do equipamento', transform: [1, 0, 0, 1, 0, 100], width: 50 },
  { str: '1000', transform: [1, 0, 0, 1, 0, 80], width: 30 },
  { str: 'Identificador', transform: [1, 0, 0, 1, 0, 60], width: 50 },
  { str: '5483787916545756', transform: [1, 0, 0, 1, 0, 40], width: 80 }
]);
assert.deepStrictEqual(PdfImporter.rowsFromTextRuns(geometryRuns, 'Nome do equipamento', 'Identificador').rows, [
  { curto: '1000', longo: '5483787916545756', qr: '', x: 0, y: 100 }
]);

console.log('test passed');
