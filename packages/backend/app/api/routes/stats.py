from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import date, timedelta

from app.db.session import get_db
from app.models.domain import User, VideoSession, DailyStats
from app.models.schemas import StatsOverview, DailyStatsResponse, WeeklyComparison
from app.api.deps import get_or_create_user

router = APIRouter()


@router.get("/overview", response_model=StatsOverview)
async def get_stats_overview(
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Get stats overview including today and last 7 days."""
    today = date.today()
    week_ago = today - timedelta(days=7)
    
    # Get today's stats
    result = await db.execute(
        select(DailyStats).where(
            DailyStats.user_id == user.id,
            DailyStats.date == today
        )
    )
    today_stats = result.scalar_one_or_none()
    
    # Get last 7 days
    result = await db.execute(
        select(DailyStats)
        .where(
            DailyStats.user_id == user.id,
            DailyStats.date >= week_ago
        )
        .order_by(DailyStats.date.desc())
    )
    last7days = result.scalars().all()
    
    # Calculate totals
    total_videos = sum(d.video_count for d in last7days)
    total_seconds = sum(d.total_seconds for d in last7days)
    total_hours = total_seconds / 3600
    avg_daily_minutes = (total_seconds / 60) / max(len(last7days), 1)
    
    return StatsOverview(
        today=DailyStatsResponse.model_validate(today_stats) if today_stats else None,
        last7days=[DailyStatsResponse.model_validate(d) for d in last7days],
        total_videos=total_videos,
        total_hours=round(total_hours, 1),
        avg_daily_minutes=round(avg_daily_minutes, 1)
    )


@router.get("/weekly")
async def get_weekly_comparison(
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
) -> WeeklyComparison:
    """Get comparison between this week and previous week."""
    today = date.today()
    this_week_start = today - timedelta(days=6)
    prev_week_start = today - timedelta(days=13)
    prev_week_end = today - timedelta(days=7)
    
    # This week
    result = await db.execute(
        select(
            func.sum(DailyStats.total_seconds).label("seconds"),
            func.sum(DailyStats.video_count).label("videos")
        )
        .where(
            DailyStats.user_id == user.id,
            DailyStats.date >= this_week_start,
            DailyStats.date <= today
        )
    )
    this_week = result.one()
    
    # Previous week
    result = await db.execute(
        select(
            func.sum(DailyStats.total_seconds).label("seconds"),
            func.sum(DailyStats.video_count).label("videos")
        )
        .where(
            DailyStats.user_id == user.id,
            DailyStats.date >= prev_week_start,
            DailyStats.date <= prev_week_end
        )
    )
    prev_week = result.one()
    
    this_week_minutes = int((this_week.seconds or 0) / 60)
    prev_week_minutes = int((prev_week.seconds or 0) / 60)
    
    change_percent = 0.0
    if prev_week_minutes > 0:
        change_percent = round(
            ((this_week_minutes - prev_week_minutes) / prev_week_minutes) * 100, 1
        )
    
    return WeeklyComparison(
        this_week_minutes=this_week_minutes,
        prev_week_minutes=prev_week_minutes,
        change_percent=change_percent,
        this_week_videos=int(this_week.videos or 0),
        prev_week_videos=int(prev_week.videos or 0)
    )


@router.get("/daily/{date_str}")
async def get_daily_stats(
    date_str: str,
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Get stats for a specific date."""
    try:
        target_date = date.fromisoformat(date_str)
    except ValueError:
        return {"error": "Invalid date format. Use YYYY-MM-DD"}
    
    result = await db.execute(
        select(DailyStats).where(
            DailyStats.user_id == user.id,
            DailyStats.date == target_date
        )
    )
    stats = result.scalar_one_or_none()
    
    if not stats:
        return {"date": date_str, "data": None}
    
    return {
        "date": date_str,
        "data": DailyStatsResponse.model_validate(stats)
    }


@router.get("/channels")
async def get_top_channels(
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(7, ge=1, le=90)
):
    """Get top channels by watch time."""
    since = date.today() - timedelta(days=days)
    
    result = await db.execute(
        select(
            VideoSession.channel,
            func.count(VideoSession.id).label("video_count"),
            func.sum(VideoSession.watched_seconds).label("total_seconds")
        )
        .where(
            VideoSession.user_id == user.id,
            VideoSession.timestamp >= since,
            VideoSession.channel.isnot(None)
        )
        .group_by(VideoSession.channel)
        .order_by(func.sum(VideoSession.watched_seconds).desc())
        .limit(10)
    )
    
    channels = result.all()
    
    return {
        "channels": [
            {
                "channel": c.channel,
                "videoCount": c.video_count,
                "totalMinutes": round(c.total_seconds / 60, 1)
            }
            for c in channels
        ],
        "period": f"last_{days}_days"
    }
