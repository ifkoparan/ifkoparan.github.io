#!/usr/bin/env node
const https = require('https');
const fs = require('fs');
const path = require('path');

const CHANNEL_ID = 'UCHut-IQXip7mtXyC3GOiQ1A';
const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;
const RAW_FILE = path.join(__dirname, '..', 'raw_videos.json');

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
  // Load existing video IDs
  const existingIds = new Set();
  if (fs.existsSync(RAW_FILE)) {
    const videos = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));
    for (const v of videos) {
      if (v.id) existingIds.add(v.id);
    }
  }
  console.log(`Existing videos: ${existingIds.size}`);

  // Fetch RSS feed
  const xml = await fetchRSS();
  const rssIds = [...xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map(m => m[1]);
  console.log(`RSS videos: ${rssIds.length}`);

  // Check for new videos
  const newIds = rssIds.filter(id => !existingIds.has(id));

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
