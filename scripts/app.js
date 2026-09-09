import { LabelDataParser } from './data-parser.js';
import { LabelRenderer } from './label-renderer.js';
import { PdfImporter } from './pdf-importer.js';

export class LabelGeneratorApp {
  constructor() {
    this.importedQrImages = [];
    this.parser = new LabelDataParser(() => this.importedQrImages);
    this.renderer = new LabelRenderer({
      parseData: raw => this.parser.parse(raw)
    });
    this.pdfImporter = new PdfImporter();
  }

  init() {
    this.bindControls();
    this.renderer.render();
  }

  bindControls() {
    document.getElementById('sheetPreset').addEventListener('change', event => {
      document.getElementById('customSheetWrap').style.display = event.target.value === 'custom' ? 'flex' : 'none';
    });
    document.getElementById('importMode').addEventListener('change', event => {
      const labelsMode = event.target.value === 'labels';
      document.getElementById('labelModeWrap').style.display = labelsMode ? 'block' : 'none';
      document.getElementById('sequentialModeWrap').style.display = labelsMode ? 'none' : 'block';
    });
    document.getElementById('extractPdfBtn').addEventListener('click', () => this.importPdf());
    document.getElementById('generateBtn').addEventListener('click', () => this.renderer.render());
    document.getElementById('printBtn').addEventListener('click', () => {
      this.renderer.render();
      this.renderer.applyPrintPageSize();
      setTimeout(() => window.print(), 150);
    });
  }

  async importPdf() {
    const status = document.getElementById('pdfStatus');
    const file = document.getElementById('pdfInput').files[0];
    if (!file) { status.textContent = 'Selecione um arquivo PDF primeiro.'; return; }
    try {
      status.textContent = 'Lendo o texto do PDF...';
      const lines = await this.pdfImporter.extractLines(file);
      if (!lines.length) { status.textContent = 'Não encontrei texto neste PDF.'; return; }
      const mode = document.getElementById('importMode').value;
      let result;
      if (mode === 'labels') {
        const shortLabel = document.getElementById('labelCurto').value.trim();
        const longLabel = document.getElementById('labelLongo').value.trim();
        if (!shortLabel || !longLabel) { status.textContent = 'Informe os dois rótulos.'; return; }
        result = PdfImporter.rowsFromLabels(lines, shortLabel, longLabel, document.getElementById('labelQr').value.trim());
        if (!result.rows.length) { status.textContent = 'Não encontrei pares completos com esses rótulos.'; return; }
        status.textContent = `${result.rows.length} etiqueta(s) extraída(s) pelos rótulos. ${result.ignored} linha(s) ignorada(s).`;
      } else {
        result = PdfImporter.rowsFromSequence(lines, ['order1', 'order2', 'order3'].map(id => document.getElementById(id).value));
        if (!result.rows.length) { status.textContent = 'Não consegui formar grupos de 3 linhas neste PDF.'; return; }
        status.textContent = `${result.rows.length} etiqueta(s) extraída(s).${result.leftover ? ` ${result.leftover} linha(s) final(is) ignorada(s).` : ''}`;
      }
      const rows = result.rows;
      if (document.getElementById('detectQrImages').checked) {
        const qrCodes = await this.pdfImporter.decodeQrCodes(file, (page, total) => { status.textContent = `Decodificando QR Code — página ${page} de ${total}...`; });
        rows.forEach((row, index) => {
          if (qrCodes[index]) { row.qr = qrCodes[index].data; row.qrImage = qrCodes[index].image; }
        });
        status.textContent += qrCodes.length ? ` ${Math.min(rows.length, qrCodes.length)} QR Code(s) mantido(s) do PDF.` : ' Nenhum QR Code foi encontrado.';
      }
      this.importedQrImages = rows.map(row => row.qrImage || '');
      document.getElementById('dataInput').value = LabelDataParser.rowsToTextareaValue(rows);
      this.renderer.render();
    } catch (error) {
      status.textContent = `Não consegui ler esse PDF: ${error.message}`;
    }
  }
}
