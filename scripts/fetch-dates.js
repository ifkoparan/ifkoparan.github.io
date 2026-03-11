#!/usr/bin/env node
const { exec } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const RAW_FILE = path.join(__dirname, '..', 'raw_videos.json');
const PARALLEL = 5;

// Method 1: YouTube page scraping (works on GitHub Actions)
function getDateFromPage(videoId) {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const match = data.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/);
        if (match) {
          resolve(match[1]);
        } else {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// Method 2: yt-dlp fallback
function getDateFromYtDlp(videoId) {
  return new Promise((resolve) => {
    exec(
      `yt-dlp --skip-download --remote-components ejs:github --print "%(upload_date)s" "https://www.youtube.com/watch?v=${videoId}"`,
      { timeout: 60000 },
      (err, stdout) => {
        if (err) { resolve(null); return; }
        const raw = stdout.trim();
        if (raw.length === 8 && raw !== 'NA') {
          resolve(`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`);
        } else {
          resolve(null);
        }
      }
    );
  });
}

async function getDate(videoId) {
  // Try page scraping first, fall back to yt-dlp
  let date = await getDateFromPage(videoId);
  if (date) {
    console.log(`[${videoId}] Found date via page: ${date}`);
    return date;
  }

  date = await getDateFromYtDlp(videoId);
  if (date) {
    console.log(`[${videoId}] Found date via yt-dlp: ${date}`);
    return date;
  }

  console.log(`[${videoId}] Could not fetch date`);
  return null;
}

async function processBatch(videos) {
  return Promise.all(videos.map(async v => {
    const date = await getDate(v.id);
    return { id: v.id, uploadDate: date };
  }));
}

async function main() {
  const rawVideos = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));
  const needDates = rawVideos.filter(v => !v.uploadDate);

  console.log(`Total: ${rawVideos.length}, Need dates: ${needDates.length}`);

  if (needDates.length === 0) {
    console.log('All videos have dates.');
    return;
  }

  const dateMap = {};
  let done = 0;

  for (let i = 0; i < needDates.length; i += PARALLEL) {
    const batch = needDates.slice(i, i + PARALLEL);
    const results = await processBatch(batch);

    for (const r of results) {
      if (r.uploadDate) dateMap[r.id] = r.uploadDate;
    }

    done += batch.length;
    const found = Object.keys(dateMap).length;
    console.log(`Progress: ${done}/${needDates.length} processed, ${found} dates found`);
  }

  const updated = rawVideos.map(v => ({
    ...v,
    uploadDate: dateMap[v.id] || v.uploadDate || null
  }));

  fs.writeFileSync(RAW_FILE, JSON.stringify(updated, null, 2), 'utf-8');

  const withDate = updated.filter(v => v.uploadDate).length;
  console.log(`\nDone! ${withDate}/${updated.length} videos have dates.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
