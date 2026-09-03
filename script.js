function getSheetSize(){
  const preset = document.getElementById('sheetPreset').value;
  if(preset === 'custom'){
    const w = parseFloat(document.getElementById('sheetW').value) || 210;
    const h = parseFloat(document.getElementById('sheetH').value) || 297;
    return { w, h };
  }
  const [w, h] = preset.split('x').map(Number);
  return { w, h };
}

document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    const selected = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(item=>item.classList.toggle('is-active', item === tab));
    document.querySelectorAll('[data-tab-content]').forEach(panel=>{
      panel.classList.toggle('is-active', panel.dataset.tabContent === selected);
    });
  });
});

function getLabelStyle(){
  return document.getElementById('labelStyle').value;
}

document.getElementById('sheetPreset').addEventListener('change', (e)=>{
  document.getElementById('customSheetWrap').style.display = e.target.value === 'custom' ? 'flex' : 'none';
});

function parseData(raw){
  const lines = raw.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
  const items = [];
  const errors = [];
  lines.forEach((line, idx)=>{
    const parts = line.split(/[;,\t]/).map(p=>p.trim()).filter(p=>p.length>0);
    if(parts.length < 2){
      errors.push(`Linha ${idx+1}: "${line}" — faltou o separador (use ; entre os dois números)`);
      return;
    }
    items.push({ short: parts[0], long: parts[1], qr: parts[2] || '', qrImage: importedQrImages[idx] || '' });
  });
  return { items, errors };
}

let importedQrImages = [];
let customLayoutImage = '';

