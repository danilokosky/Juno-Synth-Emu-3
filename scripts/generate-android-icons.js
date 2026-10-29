import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const svgBuffer = fs.readFileSync('public/icon.svg');

// Output directories and sizes for Android mipmaps
const androidMipmaps = [
  { dir: 'android/app/src/main/res/mipmap-mdpi', size: 48 },
  { dir: 'android/app/src/main/res/mipmap-hdpi', size: 72 },
  { dir: 'android/app/src/main/res/mipmap-xhdpi', size: 96 },
  { dir: 'android/app/src/main/res/mipmap-xxhdpi', size: 144 },
  { dir: 'android/app/src/main/res/mipmap-xxxhdpi', size: 192 },
];

// Ensure directories exist
for (const item of androidMipmaps) {
  if (!fs.existsSync(item.dir)) {
    fs.mkdirSync(item.dir, { recursive: true });
  }
}

// Generate square icons for all densities
for (const item of androidMipmaps) {
  const destPath = path.join(item.dir, 'ic_launcher.png');
  await sharp(svgBuffer)
    .resize(item.size, item.size)
    .png()
    .toFile(destPath);
  console.log(`Created ${destPath}`);

  // Create circular mask for ic_launcher_round.png
  const roundRadius = item.size / 2;
  const circleSvg = Buffer.from(
    `<svg width="${item.size}" height="${item.size}"><circle cx="${roundRadius}" cy="${roundRadius}" r="${roundRadius}" fill="#fff"/></svg>`
  );

  const roundDestPath = path.join(item.dir, 'ic_launcher_round.png');
  await sharp(svgBuffer)
    .resize(item.size, item.size)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .png()
    .toFile(roundDestPath);
  console.log(`Created ${roundDestPath}`);
}

// Also create 512x512 icon in public/ and android/
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

console.log('All Android icons generated successfully!');
