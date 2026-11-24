// Usage: node render.js [preview t1,t2,...]   (sans argument : rend la vidéo complète)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const FPS = 30;
(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto('file://' + path.join(__dirname, 'scene.html'));
  await page.evaluate(() => window.ready);
  const canvas = await page.$('#c');
  if (process.argv[2] === 'preview') {
    for (const t of process.argv[3].split(',').map(Number)) {
      await page.evaluate(t => render(t), t);
      await canvas.screenshot({ path: path.join(__dirname, `preview_${t}.jpg`), type: 'jpeg', quality: 85 });
    }
    await browser.close(); return;
  }
  const T = await page.evaluate(() => window.T);
  const ff = spawn('ffmpeg', ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', path.join(__dirname, 'video_silent.mp4')],
    { stdio: ['pipe', 'ignore', 'inherit'] });
  const n = Math.round(T * FPS);
  for (let i = 0; i < n; i++) {
    await page.evaluate(t => render(t), i / FPS);
    const buf = await canvas.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 60 === 0) console.log(`frame ${i}/${n}`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  await browser.close();
})();
