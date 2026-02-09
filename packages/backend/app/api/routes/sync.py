from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from datetime import datetime, date
import time

from app.db.session import get_db
from app.models.domain import User, VideoSession, BrowserSession, DailyStats
from app.models.schemas import SyncRequest, SyncResponse
from app.api.deps import get_or_create_user

router = APIRouter()


@router.post("/sessions", response_model=SyncResponse)
async def sync_sessions(
    data: SyncRequest,
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Sync video sessions, browser sessions, and daily stats from extension."""
    
    synced_sessions = 0
    synced_browser_sessions = 0
    synced_daily_stats = 0
    
    # Sync video sessions
    for session_data in data.sessions:
        # Check if already exists
        existing = await db.execute(
            select(VideoSession).where(
                VideoSession.user_id == user.id,
                VideoSession.ext_session_id == session_data.id
            )
        )
        if existing.scalar_one_or_none():
            continue
            
        session = VideoSession(
            user_id=user.id,
            ext_session_id=session_data.id,
            video_id=session_data.video_id,
            title=session_data.title,
            channel=session_data.channel,
            duration_seconds=session_data.duration_seconds,
            watched_seconds=session_data.watched_seconds,
            watched_percent=session_data.watched_percent,
            source=session_data.source,
            is_short=session_data.is_short,
            playback_speed=session_data.playback_speed,
            productivity_rating=session_data.productivity_rating,
            rated_at=datetime.fromtimestamp(session_data.rated_at / 1000) if session_data.rated_at else None,
            timestamp=datetime.fromtimestamp(session_data.timestamp / 1000),
        )
        db.add(session)
        synced_sessions += 1
    
    # Sync browser sessions
    for bs_data in data.browser_sessions:
        existing = await db.execute(
            select(BrowserSession).where(
                BrowserSession.ext_session_id == bs_data.id
            )
        )
        if existing.scalar_one_or_none():
            continue
            
        browser_session = BrowserSession(
            user_id=user.id,
            ext_session_id=bs_data.id,
            started_at=datetime.fromtimestamp(bs_data.started_at / 1000),
            ended_at=datetime.fromtimestamp(bs_data.ended_at / 1000) if bs_data.ended_at else None,
            active_seconds=bs_data.active_seconds,
            background_seconds=bs_data.background_seconds,
            duration_seconds=bs_data.duration_seconds,
            video_count=bs_data.video_count,
            shorts_count=bs_data.shorts_count,
            autoplay_count=bs_data.autoplay_count,
            recommendation_clicks=bs_data.recommendation_clicks,
            search_count=bs_data.search_count,
        )
        db.add(browser_session)
        synced_browser_sessions += 1
    
    # Sync daily stats (upsert)
    for date_str, stats_data in data.daily_stats.items():
        try:
            stats_date = date.fromisoformat(date_str)
        except ValueError:
            continue
            
        stmt = insert(DailyStats).values(
            user_id=user.id,
            date=stats_date,
            total_seconds=stats_data.total_seconds,
            active_seconds=stats_data.active_seconds,
            background_seconds=stats_data.background_seconds,
            video_count=stats_data.video_count,
            shorts_count=stats_data.shorts_count,
            session_count=stats_data.session_count,
            search_count=stats_data.search_count,
            recommendation_clicks=stats_data.recommendation_clicks,
            autoplay_count=stats_data.autoplay_count,
            productive_videos=stats_data.productive_videos,
            unproductive_videos=stats_data.unproductive_videos,
            neutral_videos=stats_data.neutral_videos,
            prompts_shown=stats_data.prompts_shown,
            prompts_answered=stats_data.prompts_answered,
        )
        
        stmt = stmt.on_conflict_do_update(
            index_elements=["user_id", "date"],
            set_={
                "total_seconds": stmt.excluded.total_seconds,
                "active_seconds": stmt.excluded.active_seconds,
                "background_seconds": stmt.excluded.background_seconds,
                "video_count": stmt.excluded.video_count,
                "shorts_count": stmt.excluded.shorts_count,
                "session_count": stmt.excluded.session_count,
                "search_count": stmt.excluded.search_count,
                "recommendation_clicks": stmt.excluded.recommendation_clicks,
                "autoplay_count": stmt.excluded.autoplay_count,
                "productive_videos": stmt.excluded.productive_videos,
                "unproductive_videos": stmt.excluded.unproductive_videos,
                "neutral_videos": stmt.excluded.neutral_videos,
                "prompts_shown": stmt.excluded.prompts_shown,
                "prompts_answered": stmt.excluded.prompts_answered,
                "updated_at": datetime.utcnow(),
            }
        )
        await db.execute(stmt)
        synced_daily_stats += 1
    
    await db.commit()
    
    return SyncResponse(
        success=True,
        synced_sessions=synced_sessions,
        synced_browser_sessions=synced_browser_sessions,
        synced_daily_stats=synced_daily_stats,
        last_sync_time=int(time.time() * 1000)
    )


@router.get("/videos")
async def get_synced_videos(
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 100,
    offset: int = 0
):
    """Get synced video sessions for a user."""
    result = await db.execute(
        select(VideoSession)
        .where(VideoSession.user_id == user.id)
        .order_by(VideoSession.timestamp.desc())
        .limit(limit)
        .offset(offset)
    )
    sessions = result.scalars().all()
    
    return {
        "videos": [
            {
                "id": str(s.id),
                "videoId": s.video_id,
                "title": s.title,
                "channel": s.channel,
                "watchedSeconds": s.watched_seconds,
                "watchedPercent": s.watched_percent,
                "source": s.source,
                "isShort": s.is_short,
                "productivityRating": s.productivity_rating,
                "timestamp": int(s.timestamp.timestamp() * 1000),
            }
            for s in sessions
        ],
        "total": len(sessions),
        "limit": limit,
        "offset": offset
    }
