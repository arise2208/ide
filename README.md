# CP IDE (Electron + React + Monaco)

Minimal scaffold for a Competitive Programming IDE using Electron, React (Vite), and Monaco Editor.

Quick start:

1. Install dependencies at root and renderer:

```bash
cd /Users/dep/Desktop/work
npm install
cd renderer
npm install
```

2. Start dev (runs Vite and Electron):

```bash
cd /Users/dep/Desktop/work
npm run start
```

Notes:
- The root `start` script uses `concurrently` and `wait-on`. It waits for Vite (port 5173) then starts Electron.
- Building for production requires additional configuration in `electron-builder` if packaging is desired.
