export class LabelDataParser {
  // Aceita somente algarismos em cada número exibido na etiqueta.
  static numericLabelPattern = /^\d+$/;

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
      if (!LabelDataParser.numericLabelPattern.test(parts[0]) || !LabelDataParser.numericLabelPattern.test(parts[1])) {
        errors.push(`Linha ${index + 1}: "${line}" — os dois números da etiqueta devem conter apenas algarismos.`);
        return;
      }
      items.push({
        short: parts[0],
        long: parts[1],
        qr: parts[2] || '',
        qrImage: qrImages[index] || ''
      });
    });

    // Ordena pelo número curto em ordem crescente e usa o longo como desempate.
    items.sort((a, b) => {
      const shortOrder = BigInt(a.short) < BigInt(b.short) ? -1 : BigInt(a.short) > BigInt(b.short) ? 1 : 0;
      if (shortOrder) return shortOrder;
      return BigInt(a.long) < BigInt(b.long) ? -1 : BigInt(a.long) > BigInt(b.long) ? 1 : 0;
    });

    return { items, errors };
  }

  static rowsToTextareaValue(rows) {
    return rows.map(row => `${row.curto};${row.longo};${row.qr || ''}`).join('\n');
  }
}
