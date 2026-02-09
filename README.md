# YouTube Detox 🧘

A Chrome extension to help you build healthier YouTube habits through awareness and gentle intervention.

## Architecture

This is a monorepo with three packages:

```
youtube-detox/
├── packages/
│   ├── extension/        # Chrome extension (React + Vite + TypeScript)
│   ├── backend/          # FastAPI backend (Python + PostgreSQL)
│   └── shared/           # Shared TypeScript types
├── docker-compose.yml    # Backend services
└── package.json          # Workspace root
```

## Features

- **Usage Tracking**: Track time spent, videos watched, shorts, searches
- **Floating Widget**: See stats directly on YouTube pages (watch/shorts)
- **Productivity Prompts**: Optional prompts to rate video productivity
- **Weekly Summaries**: Get notified about your weekly usage
- **Backend Sync**: Optionally sync data to your own backend

## Development

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker (for backend)

### Setup

```bash
# Install dependencies
pnpm install

# Build shared types
pnpm --filter @yt-detox/shared build

# Build extension
pnpm --filter @yt-detox/extension build
```

### Load Extension in Chrome

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `packages/extension/dist`

### Start Backend (Optional)

```bash
docker compose up -d
```

API runs on http://localhost:8000

### Development Mode

```bash
# Watch mode for extension
pnpm --filter @yt-detox/extension dev

# Then reload extension in Chrome after changes
```

## Backend API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/sync/sessions` | POST | Sync video/browser sessions + daily stats |
| `/sync/videos` | GET | Get synced videos |
| `/stats/overview` | GET | Today + last 7 days stats |
| `/stats/weekly` | GET | Week-over-week comparison |
| `/stats/channels` | GET | Top channels by watch time |

All endpoints require `X-User-Id` header.

## Configuration

In the extension options page:

1. Enable/disable tracking
2. Set daily goal (minutes)
3. Configure productivity prompts
4. Enable backend sync (optional)

## Tech Stack

### Extension
- React 18 + TypeScript
- Vite + @crxjs/vite-plugin
- Tailwind CSS
- Shadow DOM for style isolation

### Backend
- FastAPI
- SQLAlchemy + asyncpg
- PostgreSQL 16
- Alembic migrations
- Docker

## License

MIT
