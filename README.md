# Crateplay

A Steam/Epic-style game store built as a full-stack learning project. Plain Node.js with no npm dependencies, a single-page frontend, and SQLite storage.

![screenshot](docs/screenshot.png) <!-- add a screenshot here -->

## Features
- **Store and free games:** browse, filter by genre, sort, search, cart, library, wishlist, game detail pop-ups
- **Live data:** real INR prices, cover art, descriptions and system requirements from the Steam store API, all-time lows from CheapShark
- **PC compatibility checker:** enter your RAM and graphics level, and each game shows whether it will run
- **Mood search:** type "cozy, short, no multiplayer" and get matching games
- **Price tracking:** the server saves one price per game per day and draws a real price chart over time
- **Accounts:** sign up and log in (scrypt-hashed passwords, session tokens, login rate limiting); cart, library and wishlist sync across devices
- **Groups:** shared wishlists with a join code, and per-person gift cost splitting

## Run locally
Requires Node 22.13 or newer.

    node server.js

Open http://localhost:3000. Data is saved in `crateplay.db` (SQLite).

## Configuration
| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `DATA_DIR` | project folder | Folder for `crateplay.db`. Point this at a persistent disk or volume when deploying |

## API
`POST /api/signup`, `POST /api/login`, `POST /api/logout`, `GET /api/me`, `PUT /api/state`, `GET|POST /api/groups`, `POST /api/groups/join`, `GET /api/history/:id`, `GET /api/games`

## Deploying
Any Node host works (Railway, Fly.io, Render). The database is a file, so use a host with a persistent volume and set `DATA_DIR` to its path. On hosts with an ephemeral filesystem, accounts and price history are lost when the app restarts.

## Known limitations
- Sample game list of 20 titles, not the full catalog
- No real payments (checkout is simulated)
- Some games (Fortnite, Rocket League, Genshin Impact) are not on Steam and keep sample data
- Not audited for production use: add HTTPS (most hosts do this), CSRF/abuse protection and a backup plan before real users
