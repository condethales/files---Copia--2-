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
      lines.push(...PdfImporter.linesFromTextContent(content));
    }

    return lines;
  }

  async extractRowsByLabels(file, shortLabel, longLabel, qrLabel) {
    this.initWorker();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const rows = [];
    let ignored = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const lines = PdfImporter.linesFromTextContent(content);

      const result = PdfImporter.rowsFromLabels(lines, shortLabel, longLabel, qrLabel);
      rows.push(...result.rows.map(row => ({ ...row, page: pageNumber })));
      ignored += result.ignored;
    }

    return { rows, ignored };
  }

  async extractRowsByTextRuns(file, shortLabel, longLabel) {
    this.initWorker();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const rows = [];
    let ignored = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const runs = PdfImporter.textRuns(content.items);
      const result = PdfImporter.rowsFromTextRuns(runs, shortLabel, longLabel);

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
        const qr = jsQR(imageData.data, imageData.width, imageData.height);
        if (!qr) break;

        const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = qr.location;
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

        found.push({
          page: pageNumber,
          x: minX,
          y: minY,
          data: qr.data,
          image: crop.toDataURL('image/png')
        });

        context.fillStyle = '#fff';
        context.fillRect(minX - 3, minY - 3, maxX - minX + 6, maxY - minY + 6);
      }
    }

    return found.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  }

  static linesFromTextContent(content) {
    const lines = [];
    const items = Array.isArray(content?.items) ? content.items : [];
    let currentLine = '';

    for (const item of items) {
      if (!item || !item.str || !item.str.trim()) continue;

      const piece = PdfImporter.normalizeFieldText(item.str);
      if (!piece) continue;

      if (!currentLine) {
        currentLine = piece;
      } else {
        currentLine += ' ' + piece;
      }

      if (item.hasEOL) {
        const cleaned = PdfImporter.normalizeFieldText(currentLine);
        if (cleaned) lines.push(cleaned);
        currentLine = '';
      }
    }

    const remaining = PdfImporter.normalizeFieldText(currentLine);
    if (remaining) lines.push(remaining);

    return lines;
  }

  static normalizeFieldText(text) {
    return (text || '').replace(/\r/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  static normalize(text) {
    return (text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  static escapeRegex(text) {
    return (text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  static textRuns(items) {
    const entries = items.filter(item => item.str?.trim()).map(item => ({
      text: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
      width: item.width || 0
    }));

    const lines = [];
    entries.forEach(entry => {
      const line = lines.find(candidate => Math.abs(candidate.y - entry.y) < 2);
      if (line) {
        line.entries.push(entry);
      } else {
        lines.push({ y: entry.y, entries: [entry] });
      }
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
      if (shortValue && longValue) {
        rows.push({ curto: shortValue.text, longo: longValue.text, qr: '', x: shortHeading.x, y: shortHeading.y });
      }
    });

    rows.sort((a, b) => b.y - a.y || a.x - b.x);
    return { rows, ignored: Math.max(0, runs.length - rows.length * 4) };
  }

  static cleanValue(raw) {
    return PdfImporter.normalizeFieldText(raw)
      .replace(/^[\s:;\-_,.\t]+/, '')
      .replace(/[\s:;\-_,.\t]+$/, '')
      .trim();
  }

  static matchLabel(lines, index, label) {
    if (!label) return null;

    const labelNorm = PdfImporter.normalize(label);
    if (!labelNorm) return null;

    const line = lines[index] || '';
    const lineNorm = PdfImporter.normalize(line);
    if (!lineNorm) return null;

    const sameLine = new RegExp(`^${PdfImporter.escapeRegex(labelNorm)}\\s*[:;\\-_,.\\t]*\\s*(.+)$`, 'i').exec(lineNorm);
    if (sameLine && PdfImporter.cleanValue(sameLine[1])) {
      return { value: PdfImporter.cleanValue(sameLine[1]), consumed: 1 };
    }

    if (lineNorm === labelNorm || lineNorm.startsWith(labelNorm)) {
      const rest = PdfImporter.cleanValue(line.slice(label.length));
      if (rest) {
        return { value: rest, consumed: 1 };
      }

      const nextValue = PdfImporter.cleanValue(lines[index + 1] || '');
      if (nextValue) {
        return { value: nextValue, consumed: 2 };
      }

      return { value: '', consumed: 2 };
    }

    return null;
  }

  static rowsFromLabels(lines, shortLabel, longLabel, qrLabel) {
    const rows = [];
    let ignored = 0;
    const seen = new Set();

    for (let index = 0; index < lines.length; index++) {
      const short = PdfImporter.matchLabel(lines, index, shortLabel);
      if (!short) continue;

      const curto = PdfImporter.cleanValue(short.value);
      if (!curto) {
        ignored++;
        continue;
      }

      const longStart = index + short.consumed;
      let long = null;
      let longIndex = -1;

      for (let j = longStart; j < lines.length; j++) {
        const candidate = PdfImporter.matchLabel(lines, j, longLabel);
        if (!candidate) continue;

        const longo = PdfImporter.cleanValue(candidate.value);
        if (!longo) continue;

        long = candidate;
        longIndex = j;
        break;
      }

      if (!long || longIndex < 0) {
        ignored++;
        continue;
      }

      const longo = PdfImporter.cleanValue(long.value);
      let qr = '';

      if (qrLabel) {
        const qrStart = longIndex + long.consumed;
        for (let k = qrStart; k < lines.length; k++) {
          const qrMatch = PdfImporter.matchLabel(lines, k, qrLabel);
          if (!qrMatch) continue;

          const value = PdfImporter.cleanValue(qrMatch.value);
          if (value) {
            qr = value;
            break;
          }
        }
      }

      const key = `${curto}|${longo}|${qr}`;
      if (!seen.has(key)) {
        seen.add(key);
        rows.push({ curto, longo, qr });
      }

      index = longIndex + long.consumed - 1;
    }

    return { rows, ignored };
  }
}
