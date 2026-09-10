# Rohit Sharma — Premium Cricket Profile

A premium, responsive, data-driven Rohit Sharma cricket profile website built with HTML5, CSS3, JavaScript, Bootstrap 5 and Chart.js.

## Important accuracy note

This project deliberately separates biography from statistics and stores the published data in `/data/*.json`. The snapshot is dated **2 September 2026** and was checked against current BCCI and IPL.com pages available during build. Some third-party cricket databases show different aggregates; the source field is therefore kept with each dataset.

Primary references used:
- BCCI Rohit Sharma player profile: https://www.bcci.tv/players/6/rohit-sharma?platform=international&type=men
- BCCI Test retirement notice: https://www.bcci.tv/news/article/bcci-congratulates-rohit-sharma-on-a-glorious-test-career
- ICC 2019 World Cup records: https://www.icc-cricket.com/tournaments/cricketworldcup/news/cwc19-team-of-the-tournament
- ICC ODI records: https://www.icc-cricket.com/news/rohit-sharmas-odi-dominance-in-numbers
- ICC T20I retirement: https://www.icc-cricket.com/tournaments/t20cricketworldcup/news/title-winning-skipper-rohit-sharma-confirms-retirement-from-t20-internationals
- Government of India National Sports Awards 2020: https://www.pib.gov.in/PressReleasePage.aspx?PRID=1647633&lang=2&reg=48
- Government of India Arjuna Awards 2015: https://www.pib.gov.in/newsite/printrelease.aspx?lang=2&reg=48&relid=126073
- IPL.com player profile: https://www.ipl.com/player/rohit-sharma

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

The browser needs HTTP because the frontend loads JSON with `fetch()`.

## Architecture

- `/index.html` — premium home dashboard
- `/profile.html` — biography and player card
- `/career.html` — JSON-driven timeline
- `/stats.html` — interactive format dashboard
- `/records.html` — filterable records
- `/ipl.html` — IPL season table + Chart.js trend
- `/worldcup.html` — expandable World Cup cards
- `/achievements.html` — awards and achievements
- `/gallery.html` — filterable lightbox gallery
- `/news.html` — source-linked news cards
- `/data/*.json` — editable content/data layer
- `/js/app.js` — rendering, charts, filters, search, theme, animations
- `/server.js` — Express static server + API-ready read endpoints + CRUD placeholders

## API-ready admin architecture

Read endpoints:
- `GET /api/player`
- `GET /api/test`
- `GET /api/odi`
- `GET /api/t20i`
- `GET /api/ipl`
- `GET /api/records`
- `GET /api/achievements`
- `GET /api/timeline`
- `GET /api/worldcup`
- `GET /api/news`
- `GET /api/gallery`

Write endpoints are intentionally scaffolded with HTTP 501 until authentication, validation and MongoDB persistence are connected. Do not expose admin writes publicly without auth.

## Images

The demo gallery uses externally hosted editorial images discovered during research. Production deployment should replace these with **locally hosted, licensed** WebP/AVIF assets and preserve photographer/source credits as required by the license. The OG image is an original generated graphic and does not claim official affiliation.

## Deployment

Before deployment:
1. Replace `example.com` in canonical/Open Graph/sitemap URLs with the real domain.
2. Replace demo/editorial image URLs with licensed local assets.
3. Update `lastUpdated` in the relevant JSON files after each verified data refresh.
4. Add a real news API only after reviewing its license/terms.
5. Connect MongoDB + authentication for admin CRUD.