function setupCustomLayout(){
  const fileInput = document.getElementById('layoutFile');
  const preview = document.getElementById('layoutPreview');
  const previewImage = document.getElementById('layoutPreviewImage');

  fileInput.addEventListener('change', ()=>{
    const file = fileInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{
      customLayoutImage = reader.result;
      previewImage.src = customLayoutImage;
      preview.hidden = false;
      render();
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('clearLayoutBtn').addEventListener('click', ()=>{
    customLayoutImage = '';
    fileInput.value = '';
    previewImage.removeAttribute('src');
    preview.hidden = true;
    render();
  });
}

function buildLabelNode(item){
  const wrap = document.createElement('div');
  wrap.className = `label style-${getLabelStyle()}`;
  wrap.style.setProperty('--label-accent', document.getElementById('accentColor').value);
  if(customLayoutImage){
    wrap.classList.add('has-custom-layout');
    wrap.style.backgroundImage = `url("${customLayoutImage}")`;
  }

  const companyName = document.getElementById('companyName').value;
  const companyPhone = document.getElementById('companyPhone').value;
  const companyEmail = document.getElementById('companyEmail').value;

  wrap.innerHTML = `
    <div class="head">
      <img class="logo" src="logo.svg" alt="Logo WH">
      <div class="company">
        <div class="name">${companyName}</div>
        <div class="phone">${companyPhone}</div>
        <div class="email">${companyEmail}</div>
      </div>
    </div>
    <div class="qr-wrap"></div>
    <div class="num-short">${item.short}</div>
    <div class="num-long">${item.long}</div>
  `;

  const qrHolder = wrap.querySelector('.qr-wrap');
  if(item.qrImage){
    const qrImage = document.createElement('img');
    qrImage.src = item.qrImage;
    qrImage.alt = 'QR Code original do PDF';
    qrHolder.appendChild(qrImage);
  }

  return wrap;
}

function computeGrid(labelW, labelH, margin, gap, sheet){
  const usableW = sheet.w - margin*2;
  const usableH = sheet.h - margin*2;
  const cols = Math.max(1, Math.floor((usableW + gap) / (labelW + gap)));
  const rows = Math.max(1, Math.floor((usableH + gap) / (labelH + gap)));
  return { cols, rows, perPage: cols*rows };
}

function render(){
  const errorBox = document.getElementById('errorBox');
  errorBox.style.display = 'none';
  errorBox.textContent = '';

  const { items, errors } = parseData(document.getElementById('dataInput').value);
  document.getElementById('itemCount').textContent = `${items.length} etiqueta(s)`;

  if(errors.length){
    errorBox.style.display = 'block';
    errorBox.textContent = errors.join(' | ');
  }

  const labelW = parseFloat(document.getElementById('labelW').value) || 40;
  const labelH = parseFloat(document.getElementById('labelH').value) || 60;
  const margin = parseFloat(document.getElementById('pageMargin').value) || 8;
  const gap = parseFloat(document.getElementById('gap').value) || 3;
  const sheet = getSheetSize();

  const { cols, rows, perPage } = computeGrid(labelW, labelH, margin, gap, sheet);
  document.getElementById('gridInfo').textContent = `${cols} colunas x ${rows} linhas = ${perPage} etiquetas por folha (${sheet.w}x${sheet.h}mm)`;

  const pagesContainer = document.getElementById('pages');
  pagesContainer.innerHTML = '';

  if(items.length === 0){
    document.getElementById('pageCountLabel').textContent = '0 folha(s)';
    return;
  }

  const totalPages = Math.ceil(items.length / perPage);
  document.getElementById('pageCountLabel').textContent = `${totalPages} folha(s) (${sheet.w}x${sheet.h}mm)`;

  for(let p=0; p<totalPages; p++){
    const page = document.createElement('div');
    page.className = 'page';
    page.style.width = sheet.w + 'mm';
    page.style.height = sheet.h + 'mm';
    page.style.marginBottom = '24px';

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.style.left = margin + 'mm';
    grid.style.top = margin + 'mm';
    grid.style.gridTemplateColumns = `repeat(${cols}, ${labelW}mm)`;
    grid.style.gridTemplateRows = `repeat(${rows}, ${labelH}mm)`;
    grid.style.gap = gap + 'mm';

    const pageItems = items.slice(p*perPage, (p+1)*perPage);
    pageItems.forEach(item=>{
      grid.appendChild(buildLabelNode(item));
    });

    page.appendChild(grid);
    pagesContainer.appendChild(page);
  }
}

function applyPrintPageSize(){
  const sheet = getSheetSize();
  let styleTag = document.getElementById('dynamicPageSize');
  if(!styleTag){
    styleTag = document.createElement('style');
    styleTag.id = 'dynamicPageSize';
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = `@media print { @page { size: ${sheet.w}mm ${sheet.h}mm; margin:0; } }`;
}

const PDF_WORKER_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function initPdfWorker(){
  if(pdfjsLib.GlobalWorkerOptions.workerSrc !== PDF_WORKER_SRC){
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  }
}

async function extractPdfLines(file){
  initPdfWorker();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for(let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    let current = '';
    content.items.forEach(item=>{
      current += item.str;
      if(item.hasEOL){
        const t = current.trim();
        if(t) lines.push(t);
        current = '';
      }
    });
    const t = current.trim();
    if(t) lines.push(t);
  }
  return lines;
}

// Renders every page of the PDF to a canvas and scans it for QR codes,
// decoding their real content (instead of generating a new one).
// Returns codes in reading order: page, then top-to-bottom, then left-to-right.
async function decodeAllQrInPdf(file, onProgress){
  initPdfWorker();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const found = [];

  for(let p = 1; p <= pdf.numPages; p++){
    if(onProgress) onProgress(p, pdf.numPages);
    const page = await pdf.getPage(p);
    const scale = 2.5; // higher resolution helps jsQR read small QR codes
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    await page.render({ canvasContext: ctx, viewport }).promise;

    // Repeatedly scan, masking each found QR before scanning again,
    // so pages with multiple QR codes are all detected.
    let guard = 0;
    while(guard < 60){
      guard++;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = jsQR(imageData.data, imageData.width, imageData.height);
      if(!result) break;

      const loc = result.location;
      const xs = [loc.topLeftCorner.x, loc.topRightCorner.x, loc.bottomLeftCorner.x, loc.bottomRightCorner.x];
      const ys = [loc.topLeftCorner.y, loc.topRightCorner.y, loc.bottomLeftCorner.y, loc.bottomRightCorner.y];
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);

      const cropPadding = 8;
      const cropX = Math.max(0, Math.floor(minX - cropPadding));
      const cropY = Math.max(0, Math.floor(minY - cropPadding));
      const cropRight = Math.min(canvas.width, Math.ceil(maxX + cropPadding));
      const cropBottom = Math.min(canvas.height, Math.ceil(maxY + cropPadding));
      const crop = document.createElement('canvas');
      crop.width = cropRight - cropX;
      crop.height = cropBottom - cropY;
      crop.getContext('2d').drawImage(
        canvas,
        cropX, cropY, crop.width, crop.height,
        0, 0, crop.width, crop.height
      );

      found.push({ page: p, x: minX, y: minY, data: result.data, image: crop.toDataURL('image/png') });

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(minX - 3, minY - 3, (maxX - minX) + 6, (maxY - minY) + 6);
    }
  }

  found.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  return found;
}

function normText(s){
  return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}

function matchLabelAt(lines, i, label){
  if(!label) return null;
  const line = lines[i];
  const nLine = normText(line);
  const nLabel = normText(label);
  if(!nLabel) return null;
  if(nLine === nLabel){
    if(i+1 < lines.length) return { value: lines[i+1], consumed: 2 };
    return { value: '', consumed: 1 };
  }
  if(nLine.startsWith(nLabel)){
    let rest = line.slice(label.length).trim().replace(/^[:\-–]+/, '').trim();
    if(rest) return { value: rest, consumed: 1 };
    if(i+1 < lines.length) return { value: lines[i+1], consumed: 2 };
    return { value: '', consumed: 1 };
  }
  return null;
}

function rowsFromLabels(lines, curtoLabel, longoLabel, qrLabel){
  const rows = [];
  let current = {};
  let i = 0;
  let ignored = 0;
  while(i < lines.length){
    let m = matchLabelAt(lines, i, curtoLabel);
    if(m){ current.curto = m.value; i += m.consumed; }
    else{
      m = matchLabelAt(lines, i, longoLabel);
      if(m){ current.longo = m.value; i += m.consumed; }
      else{
        m = qrLabel ? matchLabelAt(lines, i, qrLabel) : null;
        if(m){ current.qr = m.value; i += m.consumed; }
        else{ i += 1; ignored += 1; }
      }
    }
    if(current.curto !== undefined && current.longo !== undefined){
      rows.push({ curto: current.curto, longo: current.longo, qr: current.qr || '' });
      current = {};
    }
  }
  return { rows, ignored };
}

function linesToDataRows(lines, order){
  const rows = [];
  const leftover = lines.length % 3;
  const usable = leftover === 0 ? lines : lines.slice(0, lines.length - leftover);
  for(let i = 0; i < usable.length; i += 3){
    const group = {};
    group[order[0]] = usable[i];
    group[order[1]] = usable[i+1];
    group[order[2]] = usable[i+2];
    rows.push({ curto: group.curto || '', longo: group.longo || '', qr: group.qr || '' });
  }
  return { rows, leftover };
}

function rowsToTextareaValue(rows){
  return rows.map(r => `${r.curto};${r.longo};${r.qr || ''}`).join('\n');
}

document.getElementById('importMode').addEventListener('change', (e)=>{
  const isLabels = e.target.value === 'labels';
  document.getElementById('labelModeWrap').style.display = isLabels ? 'block' : 'none';
  document.getElementById('sequentialModeWrap').style.display = isLabels ? 'none' : 'block';
});

document.getElementById('extractPdfBtn').addEventListener('click', async ()=>{
  const status = document.getElementById('pdfStatus');
  const fileInput = document.getElementById('pdfInput');
  if(!fileInput.files || fileInput.files.length === 0){
    status.textContent = 'Selecione um arquivo PDF primeiro.';
    return;
  }
  const file = fileInput.files[0];
  status.textContent = 'Lendo o texto do PDF...';
  try{
    const lines = await extractPdfLines(file);
    if(lines.length === 0){
      status.textContent = 'Não encontrei texto neste PDF (pode ser um PDF escaneado/imagem).';
      return;
    }

    const mode = document.getElementById('importMode').value;
    let rows = [];
    let baseMsg = '';

    if(mode === 'labels'){
      const curtoLabel = document.getElementById('labelCurto').value.trim();
      const longoLabel = document.getElementById('labelLongo').value.trim();
      const qrLabel = document.getElementById('labelQr').value.trim();
      if(!curtoLabel || !longoLabel){
        status.textContent = 'Informe os dois rótulos (número menor e número maior).';
        return;
      }
      const result = rowsFromLabels(lines, curtoLabel, longoLabel, qrLabel);
      rows = result.rows;
      if(rows.length === 0){
        status.textContent = 'Não encontrei nenhum par completo com esses rótulos. Confira se os rótulos estão escritos como aparecem no PDF.';
        return;
      }
      baseMsg = `${rows.length} etiqueta(s) extraída(s) pelos rótulos. ${result.ignored} linha(s) irrelevante(s) ignorada(s).`;
    } else {
      const order = [
        document.getElementById('order1').value,
        document.getElementById('order2').value,
        document.getElementById('order3').value
      ];
      const result = linesToDataRows(lines, order);
      rows = result.rows;
      if(rows.length === 0){
        status.textContent = 'Não consegui formar nenhum grupo de 3 linhas neste PDF.';
        return;
      }
      baseMsg = result.leftover === 0
        ? `${rows.length} etiqueta(s) extraída(s).`
        : `${rows.length} etiqueta(s) extraída(s). ${result.leftover} linha(s) no final não formaram um grupo completo e foram ignoradas.`;
    }

    if(document.getElementById('detectQrImages').checked){
      status.textContent = baseMsg + ' Decodificando QR Code das imagens do PDF, isso pode levar alguns segundos...';
      const qrList = await decodeAllQrInPdf(file, (p, total)=>{
        status.textContent = `Decodificando QR Code — página ${p} de ${total}...`;
      });

      const rowsMissingQr = rows.length;
      let filled = 0;
      let qrCursor = 0;
      rows.forEach(r=>{
        if(qrCursor < qrList.length){
          r.qr = qrList[qrCursor].data;
          r.qrImage = qrList[qrCursor].image;
          qrCursor++;
          filled++;
        }
      });

      if(qrList.length === 0){
        baseMsg += ' Nenhum QR Code foi encontrado nas imagens do PDF.';
      } else if(qrList.length !== rowsMissingQr){
        baseMsg += ` Atenção: encontrei ${qrList.length} QR Code(s) na(s) imagem(ns), mas ${rowsMissingQr} etiqueta(s) precisavam de um — confira se a ordem bateu certo antes de imprimir.`;
      } else {
        baseMsg += ` ${filled} QR Code(s) foram lidos direto da imagem do PDF e usados como estão.`;
      }
    }

    importedQrImages = rows.map(row => row.qrImage || '');
    document.getElementById('dataInput').value = rowsToTextareaValue(rows);
    status.textContent = baseMsg;
    render();
  }catch(err){
    status.textContent = 'Não consegui ler esse PDF: ' + err.message;
  }
});

document.getElementById('generateBtn').addEventListener('click', render);
document.getElementById('labelStyle').addEventListener('change', render);
document.getElementById('accentColor').addEventListener('input', render);
document.getElementById('printBtn').addEventListener('click', ()=>{
  render();
  applyPrintPageSize();
  setTimeout(()=>window.print(), 150);
});

// initial render
setupCustomLayout();
render();
