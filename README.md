# DairyTrack Pro Web

Production-ready MERN dairy farm management web app for deployment with **Render** (Express API) and **Vercel** (React frontend). The client is also installable as a PWA and the Express server can serve the built client for single-computer/local-network use.

## Demo credentials after seeding
- owner@dairytrack.com / password123
- manager@dairytrack.com / password123
- worker@dairytrack.com / password123

## Features included
- JWT authentication and role-based permissions
- MongoDB/Mongoose data models
- Dashboard analytics from live database records
- Cow profiles, Cow Value Score, milk, health, pregnancy, feed, expenses, sales, reminders
- CSV exports and print-ready report pages
- Demo seed data
- Render and Vercel configs

## Local setup

```bash
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
# edit MONGO_URI and JWT_SECRET
npm run seed
npm run dev
```

Client: http://localhost:5173  
API: http://localhost:5000

## Offline computer/PWA setup

This app can be installed as a PWA and can run from one local Express process after the client is built. The records still require a running API and MongoDB database; the PWA cache keeps the app shell available when the network drops, but it does not replace the database.

```bash
npm run install:all
cp server/.env.offline.example server/.env
cp client/.env.offline.example client/.env
# install/start MongoDB locally, then edit JWT_SECRET in server/.env
npm run seed
npm run offline:build
npm run offline:start
```

Open http://localhost:5000, then use the browser's install option or the in-app install button when available. For a local network computer acting as the farm server, keep MongoDB and `npm run offline:start` running on that computer and browse to that computer's IP address on port 5000.

On Windows, you can also run:

```powershell
.\scripts\start-offline.ps1
```

The first run creates `server\.env` if it is missing and tells you what still needs to be edited.

## Render deployment
1. Push this repo to GitHub.
2. In Render, create a Web Service using `/server` as the root directory.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables from `server/.env.example`.
6. Add your MongoDB Atlas connection string as `MONGO_URI`.

## Vercel deployment
1. Import the repo in Vercel.
2. Set root directory to `/client`.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add `VITE_API_URL=https://your-render-api.onrender.com/api`.

## Important
The app is now PWA-ready for installable desktop use, but full offline data entry would require a browser-local database/sync layer or an Electron/Tauri desktop build with an embedded database. The current offline mode is an installable local web system backed by MongoDB.
