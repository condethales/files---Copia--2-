export class LabelRenderer {
  constructor({ parseData, getQrImages, getCustomLayout }) {
    this.parseData = parseData;
    this.getQrImages = getQrImages;
    this.getCustomLayout = getCustomLayout;
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

  computeGrid(labelW, labelH, margin, gap, sheet) {
    const usableW = sheet.w - margin * 2;
    const usableH = sheet.h - margin * 2;
    const cols = Math.max(1, Math.floor((usableW + gap) / (labelW + gap)));
    const rows = Math.max(1, Math.floor((usableH + gap) / (labelH + gap)));
    return { cols, rows, perPage: cols * rows };
  }

  buildLabelNode(item) {
    const wrap = document.createElement('div');
    const customLayout = this.getCustomLayout();
    wrap.className = `label style-${document.getElementById('labelStyle').value}`;
    wrap.style.setProperty('--label-accent', document.getElementById('accentColor').value);
    if (customLayout) {
      wrap.classList.add('has-custom-layout');
      wrap.style.backgroundImage = `url("${customLayout}")`;
    }

    const companyName = document.getElementById('companyName').value;
    const companyPhone = document.getElementById('companyPhone').value;
    const companyEmail = document.getElementById('companyEmail').value;
    wrap.innerHTML = `
      <div class="head">
        <img class="logo" src="assets/logo.svg" alt="Logo WH">
        <div class="company">
          <div class="name">${companyName}</div>
          <div class="phone">${companyPhone}</div>
          <div class="email">${companyEmail}</div>
        </div>
      </div>
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

    const labelW = parseFloat(document.getElementById('labelW').value) || 40;
    const labelH = parseFloat(document.getElementById('labelH').value) || 60;
    const margin = parseFloat(document.getElementById('pageMargin').value) || 8;
    const gap = parseFloat(document.getElementById('gap').value) || 3;
    const sheet = this.getSheetSize();
    const { cols, rows, perPage } = this.computeGrid(labelW, labelH, margin, gap, sheet);
    document.getElementById('gridInfo').textContent = `${cols} colunas x ${rows} linhas = ${perPage} etiquetas por folha (${sheet.w}x${sheet.h}mm)`;

    const pages = document.getElementById('pages');
    pages.innerHTML = '';
    if (!items.length) {
      document.getElementById('pageCountLabel').textContent = '0 folha(s)';
      return;
    }
    const totalPages = Math.ceil(items.length / perPage);
    document.getElementById('pageCountLabel').textContent = `${totalPages} folha(s) (${sheet.w}x${sheet.h}mm)`;
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
      const page = document.createElement('div');
      page.className = 'page';
      page.style.width = `${sheet.w}mm`;
      page.style.height = `${sheet.h}mm`;
      page.style.marginBottom = '24px';
      const grid = document.createElement('div');
      grid.className = 'grid';
      grid.style.left = `${margin}mm`;
      grid.style.top = `${margin}mm`;
      grid.style.gridTemplateColumns = `repeat(${cols}, ${labelW}mm)`;
      grid.style.gridTemplateRows = `repeat(${rows}, ${labelH}mm)`;
      grid.style.gap = `${gap}mm`;
      items.slice(pageIndex * perPage, (pageIndex + 1) * perPage).forEach(item => grid.appendChild(this.buildLabelNode(item)));
      page.appendChild(grid);
      pages.appendChild(page);
    }
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
