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

  async decodeQrCodes(file, onProgress, rows = []) {
    this.initWorker();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const found = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      onProgress?.(pageNumber, pdf.numPages);

      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 6 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const context = canvas.getContext('2d', { willReadFrequently: true });
      await page.render({ canvasContext: context, viewport }).promise;

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      const addFound = qr => {
        const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = qr.location;
        const xs = [topLeftCorner.x, topRightCorner.x, bottomLeftCorner.x, bottomRightCorner.x];
        const ys = [topLeftCorner.y, topRightCorner.y, bottomLeftCorner.y, bottomRightCorner.y];
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const duplicate = found.some(item => item.page === pageNumber
          && item.data === qr.data
          && Math.abs(item.x - minX) < 12
          && Math.abs(item.y - minY) < 12);
        if (duplicate) {
          const existing = found.find(item => item.page === pageNumber
            && item.data === qr.data
            && Math.abs(item.x - minX) < 12
            && Math.abs(item.y - minY) < 12);
          if (existing && Number.isInteger(qr.rowIndex)) existing.rowIndex = qr.rowIndex;
          return;
        }

        const x = Math.max(0, Math.floor(minX - 8));
        const y = Math.max(0, Math.floor(minY - 8));
        const right = Math.min(canvas.width, Math.ceil(maxX + 8));
        const bottom = Math.min(canvas.height, Math.ceil(maxY + 8));
        const crop = document.createElement('canvas');
        crop.width = right - x;
        crop.height = bottom - y;
        crop.getContext('2d').drawImage(canvas, x, y, crop.width, crop.height, 0, 0, crop.width, crop.height);

        found.push({
          page: pageNumber,
          x: minX,
          y: minY,
          data: qr.data,
          image: crop.toDataURL('image/png'),
          rowIndex: qr.rowIndex
        });
      };

      for (let attempts = 0; attempts < 180; attempts++) {
        const qr = jsQR(pixels, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
        if (!qr) break;

        const { topLeftCorner, topRightCorner, bottomLeftCorner, bottomRightCorner } = qr.location;
        const xs = [topLeftCorner.x, topRightCorner.x, bottomLeftCorner.x, bottomRightCorner.x];
        const ys = [topLeftCorner.y, topRightCorner.y, bottomLeftCorner.y, bottomRightCorner.y];
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);

        addFound(qr);

        const startX = Math.max(0, Math.floor(minX - 4));
        const startY = Math.max(0, Math.floor(minY - 4));
        const endX = Math.min(canvas.width, Math.ceil(maxX + 4));
        const endY = Math.min(canvas.height, Math.ceil(maxY + 4));

        for (let py = startY; py < endY; py++) {
          for (let px = startX; px < endX; px++) {
            const offset = (py * imageData.width + px) * 4;
            pixels[offset] = 255;
            pixels[offset + 1] = 255;
            pixels[offset + 2] = 255;
            pixels[offset + 3] = 255;
          }
        }
      }

      // A full-page scan can miss small codes when several are close together.
      // Overlapping tiles give jsQR a larger effective QR area without changing the PDF layout.
      const tileColumns = 6;
      const tileRows = 6;
      const overlap = 0.2;
      const tileWidth = Math.ceil(canvas.width / tileColumns * (1 + overlap));
      const tileHeight = Math.ceil(canvas.height / tileRows * (1 + overlap));
      for (let tileRow = 0; tileRow < tileRows; tileRow++) {
        for (let tileColumn = 0; tileColumn < tileColumns; tileColumn++) {
          const tileX = Math.max(0, Math.floor(tileColumn * canvas.width / tileColumns - tileWidth * overlap / 2));
          const tileY = Math.max(0, Math.floor(tileRow * canvas.height / tileRows - tileHeight * overlap / 2));
          const actualWidth = Math.min(tileWidth, canvas.width - tileX);
          const actualHeight = Math.min(tileHeight, canvas.height - tileY);
          const tile = document.createElement('canvas');
          tile.width = actualWidth;
          tile.height = actualHeight;
          const tileContext = tile.getContext('2d', { willReadFrequently: true });
          tileContext.drawImage(canvas, tileX, tileY, actualWidth, actualHeight, 0, 0, actualWidth, actualHeight);
          const tileData = tileContext.getImageData(0, 0, actualWidth, actualHeight);
          for (let attempts = 0; attempts < 30; attempts++) {
            const qr = jsQR(tileData.data, actualWidth, actualHeight, { inversionAttempts: 'attemptBoth' });
            if (!qr) break;

            const translatePoint = point => ({ x: point.x + tileX, y: point.y + tileY });
            addFound({
              data: qr.data,
              location: {
                topLeftCorner: translatePoint(qr.location.topLeftCorner),
                topRightCorner: translatePoint(qr.location.topRightCorner),
                bottomLeftCorner: translatePoint(qr.location.bottomLeftCorner),
                bottomRightCorner: translatePoint(qr.location.bottomRightCorner)
              }
            });

            const points = Object.values(qr.location);
            const xs = points.map(point => point.x);
            const ys = points.map(point => point.y);
            const startX = Math.max(0, Math.floor(Math.min(...xs) - 8));
            const startY = Math.max(0, Math.floor(Math.min(...ys) - 8));
            const endX = Math.min(actualWidth, Math.ceil(Math.max(...xs) + 8));
            const endY = Math.min(actualHeight, Math.ceil(Math.max(...ys) + 8));
            for (let py = startY; py < endY; py++) {
              for (let px = startX; px < endX; px++) {
                const offset = (py * actualWidth + px) * 4;
                tileData.data[offset] = 255;
                tileData.data[offset + 1] = 255;
                tileData.data[offset + 2] = 255;
                tileData.data[offset + 3] = 255;
              }
            }
          }
        }
      }

      // The labels form a 5 x 3 grid. Decode each cell separately so neighboring
      // QR codes cannot hide one another from jsQR.
      const pageCells = rows
        .filter(row => (row.page ?? 1) === pageNumber && Number.isFinite(row.x) && Number.isFinite(row.y))
        .map(row => {
          const point = viewport.convertToViewportPoint(row.x, row.y);
          return { x: point[0], y: point[1], row };
        });
      const columnCenters = pageCells.map(cell => cell.x).sort((a, b) => a - b).reduce((centers, centerX) => {
        if (!centers.length || Math.abs(centers.at(-1) - centerX) > 4) centers.push(centerX);
        return centers;
      }, []);
      const rowCenters = pageCells.map(cell => cell.y).sort((a, b) => a - b).reduce((centers, centerY) => {
        if (!centers.length || Math.abs(centers.at(-1) - centerY) > 4) centers.push(centerY);
        return centers;
      }, []);
      for (let rowIndex = 0; rowIndex < rowCenters.length; rowIndex++) {
        const centerY = rowCenters[rowIndex];
        const top = Math.max(0, Math.floor(rowIndex ? (rowCenters[rowIndex - 1] + centerY) / 2 : 0));
        const bottom = Math.min(canvas.height, Math.ceil(
          rowIndex < rowCenters.length - 1 ? (centerY + rowCenters[rowIndex + 1]) / 2 : canvas.height
        ));
        for (let columnIndex = 0; columnIndex < columnCenters.length; columnIndex++) {
          const centerX = columnCenters[columnIndex];
          const left = Math.max(0, Math.floor(columnIndex ? (columnCenters[columnIndex - 1] + centerX) / 2 : 0));
          const right = Math.min(canvas.width, Math.ceil(
            columnIndex < columnCenters.length - 1 ? (centerX + columnCenters[columnIndex + 1]) / 2 : canvas.width
          ));
          if (right <= left || bottom <= top) continue;
          const cell = pageCells.find(candidate => Math.abs(candidate.x - centerX) <= 4
            && Math.abs(candidate.y - centerY) <= 4);

          const band = context.getImageData(left, top, right - left, bottom - top);
          for (let attempts = 0; attempts < 3; attempts++) {
            const qr = jsQR(band.data, band.width, band.height, { inversionAttempts: 'attemptBoth' });
          if (!qr) break;
          const translatePoint = point => ({ x: point.x + left, y: point.y + top });
          addFound({
            data: qr.data,
              rowIndex: cell ? rows.indexOf(cell.row) : undefined,
            location: {
              topLeftCorner: translatePoint(qr.location.topLeftCorner),
              topRightCorner: translatePoint(qr.location.topRightCorner),
              bottomLeftCorner: translatePoint(qr.location.bottomLeftCorner),
              bottomRightCorner: translatePoint(qr.location.bottomRightCorner)
            }
          });

          const points = Object.values(qr.location);
          const xs = points.map(point => point.x);
          const ys = points.map(point => point.y);
          const startX = Math.max(0, Math.floor(Math.min(...xs) - 8));
          const startY = Math.max(0, Math.floor(Math.min(...ys) - 8));
          const endX = Math.min(band.width, Math.ceil(Math.max(...xs) + 8));
          const endY = Math.min(band.height, Math.ceil(Math.max(...ys) + 8));
          for (let py = startY; py < endY; py++) {
            for (let px = startX; px < endX; px++) {
              const offset = (py * band.width + px) * 4;
              band.data[offset] = 255;
              band.data[offset + 1] = 255;
              band.data[offset + 2] = 255;
              band.data[offset + 3] = 255;
            }
          }
        }
      }
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
