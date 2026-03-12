# Fatih Koparan - World Map

Interactive 3D globe that visualizes **[Fatih Koparan](https://www.youtube.com/@FatihKoparan)**'s travel videos on a world map. Each video is pinned to its filming location, making it easy to explore content by geography.

**[ifkoparan.github.io](https://ifkoparan.github.io)**

![Globe.gl](https://img.shields.io/badge/Globe.gl-v2-blue)
![Videos](https://img.shields.io/badge/videos-440+-red)
![Countries](https://img.shields.io/badge/countries-57-green)

---

## Features

- **3D Interactive Globe** — Powered by [Globe.gl](https://globe.gl) (Three.js-based)
- **Auto-updating** — GitHub Actions fetches new videos 3x daily
- **AI-powered geocoding** — Video titles are parsed with Groq (LLaMA 3.3 70B) to extract filming locations
- **Bilingual** — Turkish & English title support
- **Dark glassmorphism UI** — Responsive design with search, filters, and video previews

## How It Works

```
YouTube (RSS + yt-dlp)
        │
        ▼
  raw_videos.json       ← Video metadata (titles, dates, thumbnails)
        │
        ▼
  Groq API (LLaMA 3.3)  ← Extracts country/city from titles
        │
        ▼
   videos.json          ← Final data with lat/lng coordinates
        │
        ▼
   Globe.gl 3D Map      ← Interactive visualization
```

## Data Pipeline

| Step | Script | Description |
|------|--------|-------------|
| 1 | `scripts/fetch-videos.js` | Fetches video list from YouTube via RSS + yt-dlp |
| 2 | `scripts/fetch-dates.js` | Retrieves upload dates for new videos |
| 3 | `scripts/geocode.js` | Uses Groq API to extract locations from video titles |

Automated via GitHub Actions ([update.yml](.github/workflows/update.yml)) — runs at **05:00, 13:00, 21:00 TR time** daily.

## Tech Stack

- **Frontend:** Vanilla HTML/CSS/JS, Globe.gl v2
- **Data:** yt-dlp, YouTube RSS
- **AI:** Groq API (LLaMA 3.3 70B) for geocoding
- **Hosting:** GitHub Pages
- **CI/CD:** GitHub Actions

## Local Development

```bash
# Serve locally
npx serve .

# Fetch new videos (requires yt-dlp)
node scripts/fetch-videos.js

# Geocode videos (requires GROQ_API_KEY)
GROQ_API_KEY=your_key node scripts/geocode.js
```

## License

This project is for personal/fan use. All video content belongs to [Fatih Koparan](https://www.youtube.com/@FatihKoparan).
