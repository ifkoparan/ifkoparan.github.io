#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = 'UCHut-IQXip7mtXyC3GOiQ1A';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const LAST_RSS_FILE = path.join(__dirname, '..', 'last_rss.json');

function fetchRSS() {
  return new Promise((resolve, reject) => {
    https.get(RSS_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function setOutput(name, value) {
  const ghOutput = process.env.GITHUB_OUTPUT;
  if (ghOutput) {
    fs.appendFileSync(ghOutput, `${name}=${value}\n`);
  }
  console.log(`${name}=${value}`);
}

async function main() {
  // Load previous RSS snapshot
  let lastRssIds = [];
  if (fs.existsSync(LAST_RSS_FILE)) {
    lastRssIds = JSON.parse(fs.readFileSync(LAST_RSS_FILE, 'utf-8'));
  }
  const lastSet = new Set(lastRssIds);
  console.log(`Previous RSS snapshot: ${lastSet.size} videos`);

  // Fetch current RSS feed
  const xml = await fetchRSS();
  const rssIds = [...xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map(m => m[1]);
  console.log(`Current RSS: ${rssIds.length} videos`);

  // Save current RSS as snapshot for next run (only if changed)
  const newContent = JSON.stringify(rssIds, null, 2) + '\n';
  const oldContent = fs.existsSync(LAST_RSS_FILE) ? fs.readFileSync(LAST_RSS_FILE, 'utf-8') : '';
  if (newContent !== oldContent) {
    fs.writeFileSync(LAST_RSS_FILE, newContent, 'utf-8');
  }

  // First run: no previous snapshot, run pipeline
  if (lastSet.size === 0) {
    console.log('No previous snapshot, running pipeline.');
    setOutput('new_videos', 'true');
    return;
  }

  // Check for new videos (in current RSS but not in previous RSS)
  const newIds = rssIds.filter(id => !lastSet.has(id));

  if (newIds.length > 0) {
    console.log(`New videos found: ${newIds.join(', ')}`);
    setOutput('new_videos', 'true');
  } else {
    console.log('No new videos.');
    setOutput('new_videos', 'false');
  }
}

main().catch((err) => {
  console.error('RSS check failed, running pipeline anyway:', err.message);
  setOutput('new_videos', 'true');
});
