import { LabelDataParser } from './data-parser.js?v=pdf-grid-fix-1';
import { LabelRenderer } from './label-renderer.js';
import { PdfImporter } from './pdf-importer.js?v=pdf-grid-fix-1';

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

  setProcessing(isProcessing, message = 'Aguarde...') {
    const overlay = document.getElementById('processingOverlay');
    overlay.classList.toggle('is-visible', isProcessing);
    overlay.setAttribute('aria-busy', String(isProcessing));
    document.getElementById('processingMessage').textContent = message;
  }

  bindControls() {
    const easterEggTrigger = document.getElementById('easterEggTrigger');
    const easterEggModal = document.getElementById('easterEggModal');
    const easterEggVideo = document.getElementById('easterEggVideo');
    const closeEasterEgg = () => {
      easterEggModal.hidden = true;
      easterEggVideo.src = '';
      easterEggTrigger.focus();
    };

    easterEggTrigger.addEventListener('click', () => {
      easterEggModal.hidden = false;
      const origin = window.location.origin === 'null' ? '' : `&origin=${encodeURIComponent(window.location.origin)}`;
      easterEggVideo.src = `https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1${origin}`;
      easterEggModal.querySelector('.easter-egg-close').focus();
    });
    easterEggModal.querySelectorAll('[data-easter-close]').forEach(element => {
      element.addEventListener('click', closeEasterEgg);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !easterEggModal.hidden) closeEasterEgg();
    });

    document.getElementById('sheetPreset').addEventListener('change', event => {
      document.getElementById('customSheetWrap').style.display = event.target.value === 'custom' ? 'flex' : 'none';
      if (event.target.value === 'grafica') {
        document.getElementById('pageMarginH').value = 22;
        document.getElementById('pageMarginV').value = 37;
      }
      this.renderer.render();
    });
    ['sheetW', 'sheetH', 'pageMarginH', 'pageMarginV', 'gap'].forEach(id => {
      document.getElementById(id).addEventListener('input', () => this.renderer.render());
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
    this.setProcessing(true, 'Lendo texto e preparando as páginas...');
    try {
      status.textContent = 'Lendo o texto do PDF...';
      const lines = await this.pdfImporter.extractLines(file);
      if (!lines.length) {
        status.textContent = 'Não encontrei texto legível no documento PDF. Verifique se o arquivo é texto e não uma imagem digitalizada ou uma página protegida.';
        return;
      }

      const shortLabel = 'Nome do equipamento';
      const longLabel = 'Identificador';
      const qrLabel = '';

      let result = await this.pdfImporter.extractRowsByTextRuns(file, shortLabel, longLabel);
      if (!result.rows.length) {
        result = await this.pdfImporter.extractRowsByLabels(file, shortLabel, longLabel, qrLabel);
        if (!result.rows.length) {
          const preview = lines.slice(0, 12).map(line => line.trim()).filter(Boolean).join(' | ');
          status.textContent = `Não encontrei pares completos com esses rótulos. Procurei “${shortLabel}” e “${longLabel}” no PDF, mas o texto não apareceu com a ordem esperada. O PDF pode estar em layout diferente, com colunas ou com imagem digitalizada. Texto lido: ${preview || 'nenhum trecho visível'}`;
          return;
        }
      }

      status.textContent = `${result.rows.length} etiqueta(s) extraída(s) pelos rótulos. ${result.ignored} linha(s) ignorada(s).`;
      const rows = result.rows;
      const qrCodes = await this.pdfImporter.decodeQrCodes(file, (page, total) => {
        const message = `Decodificando QR Code — página ${page} de ${total}...`;
        status.textContent = message;
        this.setProcessing(true, message);
      }, rows);

      const qrByPage = qrCodes.reduce((map, qr) => {
        map[qr.page] ??= [];
        map[qr.page].push(qr);
        return map;
      }, {});

      const rowsByPage = rows.reduce((map, row) => {
        const page = row.page ?? 1;
        map[page] ??= [];
        map[page].push(row);
        return map;
      }, {});

      Object.entries(qrByPage).forEach(([page, codes]) => {
        codes.sort((a, b) => a.y - b.y || a.x - b.x);
      });

      const pageNumbers = Object.keys(rowsByPage).map(Number).sort((a, b) => a - b);
      pageNumbers.forEach(page => {
        const pageRows = rowsByPage[page] || [];
        const pageQrs = (qrByPage[page] || []).sort((a, b) => a.y - b.y || a.x - b.x);
        const hasMappedQrs = pageQrs.some(candidate => Number.isInteger(candidate.rowIndex));
        pageRows.forEach((row, index) => {
          const rowIndex = rows.indexOf(row);
          const qr = hasMappedQrs
            ? pageQrs.find(candidate => candidate.rowIndex === rowIndex)
            : pageQrs[index];
          if (!qr) return;
          row.qr = qr.data;
          row.qrImage = qr.image;
        });
      });

      status.textContent += qrCodes.length ? ` ${Math.min(rows.length, qrCodes.length)} QR Code(s) mantido(s) do PDF.` : ' Nenhum QR Code foi encontrado na imagem do PDF.';
      this.importedQrImages = rows.map(row => row.qrImage || '');
      // O conteúdo do QR pode ter quebras de linha ou separadores. Como a imagem
      // original já é mantida em importedQrImages, ele não deve entrar no textarea.
      document.getElementById('dataInput').value = LabelDataParser.rowsToTextareaValue(
        rows.map(({ curto, longo }) => ({ curto, longo, qr: '' }))
      );
      this.renderer.render();
    } catch (error) {
      const detail = error && error.message ? error.message : String(error);
      status.textContent = `Não consegui ler esse PDF. Etapa: texto do PDF -> rótulos -> QR. Motivo técnico: ${detail}. Se a etapa foi texto do PDF, confirme que o arquivo não é uma imagem digitalizada; se foi rótulos, revise o layout do rótulo; se foi QR, confirme que o código realmente fica visível nos quadrados do PDF.`;
    } finally {
      this.setProcessing(false);
    }
  }
}
