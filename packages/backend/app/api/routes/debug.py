from fastapi import APIRouter, Depends, Request
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import get_settings
from app.db.session import get_db
from app.models.domain import (
    BrowserSession,
    DailyStats,
    InterventionEvent,
    MoodReport,
    PageEvent,
    ProductiveUrl,
    RecommendationEvent,
    ScrollEvent,
    ThumbnailEvent,
    User,
    VideoSession,
    VideoWatchEvent,
)

settings = get_settings()
router = APIRouter()

USER_TABLES = {
    "videoSessions": VideoSession,
    "browserSessions": BrowserSession,
    "dailyStats": DailyStats,
    "scrollEvents": ScrollEvent,
    "thumbnailEvents": ThumbnailEvent,
    "pageEvents": PageEvent,
    "videoWatchEvents": VideoWatchEvent,
    "recommendationEvents": RecommendationEvent,
    "interventionEvents": InterventionEvent,
    "moodReports": MoodReport,
    "productiveUrls": ProductiveUrl,
}


@router.get("/health")
async def health(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Health check scoped to the authenticated user."""
    result: dict = {"status": "ok", "version": "0.4.0"}

    # Database connectivity
    try:
        await db.execute(text("SELECT 1"))
        result["database"] = "connected"
    except Exception:
        result["database"] = "error"
        result["status"] = "degraded"

    # Current migration revision
    try:
        row = await db.execute(text("SELECT version_num FROM alembic_version"))
        version = row.scalar_one_or_none()
        result["migration"] = version or "none"
    except Exception:
        result["migration"] = "unknown"

    # User's own row counts
    counts = {}
    for name, model in USER_TABLES.items():
        row = await db.execute(select(func.count()).select_from(model).where(model.user_id == user.id))
        counts[name] = row.scalar()
    result["userCounts"] = counts

    return result


@router.get("/db-counts")
async def get_db_counts(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return row counts per table for a user."""
    counts = {}
    for name, model in USER_TABLES.items():
        result = await db.execute(select(func.count()).select_from(model).where(model.user_id == user.id))
        counts[name] = result.scalar()

    return {"userId": str(user.id), "counts": counts}
