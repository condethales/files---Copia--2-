export class LabelDataParser {
  constructor(getQrImages) {
    this.getQrImages = getQrImages;
  }

  parse(raw) {
    const lines = raw.split('\n').map(line => line.trim()).filter(Boolean);
    const items = [];
    const errors = [];
    const qrImages = this.getQrImages();

    lines.forEach((line, index) => {
      const parts = line.split(/[;,\t]/).map(part => part.trim()).filter(Boolean);
      if (parts.length < 2) {
        errors.push(`Linha ${index + 1}: "${line}" — use ; entre os dois números.`);
        return;
      }
      items.push({
        short: parts[0],
        long: parts[1],
        qr: parts[2] || '',
        qrImage: qrImages[index] || ''
      });
    });

    return { items, errors };
  }

  static rowsToTextareaValue(rows) {
    return rows.map(row => `${row.curto};${row.longo};${row.qr || ''}`).join('\n');
  }
}
