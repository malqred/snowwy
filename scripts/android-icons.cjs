// Делает из значка приложения картинки для Android:
//   adaptive-foreground.png — знак на прозрачном фоне, с запасом под круглую и квадратную маску
//   adaptive-background.png — фон значка без знака
//   notification-icon.png   — белый знак для строки состояния и уведомлений
// Запуск: node scripts/android-icons.cjs
const path = require('path');
const Jimp = require('jimp-compact');

const dir = path.join(__dirname, '..', 'assets', 'images');
/** Цвет знака на значке */
const MARK = { r: 0xca, g: 0xdc, b: 0xea };
/** Доля холста, которую занимает значок внутри адаптивной иконки: знак остаётся в безопасной зоне */
const SCALE = 0.72;

const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

async function main() {
  const icon = await Jimp.read(path.join(dir, 'icon.png'));
  const { width, height } = icon.bitmap;

  // Знак: чем светлее точка, тем она плотнее. Фон тёмный, знак светлый.
  const mark = (color) => {
    const out = new Jimp(width, height, 0x00000000);
    icon.scan(0, 0, width, height, (x, y, i) => {
      const d = icon.bitmap.data;
      const alpha = Math.max(0, Math.min(1, (lum(d[i], d[i + 1], d[i + 2]) - 70) / 110));
      out.bitmap.data[i] = color.r;
      out.bitmap.data[i + 1] = color.g;
      out.bitmap.data[i + 2] = color.b;
      out.bitmap.data[i + 3] = Math.round(alpha * 255);
    });
    return out;
  };

  const place = (image, scale, size) => {
    const canvas = new Jimp(size, size, 0x00000000);
    const side = Math.round(size * scale);
    const offset = Math.round((size - side) / 2);
    canvas.composite(image.clone().resize(side, side, Jimp.RESIZE_BICUBIC), offset, offset);
    return canvas;
  };

  await place(mark(MARK), SCALE, 1024).writeAsync(path.join(dir, 'adaptive-foreground.png'));

  // Фон: тот же вертикальный градиент, цвет строки берём у левого края значка
  const background = new Jimp(width, height, 0x000000ff);
  background.scan(0, 0, width, height, (x, y, i) => {
    const from = icon.getPixelIndex(4, y);
    for (let k = 0; k < 4; k++) background.bitmap.data[i + k] = icon.bitmap.data[from + k];
  });
  await background.writeAsync(path.join(dir, 'adaptive-background.png'));

  await place(mark({ r: 255, g: 255, b: 255 }), 1.25, 96).writeAsync(path.join(dir, 'notification-icon.png'));
  console.log('Готово: adaptive-foreground.png, adaptive-background.png, notification-icon.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
