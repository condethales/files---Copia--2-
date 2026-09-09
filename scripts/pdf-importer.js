export class PdfImporter {
  static workerSource = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  initWorker() {
    if (pdfjsLib.GlobalWorkerOptions.workerSrc !== PdfImporter.workerSource) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = PdfImporter.workerSource;
    }
  }

  async extractLines(file) {
    this.initWorker();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const lines = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let currentLine = '';
      content.items.forEach(item => {
        currentLine += item.str;
        if (item.hasEOL) {
          if (currentLine.trim()) lines.push(currentLine.trim());
          currentLine = '';
        }
      });
      if (currentLine.trim()) lines.push(currentLine.trim());
    }
    return lines;
  }

  async extractRowsByLabels(file, shortLabel, longLabel) {
    this.initWorker();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const rows = [];
    let ignored = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const result = PdfImporter.rowsFromTextRuns(PdfImporter.textRuns(content.items), shortLabel, longLabel);
      rows.push(...result.rows.map(row => ({ ...row, page: pageNumber })));
      ignored += result.ignored;
    }
    return { rows, ignored };
  }

  async decodeQrCodes(file, onProgress) {
    this.initWorker();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const found = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.(pageNumber, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      await page.render({ canvasContext: context, viewport }).promise;

      for (let attempts = 0; attempts < 60; attempts++) {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, imageData.width, imageData.height);
        if (!result) break;
        const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = result.location;
        const xs = [topLeftCorner.x, topRightCorner.x, bottomLeftCorner.x, bottomRightCorner.x];
        const ys = [topLeftCorner.y, topRightCorner.y, bottomLeftCorner.y, bottomRightCorner.y];
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const padding = 8;
        const x = Math.max(0, Math.floor(minX - padding));
        const y = Math.max(0, Math.floor(minY - padding));
        const right = Math.min(canvas.width, Math.ceil(maxX + padding));
        const bottom = Math.min(canvas.height, Math.ceil(maxY + padding));
        const crop = document.createElement('canvas');
        crop.width = right - x;
        crop.height = bottom - y;
        crop.getContext('2d').drawImage(canvas, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);
        found.push({ page: pageNumber, x: minX, y: minY, data: result.data, image: crop.toDataURL('image/png') });
        context.fillStyle = '#fff';
        context.fillRect(minX - 3, minY - 3, maxX - minX + 6, maxY - minY + 6);
      }
    }
    return found.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  }

  static normalize(text) {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  static textRuns(items) {
    const entries = items.filter(item => item.str?.trim()).map(item => ({
      text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width || 0
    }));
    const lines = [];
    entries.forEach(entry => {
      const line = lines.find(candidate => Math.abs(candidate.y - entry.y) < 2);
      if (line) line.entries.push(entry);
      else lines.push({ y: entry.y, entries: [entry] });
    });
    return lines.flatMap(line => {
      const runs = [];
      line.entries.sort((a, b) => a.x - b.x).forEach(entry => {
        const previous = runs.at(-1);
        const previousRight = previous ? previous.x + previous.width : 0;
        if (!previous || entry.x - previousRight > 18) {
          runs.push({ text: entry.text, x: entry.x, y: line.y, width: entry.width });
        } else {
          previous.text += ` ${entry.text}`;
          previous.width = Math.max(previousRight, entry.x + entry.width) - previous.x;
        }
      });
      return runs;
    });
  }

  static rowsFromTextRuns(runs, shortLabel, longLabel) {
    const normalizedShort = PdfImporter.normalize(shortLabel);
    const normalizedLong = PdfImporter.normalize(longLabel);
    const isLabel = (run, label) => PdfImporter.normalize(run.text) === label;
    const isKnownLabel = run => isLabel(run, normalizedShort) || isLabel(run, normalizedLong);
    const center = run => run.x + run.width / 2;
    const below = (reference, candidates) => candidates
      .filter(candidate => reference.y > candidate.y && Math.abs(center(reference) - center(candidate)) < 45)
      .sort((a, b) => b.y - a.y);
    const rows = [];
    runs.filter(run => isLabel(run, normalizedShort)).forEach(shortHeading => {
      const longHeading = below(shortHeading, runs).find(run => isLabel(run, normalizedLong));
      if (!longHeading) return;
      const shortValue = below(shortHeading, runs).find(run => run.y > longHeading.y && !isKnownLabel(run));
      const longValue = below(longHeading, runs).find(run => !isKnownLabel(run));
      if (shortValue && longValue) rows.push({ curto: shortValue.text, longo: longValue.text, qr: '', x: shortHeading.x, y: shortHeading.y });
    });
    rows.sort((a, b) => b.y - a.y || a.x - b.x);
    return { rows, ignored: Math.max(0, runs.length - rows.length * 4) };
  }

  static matchLabel(lines, index, label) {
    if (!label) return null;
    const line = lines[index];
    const normalizedLabel = PdfImporter.normalize(label);
    if (!normalizedLabel) return null;
    if (PdfImporter.normalize(line) === normalizedLabel) return { value: lines[index + 1] || '', consumed: 2 };
    if (PdfImporter.normalize(line).startsWith(normalizedLabel)) {
      const rest = line.slice(label.length).trim().replace(/^[:\-]+/, '').trim();
      return rest ? { value: rest, consumed: 1 } : { value: lines[index + 1] || '', consumed: 2 };
    }
    return null;
  }

  static rowsFromLabels(lines, shortLabel, longLabel, qrLabel) {
    const rows = [];
    let current = {};
    let ignored = 0;
    for (let index = 0; index < lines.length;) {
      let match = PdfImporter.matchLabel(lines, index, shortLabel);
      if (match) { current.curto = match.value; index += match.consumed; }
      else if ((match = PdfImporter.matchLabel(lines, index, longLabel))) { current.longo = match.value; index += match.consumed; }
      else if (qrLabel && (match = PdfImporter.matchLabel(lines, index, qrLabel))) { current.qr = match.value; index += match.consumed; }
      else { index++; ignored++; }
      if (current.curto !== undefined && current.longo !== undefined) {
        rows.push({ curto: current.curto, longo: current.longo, qr: current.qr || '' });
        current = {};
      }
    }
    return { rows, ignored };
  }

  static rowsFromSequence(lines, order) {
    const leftover = lines.length % 3;
    const usableLines = leftover ? lines.slice(0, -leftover) : lines;
    const rows = [];
    for (let index = 0; index < usableLines.length; index += 3) {
      const group = { [order[0]]: usableLines[index], [order[1]]: usableLines[index + 1], [order[2]]: usableLines[index + 2] };
      rows.push({ curto: group.curto || '', longo: group.longo || '', qr: group.qr || '' });
    }
    return { rows, leftover };
  }
}
