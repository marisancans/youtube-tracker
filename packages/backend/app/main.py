from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.db.session import engine
from app.api.routes import (
    sync,
    stats,
    scroll,
    thumbnails,
    pages,
    video_events,
    recommendations,
    interventions,
    mood,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="YouTube Detox API",
    version="0.3.0",
    description="Backend for YouTube Detox Chrome extension - comprehensive tracking and analytics",
    lifespan=lifespan
)

settings = get_settings()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core routes
app.include_router(sync.router, prefix="/sync", tags=["sync"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])

# Granular event routes
app.include_router(scroll.router, prefix="/scroll", tags=["scroll"])
app.include_router(thumbnails.router, prefix="/thumbnails", tags=["thumbnails"])
app.include_router(pages.router, prefix="/pages", tags=["pages"])
app.include_router(video_events.router, prefix="/video-events", tags=["video-events"])
app.include_router(recommendations.router, prefix="/recommendations", tags=["recommendations"])
app.include_router(interventions.router, prefix="/interventions", tags=["interventions"])
app.include_router(mood.router, prefix="/mood", tags=["mood"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.3.0"}


@app.get("/")
async def root():
    return {
        "name": "YouTube Detox API",
        "version": "0.3.0",
        "docs": "/docs",
        "endpoints": {
            "sync": "/sync - Session and event sync",
            "stats": "/stats - Statistics and analytics",
            "scroll": "/scroll/events - Scroll behavior tracking",
            "thumbnails": "/thumbnails/events - Thumbnail interaction tracking",
            "pages": "/pages/events - Page navigation tracking",
            "video_events": "/video-events/events - Video playback events",
            "recommendations": "/recommendations/events - Recommendation interactions",
            "interventions": "/interventions/events - Intervention tracking",
            "mood": "/mood/reports - Mood self-reports",
        }
    }
