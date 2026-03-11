#!/usr/bin/env node
const { exec } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const RAW_FILE = path.join(__dirname, '..', 'raw_videos.json');
const CHANNEL_ID = 'UCHut-IQXip7mtXyC3GOiQ1A';
const PARALLEL = 5;

// Method 0: YouTube RSS feed (most reliable, no auth needed, works on GitHub Actions)
function fetchRSSDateMap() {
  return new Promise((resolve) => {
    const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const map = {};
        const entries = data.split('<entry>').slice(1);
        for (const entry of entries) {
          const idMatch = entry.match(/<yt:videoId>([^<]+)/);
          const dateMatch = entry.match(/<published>(\d{4}-\d{2}-\d{2})/);
          if (idMatch && dateMatch) {
            map[idMatch[1]] = dateMatch[1];
          }
        }
        console.log(`RSS feed: found dates for ${Object.keys(map).length} videos`);
        resolve(map);
      });
    }).on('error', (err) => {
      console.error('RSS feed fetch failed:', err.message);
      resolve({});
    });
  });
}

// Method 1: YouTube page scraping
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

async function getDate(videoId, rssDateMap) {
  // Try RSS feed first (most reliable on GitHub Actions)
  if (rssDateMap[videoId]) {
    console.log(`[${videoId}] Found date via RSS: ${rssDateMap[videoId]}`);
    return rssDateMap[videoId];
  }

  // Fallback: page scraping
  let date = await getDateFromPage(videoId);
  if (date) {
    console.log(`[${videoId}] Found date via page: ${date}`);
    return date;
  }

  // Fallback: yt-dlp
  date = await getDateFromYtDlp(videoId);
  if (date) {
    console.log(`[${videoId}] Found date via yt-dlp: ${date}`);
    return date;
  }

  console.log(`[${videoId}] Could not fetch date`);
  return null;
}

async function processBatch(videos, rssDateMap) {
  return Promise.all(videos.map(async v => {
    const date = await getDate(v.id, rssDateMap);
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

  // Fetch RSS date map once (covers last ~15 videos)
  const rssDateMap = await fetchRSSDateMap();

  const dateMap = {};
  let done = 0;

  for (let i = 0; i < needDates.length; i += PARALLEL) {
    const batch = needDates.slice(i, i + PARALLEL);
    const results = await processBatch(batch, rssDateMap);

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
