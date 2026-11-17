// Code 128 (set B) barcode as SVG – works with every USB / phone scanner.
const P = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];

export function code128Svg(text, { height = 50, module = 2, showText = true } = {}) {
  const value = String(text).replace(/[^\x20-\x7e]/g, '');
  const codes = [104, ...[...value].map((ch) => ch.charCodeAt(0) - 32)];
  const check = codes.reduce((a, c, i) => a + c * (i || 1), 0) % 103;
  const pattern = [...codes, check, 106].map((c) => P[c]).join('');
  let x = 10 * module;
  let bars = '';
  [...pattern].forEach((w, i) => {
    const width = Number(w) * module;
    if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${width}" height="${height}"/>`;
    x += width;
  });
  const total = x + 10 * module;
  const textH = showText ? 16 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height + textH}" width="${total}" height="${height + textH}"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g>${showText ? `<text x="${total / 2}" y="${height + 13}" font-family="monospace" font-size="13" text-anchor="middle">${value.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` : ''}</svg>`;
}

// Opens the phone/laptop camera and returns the first barcode it sees (Chrome / Android).
export const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;
