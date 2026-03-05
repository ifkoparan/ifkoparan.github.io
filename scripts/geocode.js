#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const RAW_FILE = path.join(__dirname, '..', 'raw_videos.json');
const OUTPUT_FILE = path.join(__dirname, '..', 'videos.json');
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
  console.error('GROQ_API_KEY environment variable is required.');
  console.error('Get a free key at https://console.groq.com/keys');
  process.exit(1);
}

const BATCH_SIZE = 10;
const DELAY_MS = 3000;

async function callGroq(titles) {
  const prompt = `You are a geography expert. Given these YouTube video titles from a Turkish travel vlogger (Fatih Koparan), extract the location (country and city/region) for each video.

Return ONLY a JSON array with objects having these fields:
- "index": the index number from the input
- "country": country name in English (null if no location found)
- "countryTr": country name in Turkish (null if no location found)
- "city": city or region name in English (null if not specific)
- "cityTr": city or region name in Turkish (null if not specific)
- "lat": latitude as number
- "lng": longitude as number

If a video title doesn't mention any specific location, return null for all location fields.
If only a country is mentioned without a specific city, try to infer the city from context clues (landmarks, regions, cultural references, historical events). If you still cannot determine a city, use the capital city and set city to the capital name.
Try harder to find locations - look for country names, city names, landmarks, cultural references in BOTH the title AND the description.
For example: 'Golden Triangle' is in Thailand/Myanmar/Laos border area, 'Breaking Bad filming locations' is Albuquerque USA, 'Barcelona' is Spain, 'Battle of Badr' is Badr/Saudi Arabia, 'Nazca Lines' is Nazca/Peru, 'Killing Fields' is Phnom Penh/Cambodia, etc.
Also look for country flag emojis in titles (e.g. 🇹🇼 = Taiwan, 🇨🇳 = China, 🇮🇩 = Indonesia, 🇻🇳 = Vietnam, 🇨🇴 = Colombia, etc.).
IMPORTANT: Always provide a city value - never leave city as null if a country is identified. Use the most relevant city from the title, or the capital city as fallback.

Video titles (Turkish and English) with description excerpt:
${titles.map((t, i) => `${i}: [TR] ${t.tr}\n   [EN] ${t.en}${t.desc ? '\n   [DESC] ' + t.desc.slice(0, 200) : ''}`).join('\n')}

Return ONLY the JSON array, no markdown, no explanation.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 8192
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const content = data.choices[0].message.content.trim();

  // Extract JSON from response (handle potential markdown wrapping)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error(`Could not parse JSON from: ${content.slice(0, 200)}`);

  return JSON.parse(jsonMatch[0]);
}

const { exec } = require('child_process');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchYtLocation(videoId) {
  return new Promise((resolve) => {
    exec(
      `yt-dlp --skip-download --remote-components ejs:github --print "%(location)s" "https://www.youtube.com/watch?v=${videoId}"`,
      { timeout: 30000 },
      (err, stdout) => {
        if (err) { resolve(null); return; }
        const loc = stdout.trim();
        if (loc && loc !== 'NA' && loc !== 'null') {
          resolve(loc);
        } else {
          resolve(null);
        }
      }
    );
  });
}

async function main() {
  const rawVideos = JSON.parse(fs.readFileSync(RAW_FILE, 'utf-8'));

  // Load existing results to skip already geocoded videos
  let existing = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    const prev = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));
    for (const v of prev) {
      existing[v.id] = v;
    }
  }

  const toGeocode = rawVideos.filter(v => !existing[v.id]);
  console.log(`Total: ${rawVideos.length}, Already geocoded: ${Object.keys(existing).length}, New: ${toGeocode.length}`);

  if (toGeocode.length === 0) {
    console.log('All videos already geocoded.');
  }

  // Process in batches
  const results = { ...existing };
  for (let i = 0; i < toGeocode.length; i += BATCH_SIZE) {
    const batch = toGeocode.slice(i, i + BATCH_SIZE);
    const titles = batch.map(v => ({ tr: v.titleTr || v.title || '', en: v.titleEn || v.title || '', desc: v.description || '' }));

    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toGeocode.length / BATCH_SIZE)} (${batch.length} videos)...`);

    try {
      const locations = await callGroq(titles);

      for (const loc of locations) {
        if (loc == null) continue;
        const video = batch[loc.index];
        if (!video) continue;

        results[video.id] = {
          ...video,
          country: loc.country,
          countryTr: loc.countryTr || null,
          city: loc.city,
          cityTr: loc.cityTr || null,
          lat: loc.lat,
          lng: loc.lng,
          uploadDate: video.uploadDate || null
        };
      }
    } catch (err) {
      console.error(`Batch error: ${err.message}`);
      // Save what we have and continue
    }

    if (i + BATCH_SIZE < toGeocode.length) {
      await sleep(DELAY_MS);
    }
  }

  // Merge with existing (keep geocoded data, add raw data for non-geocoded)
  const finalVideos = rawVideos.map(v => {
    const r = results[v.id];
    const base = {
      id: v.id,
      titleTr: v.titleTr || v.title || '',
      titleEn: v.titleEn || v.title || '',
      url: v.url,
      thumbnail: v.thumbnail,
      uploadDate: v.uploadDate || (r && r.uploadDate) || null,
    };
    if (r) {
      return { ...base, country: r.country, countryTr: r.countryTr || null, city: r.city, cityTr: r.cityTr || null, lat: r.lat, lng: r.lng };
    }
    return { ...base, country: null, countryTr: null, city: null, cityTr: null, lat: null, lng: null };
  });

  // Second pass: for videos without location, try YouTube location tag
  const noLocation = finalVideos.filter(v => v.lat === null);
  if (noLocation.length > 0 && noLocation.length <= 20) {
    console.log(`\nFetching YouTube location tags for ${noLocation.length} videos without location...`);
    const withYtLoc = [];
    for (const v of noLocation) {
      const ytLoc = await fetchYtLocation(v.id);
      if (ytLoc) {
        console.log(`  [${v.id}] YouTube location: ${ytLoc}`);
        withYtLoc.push({ ...v, ytLocation: ytLoc });
      }
    }

    if (withYtLoc.length > 0) {
      console.log(`Found ${withYtLoc.length} YouTube location tags, geocoding...`);
      const titles = withYtLoc.map(v => ({
        tr: v.titleTr || '',
        en: v.titleEn || '',
        desc: `YouTube location tag: ${v.ytLocation}. ${v.description || ''}`
      }));
      try {
        const locations = await callGroq(titles);
        for (const loc of locations) {
          if (loc == null || !loc.lat) continue;
          const video = withYtLoc[loc.index];
          if (!video) continue;
          const idx = finalVideos.findIndex(fv => fv.id === video.id);
          if (idx !== -1) {
            finalVideos[idx] = {
              ...finalVideos[idx],
              country: loc.country,
              countryTr: loc.countryTr || null,
              city: loc.city,
              cityTr: loc.cityTr || null,
              lat: loc.lat,
              lng: loc.lng
            };
          }
        }
      } catch (err) {
        console.error(`YouTube location geocode error: ${err.message}`);
      }
    }
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalVideos, null, 2), 'utf-8');

  const withLocation = finalVideos.filter(v => v.lat !== null);
  console.log(`\nDone! ${withLocation.length}/${finalVideos.length} videos have locations.`);
  console.log(`Saved to videos.json`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
