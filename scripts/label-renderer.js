export class LabelRenderer {
  static templateSize = { w: 28, h: 40 };

  constructor({ parseData }) {
    this.parseData = parseData;
  }

  getSheetSize() {
    const preset = document.getElementById('sheetPreset').value;
    if (preset === 'custom') {
      return {
        w: parseFloat(document.getElementById('sheetW').value) || 210,
        h: parseFloat(document.getElementById('sheetH').value) || 297
      };
    }
    const [w, h] = preset.split('x').map(Number);
    return { w, h };
  }

  computeGrid(labelW, labelH, marginH, marginV, sheet) {
    const usableW = Math.max(sheet.w - marginH * 2, labelW);
    const usableH = Math.max(sheet.h - marginV * 2, labelH);
    const cols = Math.max(1, Math.floor(usableW / labelW));
    const rows = Math.max(1, Math.floor(usableH / labelH));
    return { cols, rows, perPage: cols * rows };
  }

  buildLabelNode(item) {
    const wrap = document.createElement('div');
    wrap.className = 'label template-label';

    wrap.innerHTML = `
      <img class="label-template-image" src="assets/Template.svg" alt="Modelo da etiqueta">
      <div class="qr-wrap"></div>
      <div class="num-short">${item.short}</div>
      <div class="num-long">${item.long}</div>`;

    if (item.qrImage) {
      const qrImage = document.createElement('img');
      qrImage.src = item.qrImage;
      qrImage.alt = 'QR Code original do PDF';
      wrap.querySelector('.qr-wrap').appendChild(qrImage);
    }
    return wrap;
  }

  buildCutGuide(marginH, marginV, gap, labelW, labelH, cols, rows) {
    const overlay = document.createElement('div');
    overlay.className = 'cut-guide-overlay';

    const gridWidth = cols * labelW + Math.max(cols - 1, 0) * gap;
    const gridHeight = rows * labelH + Math.max(rows - 1, 0) * gap;

    const xPositions = [];
    for (let c = 0; c < cols; c++) {
      xPositions.push(marginH + c * (labelW + gap));
    }
    xPositions.push(marginH + gridWidth);

    const yPositions = [];
    for (let r = 0; r < rows; r++) {
      yPositions.push(marginV + r * (labelH + gap));
    }
    yPositions.push(marginV + gridHeight);

    xPositions.forEach(x => {
      const line = document.createElement('div');
      line.className = 'cut-line cut-line-vertical';
      line.style.left = `${x}mm`;
      line.style.top = `${marginV}mm`;
      line.style.height = `${gridHeight}mm`;
      overlay.appendChild(line);
    });

    yPositions.forEach(y => {
      const line = document.createElement('div');
      line.className = 'cut-line cut-line-horizontal';
      line.style.top = `${y}mm`;
      line.style.left = `${marginH}mm`;
      line.style.width = `${gridWidth}mm`;
      overlay.appendChild(line);
    });

    return overlay;
  }

  render() {
    const errorBox = document.getElementById('errorBox');
    errorBox.style.display = 'none';
    errorBox.textContent = '';
    const { items, errors } = this.parseData(document.getElementById('dataInput').value);
    document.getElementById('itemCount').textContent = `${items.length} etiqueta(s)`;
    if (errors.length) {
      errorBox.style.display = 'block';
      errorBox.textContent = errors.join(' | ');
    }

    const { w: labelW, h: labelH } = LabelRenderer.templateSize;
    const marginH = parseFloat(document.getElementById('pageMarginH').value) || 25;
    const marginV = parseFloat(document.getElementById('pageMarginV').value) || 35;
    const sheet = this.getSheetSize();
    const { cols, rows, perPage } = this.computeGrid(labelW, labelH, marginH, marginV, sheet);
    document.getElementById('gridInfo').textContent = `${cols} colunas x ${rows} linhas = ${perPage} etiquetas por folha (${sheet.w}x${sheet.h}mm)`;

    const pages = document.getElementById('pages');
    pages.innerHTML = '';
    if (!items.length) {
      document.getElementById('pageCountLabel').textContent = '0 folha(s)';
      return;
    }
    const totalPages = Math.ceil(items.length / perPage);
    document.getElementById('pageCountLabel').textContent = `${totalPages} folha(s) (${sheet.w}x${sheet.h}mm)`;
    const pagesFragment = document.createDocumentFragment();
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const page = document.createElement('div');
      page.className = 'page';
      page.style.width = `${sheet.w}mm`;
      page.style.height = `${sheet.h}mm`;
      page.style.marginBottom = '24px';
      const grid = document.createElement('div');
      grid.className = 'grid';
      grid.style.left = `${marginH}mm`;
      grid.style.top = `${marginV}mm`;
      grid.style.width = `${cols * labelW}mm`;
      grid.style.height = `${rows * labelH}mm`;
      const cells = items.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
      cells.forEach((item, index) => {
        const label = this.buildLabelNode(item);
        const col = index % cols;
        const row = Math.floor(index / cols);
        label.style.position = 'absolute';
        label.style.width = `${labelW - 2 * 2.75}mm`;
        label.style.height = `${labelH - 2 * 2.75}mm`;
        label.style.left = `${2.75 + col * labelW}mm`;
        label.style.top = `${2.75 + row * labelH}mm`;
        label.style.boxSizing = 'border-box';
        grid.appendChild(label);
      });
      page.appendChild(grid);
      page.appendChild(this.buildCutGuide(marginH, marginV, 0, labelW, labelH, cols, rows));
      pagesFragment.appendChild(page);
    }
    pages.appendChild(pagesFragment);
  }

  applyPrintPageSize() {
    const sheet = this.getSheetSize();
    let style = document.getElementById('dynamicPageSize');
    if (!style) {
      style = document.createElement('style');
      style.id = 'dynamicPageSize';
      document.head.appendChild(style);
    }
    style.textContent = `@media print { @page { size: ${sheet.w}mm ${sheet.h}mm; margin: 0; } }`;
  }
}
