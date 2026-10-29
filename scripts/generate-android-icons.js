import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgBuffer = fs.readFileSync('public/icon.svg');

// Output directories and sizes for Android mipmaps
// Standard legacy sizes: 48, 72, 96, 144, 192
// Adaptive foreground sizes (108dp): 108, 162, 216, 324, 432
const androidMipmaps = [
  { dir: 'android/app/src/main/res/mipmap-mdpi', legacySize: 48, fgCanvasSize: 108, fgIconSize: 76 },
  { dir: 'android/app/src/main/res/mipmap-hdpi', legacySize: 72, fgCanvasSize: 162, fgIconSize: 114 },
  { dir: 'android/app/src/main/res/mipmap-xhdpi', legacySize: 96, fgCanvasSize: 216, fgIconSize: 152 },
  { dir: 'android/app/src/main/res/mipmap-xxhdpi', legacySize: 144, fgCanvasSize: 324, fgIconSize: 228 },
  { dir: 'android/app/src/main/res/mipmap-xxxhdpi', legacySize: 192, fgCanvasSize: 432, fgIconSize: 304 },
];

// Ensure directories exist
for (const item of androidMipmaps) {
  if (!fs.existsSync(item.dir)) {
    fs.mkdirSync(item.dir, { recursive: true });
  }
}

// 1. Generate legacy square and round icons for each density
for (const item of androidMipmaps) {
  // Legacy ic_launcher.png
  const destPath = path.join(item.dir, 'ic_launcher.png');
  await sharp(svgBuffer)
    .resize(item.legacySize, item.legacySize)
    .png()
    .toFile(destPath);
  console.log(`Created ${destPath}`);

  // Legacy ic_launcher_round.png
  const roundRadius = item.legacySize / 2;
  const circleSvg = Buffer.from(
    `<svg width="${item.legacySize}" height="${item.legacySize}"><circle cx="${roundRadius}" cy="${roundRadius}" r="${roundRadius}" fill="#fff"/></svg>`
  );

  const roundDestPath = path.join(item.dir, 'ic_launcher_round.png');
  await sharp(svgBuffer)
    .resize(item.legacySize, item.legacySize)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .png()
    .toFile(roundDestPath);
  console.log(`Created ${roundDestPath}`);

  // 2. Adaptive Foreground (ic_launcher_foreground.png):
  // 108dp canvas with the icon safely placed in the inner 72dp zone
  const innerIcon = await sharp(svgBuffer)
    .resize(item.fgIconSize, item.fgIconSize)
    .png()
    .toBuffer();

  const fgDestPath = path.join(item.dir, 'ic_launcher_foreground.png');
  await sharp({
    create: {
      width: item.fgCanvasSize,
      height: item.fgCanvasSize,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([{
      input: innerIcon,
      gravity: 'center'
    }])
    .png()
    .toFile(fgDestPath);
  console.log(`Created adaptive foreground ${fgDestPath}`);
}

// Also generate full resolution icons
await sharp(svgBuffer)
  .resize(512, 512)
  .png()
  .toFile('public/icon-512.png');
console.log('Created public/icon-512.png');

await sharp(svgBuffer)
  .resize(192, 192)
  .png()
  .toFile('public/icon-192.png');
console.log('Created public/icon-192.png');

console.log('All Android icons and adaptive foregrounds generated successfully!');
