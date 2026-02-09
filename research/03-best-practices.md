# Best Practices: Chrome Extension with React + Vite + Backend Sync

## 1. React + Vite Chrome Extension Build

### @crxjs/vite-plugin (Recommended)
The de facto standard for building Chrome extensions with Vite. Key benefits:
- **HMR in content scripts** - Changes reflect instantly without reloading extension
- **Manifest generation** - Reads `manifest.json` and handles bundling automatically
- **Multiple entry points** - Background, content scripts, popup all built correctly
- **Asset handling** - Icons, CSS injected properly

```typescript
// vite.config.ts
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
})
```

### Build Structure
```
dist/
├── manifest.json          # Generated from source
├── background.js          # Service worker bundle
├── content-script.js      # Content script bundle
├── assets/                # React chunks, CSS
└── popup.html            # If needed
```

### Key Patterns
1. **Service Worker Constraints**: No DOM access, use importScripts() carefully
2. **Content Script Isolation**: Runs in isolated world, can't access page JS directly
3. **Message Passing**: chrome.runtime.sendMessage for content ↔ background

---

## 2. shadcn/ui in Chrome Extensions

### Shadow DOM Isolation (Critical)
Content scripts inject into host pages. Without isolation, YouTube's CSS will break your components.

**Solution: Shadow DOM + Tailwind**

```tsx
// Mount React into shadow root
const host = document.createElement('div')
const shadow = host.attachShadow({ mode: 'open' })

// Inject Tailwind CSS into shadow DOM
const style = document.createElement('style')
style.textContent = tailwindCSS // Import as raw string
shadow.appendChild(style)

// Mount React
const root = document.createElement('div')
shadow.appendChild(root)
createRoot(root).render(<App />)

document.body.appendChild(host)
```

### shadcn/ui Setup
1. Install normally: `npx shadcn-ui@latest init`
2. Configure `components.json` for your path structure
3. Add components: `npx shadcn-ui@latest add button card`
4. Ensure Tailwind CSS is injected into shadow DOM

### Style Handling
- Use `@layer` directives to control specificity
- Consider `!important` for critical overrides if needed
- Test against YouTube's aggressive CSS

---

## 3. Digital Wellbeing Extension Patterns

### Data Collection Principles
1. **Privacy by Design**: Collect only what's needed
2. **Local-First**: Store in chrome.storage.local, sync optionally
3. **Aggregation**: Prefer computed stats over raw event logs
4. **User Control**: Let users choose data collection level

### Behavioral Tracking Metrics
- **Active Time**: Tab visible + video playing
- **Background Time**: Tab hidden or video paused
- **Session Boundaries**: 30-60s inactivity = session end
- **Video Completion**: Percentage watched, abandonment point
- **Navigation Patterns**: Source attribution (search, recommendation, autoplay)

### Intervention Patterns
1. **Non-Blocking**: Prompts that dismiss automatically
2. **Progressive**: Start gentle, increase over time
3. **Personalized**: Learn what works for this user
4. **Respectful**: User can always dismiss/disable

### Storage Limits
- `chrome.storage.local`: 10MB with `unlimitedStorage` permission
- Implement rotation for event logs (keep last N items)
- Aggregate old data into daily summaries

---

## 4. Extension ↔ Backend Sync Patterns

### Sync Strategy
1. **Batch Sync**: Collect events locally, sync periodically (5-15 min)
2. **On-Demand Sync**: Sync on page unload, tab hidden, session end
3. **Retry Queue**: Store failed syncs, retry with exponential backoff

### Conflict Resolution
- Backend is source of truth for aggregated stats
- Extension is source of truth for raw events
- Use timestamps for ordering

### API Design
```
POST /sync/sessions     # Batch upload video sessions
POST /sync/events       # Batch upload granular events
GET  /stats/daily       # Fetch aggregated stats
GET  /stats/weekly      # Fetch weekly summary
GET  /health            # Backend status check
```

### Offline Handling
```typescript
class SyncQueue {
  private queue: SyncItem[] = []
  
  async sync() {
    const pending = await this.loadQueue()
    for (const item of pending) {
      try {
        await this.sendToBackend(item)
        await this.removeFromQueue(item.id)
      } catch (e) {
        item.retries++
        item.nextRetry = Date.now() + backoff(item.retries)
      }
    }
  }
}
```

### Authentication
- Use device-generated UUID as user ID (privacy-friendly)
- Optional: API key for backend access
- Store credentials in `chrome.storage.sync` for cross-device

---

## 5. Monorepo Structure with pnpm

### Workspace Setup
```json
// pnpm-workspace.yaml
packages:
  - 'packages/*'
```

### Package Dependencies
```
shared/           # @yt-detox/shared - Types, schemas
  ↑
extension/        # @yt-detox/extension - Depends on shared
backend/          # @yt-detox/backend - Depends on shared
```

### Shared Types Benefits
- Single source of truth for API contracts
- TypeScript catches mismatches at build time
- Sync Pydantic models with Zod schemas

---

## 6. FastAPI Backend Patterns

### Project Structure
```
app/
├── api/
│   ├── deps.py          # Dependency injection
│   ├── routes/
│   │   ├── sync.py
│   │   └── stats.py
├── models/
│   ├── domain.py        # SQLAlchemy models
│   └── schemas.py       # Pydantic schemas
├── services/
│   ├── sync.py          # Business logic
│   └── stats.py
├── db/
│   ├── session.py       # Database connection
│   └── migrations/      # Alembic
└── main.py
```

### Async Best Practices
```python
from sqlalchemy.ext.asyncio import AsyncSession

async def create_session(db: AsyncSession, data: SessionCreate):
    session = WatchSession(**data.dict())
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session
```

### Docker Compose Setup
```yaml
services:
  api:
    build: ./packages/backend
    environment:
      DATABASE_URL: postgresql+asyncpg://...
    depends_on:
      db:
        condition: service_healthy
  
  db:
    image: postgres:16-alpine
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
```

---

## 7. Testing Strategy

### Extension Testing
1. **Unit Tests**: Vitest for utility functions
2. **Integration**: Playwright for end-to-end
3. **Manual**: Load unpacked in Chrome, navigate YouTube

### Backend Testing
1. **Unit**: pytest with fixtures
2. **Integration**: TestClient with test database
3. **API Contract**: Generate OpenAPI, validate against shared types

### E2E Flow
```
watch video → content script logs → background aggregates → 
sync to backend → verify in database → fetch stats → verify in UI
```

---

## 8. Development Workflow

### Local Development
1. `pnpm dev` in extension/ - Vite watches, rebuilds
2. Chrome loads `dist/` as unpacked extension
3. `docker-compose up` for backend + postgres
4. Extension syncs to localhost backend

### Hot Reload
- @crxjs enables HMR for content scripts
- Background changes require extension reload
- Manifest changes require extension reload

### Debugging
- `chrome://extensions` → Inspect service worker
- DevTools in YouTube tab for content script
- React DevTools works in shadow DOM

---

## Summary Recommendations

1. **Use @crxjs/vite-plugin** for seamless Vite integration
2. **Shadow DOM is mandatory** for content script UI
3. **Batch sync with retry** for reliable backend sync
4. **Local-first** with optional cloud sync
5. **Shared types package** for API contracts
6. **FastAPI + asyncpg** for modern Python backend
7. **pnpm workspaces** for monorepo management
