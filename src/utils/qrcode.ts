import qrcode from 'qrcode-generator';

/**
 * 生成二维码布尔矩阵（dark = 需要绘制的模块）
 *
 * - typeNumber=0 让库自动选择能容纳内容的最小版本（二维码体积随内容自适应）
 * - 纠错级别默认 M（15%），名片/深链这类短文本用 M 足够，识读稳健
 */
export function qrMatrix(
  text: string,
  ecLevel: 'L' | 'M' | 'Q' | 'H' = 'M',
): boolean[][] {
  const qr = qrcode(0, ecLevel);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const matrix: boolean[][] = new Array(count);
  for (let r = 0; r < count; r++) {
    const row = new Array<boolean>(count);
    for (let c = 0; c < count; c++) row[c] = qr.isDark(r, c);
    matrix[r] = row;
  }
  return matrix;
}
