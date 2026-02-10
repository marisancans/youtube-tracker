"""
YouTube Detox API - Main Application

Security features:
- Google OAuth authentication
- Rate limiting (slowapi)
- Request size limits
- CORS restrictions
- Input validation
"""

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.config import get_settings
from app.db.session import engine
from app.api.routes import sync, stats

settings = get_settings()


# Rate limiter - key by user ID from token or IP
def get_rate_limit_key(request: Request) -> str:
    """Get rate limit key - prefer user ID, fallback to IP."""
    # Try to get user ID from header (set after auth)
    user_id = request.headers.get("X-User-Id")
    if user_id:
        return f"user:{user_id}"
    return get_remote_address(request)


limiter = Limiter(key_func=get_rate_limit_key)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown
    await engine.dispose()


app = FastAPI(
    title="YouTube Detox API",
    version="0.4.0",
    description="Secure backend for YouTube Detox Chrome extension",
    lifespan=lifespan
)

# Add rate limiter to app state
app.state.limiter = limiter

# Rate limit exceeded handler
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add SlowAPI middleware
app.add_middleware(SlowAPIMiddleware)


# Request size limit middleware
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """Limit request body size to prevent DoS."""
    max_size = settings.max_request_size_mb * 1024 * 1024  # Convert to bytes
    
    content_length = request.headers.get("content-length")
    if content_length:
        if int(content_length) > max_size:
            return JSONResponse(
                status_code=413,
                content={"detail": f"Request body too large. Max: {settings.max_request_size_mb}MB"}
            )
    
    return await call_next(request)


# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response


# CORS - configured per environment
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST"],  # Restrict methods
    allow_headers=["Authorization", "Content-Type", "X-User-Id"],
)


# Routes
app.include_router(sync.router, prefix="/sync", tags=["sync"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])


@app.get("/health")
@limiter.limit("60/minute")
async def health_check(request: Request):
    return {
        "status": "ok",
        "version": "0.4.0",
        "auth_required": settings.require_auth
    }


@app.get("/")
@limiter.limit("60/minute")
async def root(request: Request):
    return {
        "name": "YouTube Detox API",
        "version": "0.4.0",
        "auth": "Google OAuth (Bearer token)" if settings.require_auth else "Development mode (X-User-Id)",
        "docs": "/docs",
        "endpoints": {
            "sync": "POST /sync - Unified sync for all data types",
            "videos": "GET /sync/videos - Query synced videos",
            "daily_stats": "GET /sync/stats/{date} - Query daily stats",
            "stats": "GET /stats/* - Analytics endpoints",
        }
    }
