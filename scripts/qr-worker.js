importScripts('https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js');

self.onmessage = event => {
  const { id, buffer, width, height } = event.data;
  const pixels = new Uint8ClampedArray(buffer);
  const qr = jsQR(pixels, width, height, { inversionAttempts: 'attemptBoth' });
  if (!qr) {
    self.postMessage({ id, result: null });
    return;
  }

  self.postMessage({
    id,
    result: {
      data: qr.data,
      location: qr.location
    }
  });
};
