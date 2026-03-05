#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CHANNEL_URL = 'https://www.youtube.com/@ifkoparan/videos';
const OUTPUT_FILE = path.join(__dirname, '..', 'raw_videos.json');

function fetchWithLang(lang) {
  console.log(`Fetching ${lang.toUpperCase()} titles...`);
  const output = execSync(
    `yt-dlp --flat-playlist --remote-components ejs:github --extractor-args "youtube:lang=${lang}" --dump-single-json "${CHANNEL_URL}"`,
    { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
  );
  const data = JSON.parse(output);
  const map = {};
  for (const entry of data.entries || []) {
    if (entry.id) {
      map[entry.id] = {
        title: entry.title || '',
        rawDate: entry.upload_date || '',
        description: (entry.description || '').slice(0, 500)
      };
    }
  }
  return map;
}

// Load existing dates to preserve them
const existingDates = {};
if (fs.existsSync(OUTPUT_FILE)) {
  const prev = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
  for (const v of prev) {
    if (v.uploadDate) existingDates[v.id] = v.uploadDate;
  }
}

// Fetch TR titles
const trData = fetchWithLang('tr');

// Wait 5s to avoid rate limiting, then fetch EN titles
console.log('Waiting 5s before EN fetch...');
execSync('sleep 5');

let enData = {};
try {
  enData = fetchWithLang('en');
} catch (err) {
  console.error('EN fetch failed, using TR as fallback:', err.message);
}

// Merge by video ID (TR as primary source)
const videos = Object.entries(trData)
  .map(([id, tr]) => {
    const en = enData[id] || {};
    const rawDate = tr.rawDate;
    const uploadDate = rawDate.length === 8
      ? `${rawDate.slice(0,4)}-${rawDate.slice(4,6)}-${rawDate.slice(6,8)}`
      : existingDates[id] || null;
    return {
      id,
      titleTr: tr.title,
      titleEn: en.title || tr.title,
      description: tr.description || en.description || '',
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
      uploadDate
    };
  })
  .filter(v => v.id && v.titleTr);

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(videos, null, 2), 'utf-8');
console.log(`Saved ${videos.length} videos to raw_videos.json (TR + EN titles)`);
