from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import get_settings
from app.db.session import engine
from app.api.routes import sync, stats


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="YouTube Detox API",
    version="0.2.0",
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

# Routes
app.include_router(sync.router, prefix="/sync", tags=["sync"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": "0.2.0"}
