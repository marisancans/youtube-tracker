import time
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, validate_sync_payload
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
limiter = Limiter(key_func=get_remote_address)
router = APIRouter()


# ===== Pydantic Schemas =====


class VideoSessionCreate(BaseModel):
    id: str = Field(..., max_length=64)
    videoId: str = Field(..., max_length=20)
    title: str | None = Field(None, max_length=500)
    channel: str | None = Field(None, max_length=255)
    channelId: str | None = Field(None, max_length=30)
    durationSeconds: int = Field(0, ge=0, le=86400)  # Max 24h
    watchedSeconds: int = Field(0, ge=0, le=86400)
    watchedPercent: int = 0
    source: str | None = None
    sourcePosition: int | None = None
    isShort: bool = False
    playbackSpeed: float = 1.0
    averageSpeed: float | None = None
    category: str | None = None
    productivityRating: int | None = None
    timestamp: int
    startedAt: int
    endedAt: int | None = None
    ratedAt: int | None = None
    seekCount: int = 0
    pauseCount: int = 0
    tabSwitchCount: int = 0
    ledToAnotherVideo: bool | None = None
    nextVideoSource: str | None = None
    intention: str | None = None
    matchedIntention: bool | None = None


class BrowserSessionCreate(BaseModel):
    id: str
    startedAt: int
    endedAt: int | None = None
    entryPageType: str | None = None
    entryUrl: str | None = None
    entrySource: str | None = None
    triggerType: str | None = None
    totalDurationSeconds: int = 0
    activeDurationSeconds: int = 0
    backgroundSeconds: int = 0
    pagesVisited: int = 0
    videosWatched: int = 0
    videosStartedNotFinished: int = 0
    shortsCount: int = 0
    totalScrollPixels: int = 0
    thumbnailsHovered: int = 0
    thumbnailsClicked: int = 0
    pageReloads: int = 0
    backButtonPresses: int = 0
    recommendationClicks: int = 0
    autoplayCount: int = 0
    autoplayCancelled: int = 0
    searchCount: int = 0
    timeOnHomeSeconds: int = 0
    timeOnWatchSeconds: int = 0
    timeOnSearchSeconds: int = 0
    timeOnShortsSeconds: int = 0
    productiveVideos: int = 0
    unproductiveVideos: int = 0
    neutralVideos: int = 0
    exitType: str | None = None
    searchQueries: list[str] = []


class DailyStatsCreate(BaseModel):
    date: str
    totalSeconds: int = 0
    activeSeconds: int = 0
    backgroundSeconds: int = 0
    sessionCount: int = 0
    avgSessionDurationSeconds: int = 0
    firstCheckTime: str | None = None
    videoCount: int = 0
    videosCompleted: int = 0
    videosAbandoned: int = 0
    shortsCount: int = 0
    uniqueChannels: int = 0
    searchCount: int = 0
    recommendationClicks: int = 0
    autoplayCount: int = 0
    autoplayCancelled: int = 0
    totalScrollPixels: int = 0
    avgScrollVelocity: float = 0.0
    thumbnailsHovered: int = 0
    thumbnailsClicked: int = 0
    pageReloads: int = 0
    backButtonPresses: int = 0
    tabSwitches: int = 0
    productiveVideos: int = 0
    unproductiveVideos: int = 0
    neutralVideos: int = 0
    promptsShown: int = 0
    promptsAnswered: int = 0
    interventionsShown: int = 0
    interventionsEffective: int = 0
    hourlySeconds: dict | None = None
    topChannels: list | None = None
    preSleepMinutes: int = 0
    bingeSessions: int = 0


class ScrollEventCreate(BaseModel):
    type: str = "scroll"
    sessionId: str
    pageType: str | None = None
    timestamp: int
    scrollY: int
    scrollDepthPercent: int
    viewportHeight: int
    pageHeight: int
    scrollVelocity: float
    scrollDirection: str
    visibleVideoCount: int = 0


class ThumbnailEventCreate(BaseModel):
    type: str = "thumbnail"
    sessionId: str
    videoId: str
    videoTitle: str | None = None
    channelName: str | None = None
    pageType: str | None = None
    positionIndex: int
    timestamp: int
    hoverDurationMs: int = 0
    previewPlayed: bool = False
    previewWatchMs: int = 0
    clicked: bool = False
    titleCapsPercent: int = 0
    titleLength: int = 0


class PageEventCreate(BaseModel):
    type: str = "page"
    sessionId: str
    eventType: str
    pageType: str | None = None
    pageUrl: str | None = None
    timestamp: int
    fromPageType: str | None = None
    navigationMethod: str | None = None
    searchQuery: str | None = None
    searchResultsCount: int | None = None
    timeOnPageMs: int | None = None


class VideoWatchEventCreate(BaseModel):
    type: str = "video_watch"
    sessionId: str
    watchSessionId: str
    videoId: str
    eventType: str
    timestamp: int
    videoTimeSeconds: float
    seekFromSeconds: float | None = None
    seekToSeconds: float | None = None
    seekDeltaSeconds: float | None = None
    playbackSpeed: float | None = None
    watchPercentAtAbandon: int | None = None


class RecommendationEventCreate(BaseModel):
    type: str = "recommendation"
    sessionId: str
    location: str
    positionIndex: int
    videoId: str
    videoTitle: str | None = None
    channelName: str | None = None
    action: str
    hoverDurationMs: int | None = None
    timestamp: int
    wasAutoplayNext: bool = False
    autoplayCountdownStarted: bool = False
    autoplayCancelled: bool = False


class InterventionEventCreate(BaseModel):
    type: str = "intervention"
    sessionId: str
    interventionType: str
    triggeredAt: int
    triggerReason: str | None = None
    response: str | None = None
    responseAt: int | None = None
    responseTimeMs: int | None = None
    userLeftYoutube: bool = False
    minutesUntilReturn: int | None = None


class MoodReportCreate(BaseModel):
    timestamp: int
    sessionId: str
    reportType: str
    mood: int
    intention: str | None = None
    satisfaction: int | None = None


class ProductiveUrlCreate(BaseModel):
    id: str = Field(..., max_length=64)
    url: str = Field(..., max_length=2000)
    title: str = Field(..., max_length=255)
    addedAt: int = Field(..., ge=0)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        if not v.startswith(("http://", "https://")):
            raise ValueError("URL must start with http:// or https://")
        return v


class SyncData(BaseModel):
    videoSessions: list[VideoSessionCreate] = []
    browserSessions: list[BrowserSessionCreate] = []
    dailyStats: dict[str, DailyStatsCreate] = {}
    scrollEvents: list[ScrollEventCreate] = []
    thumbnailEvents: list[ThumbnailEventCreate] = []
    pageEvents: list[PageEventCreate] = []
    videoWatchEvents: list[VideoWatchEventCreate] = []
    recommendationEvents: list[RecommendationEventCreate] = []
    interventionEvents: list[InterventionEventCreate] = []
    moodReports: list[MoodReportCreate] = []
    productiveUrls: list[ProductiveUrlCreate] = []


class SyncRequest(BaseModel):
    userId: str
    lastSyncTime: int = 0
    data: SyncData


class SyncResponse(BaseModel):
    success: bool
    syncedCounts: dict[str, int]
    lastSyncTime: int
    errors: list[str] = []


# ===== Main Sync Endpoint =====


@router.post("", response_model=SyncResponse)
@limiter.limit(settings.rate_limit_sync)
async def sync_all(
    request: Request, body: SyncRequest, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """
    Single endpoint to sync all event types at once.
    Processes all data in a single atomic transaction.

    Security:
    - Requires Google OAuth Bearer token (or X-User-Id in dev mode)
    - Rate limited to 20 requests/minute per user
    - Payload size validated
    """

    # Validate payload sizes
    validate_sync_payload(body.data.model_dump())

    counts = {
        "videoSessions": 0,
        "browserSessions": 0,
        "dailyStats": 0,
        "scrollEvents": 0,
        "thumbnailEvents": 0,
        "pageEvents": 0,
        "videoWatchEvents": 0,
        "recommendationEvents": 0,
        "interventionEvents": 0,
        "moodReports": 0,
        "productiveUrls": 0,
    }
    errors: list[str] = []
    data = body.data

    try:
        # === Video Sessions ===
        for session_data in data.videoSessions:
            existing = await db.execute(
                select(VideoSession).where(
                    VideoSession.user_id == user.id, VideoSession.ext_session_id == session_data.id
                )
            )
            if existing.scalar_one_or_none():
                continue

            session = VideoSession(
                user_id=user.id,
                ext_session_id=session_data.id,
                video_id=session_data.videoId,
                title=session_data.title,
                channel=session_data.channel,
                channel_id=session_data.channelId,
                duration_seconds=session_data.durationSeconds,
                watched_seconds=session_data.watchedSeconds,
                watched_percent=session_data.watchedPercent,
                category=session_data.category,
                source=session_data.source,
                source_position=session_data.sourcePosition,
                is_short=session_data.isShort,
                playback_speed=session_data.playbackSpeed,
                average_speed=session_data.averageSpeed,
                seek_count=session_data.seekCount,
                pause_count=session_data.pauseCount,
                tab_switch_count=session_data.tabSwitchCount,
                productivity_rating=session_data.productivityRating,
                rated_at=datetime.fromtimestamp(session_data.ratedAt / 1000) if session_data.ratedAt else None,
                intention=session_data.intention,
                matched_intention=session_data.matchedIntention,
                led_to_another_video=session_data.ledToAnotherVideo,
                next_video_source=session_data.nextVideoSource,
                started_at=datetime.fromtimestamp(session_data.startedAt / 1000),
                ended_at=datetime.fromtimestamp(session_data.endedAt / 1000) if session_data.endedAt else None,
                timestamp=datetime.fromtimestamp(session_data.timestamp / 1000),
            )
            db.add(session)
            counts["videoSessions"] += 1

        # === Browser Sessions ===
        for bs_data in data.browserSessions:
            existing = await db.execute(select(BrowserSession).where(BrowserSession.ext_session_id == bs_data.id))
            if existing.scalar_one_or_none():
                continue

            browser_session = BrowserSession(
                user_id=user.id,
                ext_session_id=bs_data.id,
                started_at=datetime.fromtimestamp(bs_data.startedAt / 1000),
                ended_at=datetime.fromtimestamp(bs_data.endedAt / 1000) if bs_data.endedAt else None,
                entry_page_type=bs_data.entryPageType,
                entry_url=bs_data.entryUrl,
                entry_source=bs_data.entrySource,
                trigger_type=bs_data.triggerType,
                total_duration_seconds=bs_data.totalDurationSeconds,
                active_duration_seconds=bs_data.activeDurationSeconds,
                background_seconds=bs_data.backgroundSeconds,
                pages_visited=bs_data.pagesVisited,
                videos_watched=bs_data.videosWatched,
                videos_started_not_finished=bs_data.videosStartedNotFinished,
                shorts_count=bs_data.shortsCount,
                total_scroll_pixels=bs_data.totalScrollPixels,
                thumbnails_hovered=bs_data.thumbnailsHovered,
                thumbnails_clicked=bs_data.thumbnailsClicked,
                page_reloads=bs_data.pageReloads,
                back_button_presses=bs_data.backButtonPresses,
                recommendation_clicks=bs_data.recommendationClicks,
                autoplay_count=bs_data.autoplayCount,
                autoplay_cancelled=bs_data.autoplayCancelled,
                search_count=bs_data.searchCount,
                time_on_home_seconds=bs_data.timeOnHomeSeconds,
                time_on_watch_seconds=bs_data.timeOnWatchSeconds,
                time_on_search_seconds=bs_data.timeOnSearchSeconds,
                time_on_shorts_seconds=bs_data.timeOnShortsSeconds,
                productive_videos=bs_data.productiveVideos,
                unproductive_videos=bs_data.unproductiveVideos,
                neutral_videos=bs_data.neutralVideos,
                exit_type=bs_data.exitType,
                search_queries=bs_data.searchQueries,
            )
            db.add(browser_session)
            counts["browserSessions"] += 1

        # === Daily Stats (Upsert) ===
        for date_str, stats_data in data.dailyStats.items():
            try:
                stats_date = date.fromisoformat(date_str)
            except ValueError:
                errors.append(f"Invalid date format: {date_str}")
                continue

            stmt = insert(DailyStats).values(
                user_id=user.id,
                date=stats_date,
                total_seconds=stats_data.totalSeconds,
                active_seconds=stats_data.activeSeconds,
                background_seconds=stats_data.backgroundSeconds,
                session_count=stats_data.sessionCount,
                avg_session_duration_seconds=stats_data.avgSessionDurationSeconds,
                first_check_time=stats_data.firstCheckTime,
                video_count=stats_data.videoCount,
                videos_completed=stats_data.videosCompleted,
                videos_abandoned=stats_data.videosAbandoned,
                shorts_count=stats_data.shortsCount,
                unique_channels=stats_data.uniqueChannels,
                search_count=stats_data.searchCount,
                recommendation_clicks=stats_data.recommendationClicks,
                autoplay_count=stats_data.autoplayCount,
                autoplay_cancelled=stats_data.autoplayCancelled,
                total_scroll_pixels=stats_data.totalScrollPixels,
                avg_scroll_velocity=stats_data.avgScrollVelocity,
                thumbnails_hovered=stats_data.thumbnailsHovered,
                thumbnails_clicked=stats_data.thumbnailsClicked,
                page_reloads=stats_data.pageReloads,
                back_button_presses=stats_data.backButtonPresses,
                tab_switches=stats_data.tabSwitches,
                productive_videos=stats_data.productiveVideos,
                unproductive_videos=stats_data.unproductiveVideos,
                neutral_videos=stats_data.neutralVideos,
                prompts_shown=stats_data.promptsShown,
                prompts_answered=stats_data.promptsAnswered,
                interventions_shown=stats_data.interventionsShown,
                interventions_effective=stats_data.interventionsEffective,
                hourly_seconds=stats_data.hourlySeconds,
                top_channels=stats_data.topChannels,
                pre_sleep_minutes=stats_data.preSleepMinutes,
                binge_sessions=stats_data.bingeSessions,
            )

            stmt = stmt.on_conflict_do_update(
                index_elements=["user_id", "date"],
                set_={
                    "total_seconds": stmt.excluded.total_seconds,
                    "active_seconds": stmt.excluded.active_seconds,
                    "background_seconds": stmt.excluded.background_seconds,
                    "session_count": stmt.excluded.session_count,
                    "avg_session_duration_seconds": stmt.excluded.avg_session_duration_seconds,
                    "first_check_time": stmt.excluded.first_check_time,
                    "video_count": stmt.excluded.video_count,
                    "videos_completed": stmt.excluded.videos_completed,
                    "videos_abandoned": stmt.excluded.videos_abandoned,
                    "shorts_count": stmt.excluded.shorts_count,
                    "unique_channels": stmt.excluded.unique_channels,
                    "search_count": stmt.excluded.search_count,
                    "recommendation_clicks": stmt.excluded.recommendation_clicks,
                    "autoplay_count": stmt.excluded.autoplay_count,
                    "autoplay_cancelled": stmt.excluded.autoplay_cancelled,
                    "total_scroll_pixels": stmt.excluded.total_scroll_pixels,
                    "avg_scroll_velocity": stmt.excluded.avg_scroll_velocity,
                    "thumbnails_hovered": stmt.excluded.thumbnails_hovered,
                    "thumbnails_clicked": stmt.excluded.thumbnails_clicked,
                    "page_reloads": stmt.excluded.page_reloads,
                    "back_button_presses": stmt.excluded.back_button_presses,
                    "tab_switches": stmt.excluded.tab_switches,
                    "productive_videos": stmt.excluded.productive_videos,
                    "unproductive_videos": stmt.excluded.unproductive_videos,
                    "neutral_videos": stmt.excluded.neutral_videos,
                    "prompts_shown": stmt.excluded.prompts_shown,
                    "prompts_answered": stmt.excluded.prompts_answered,
                    "interventions_shown": stmt.excluded.interventions_shown,
                    "interventions_effective": stmt.excluded.interventions_effective,
                    "hourly_seconds": stmt.excluded.hourly_seconds,
                    "top_channels": stmt.excluded.top_channels,
                    "pre_sleep_minutes": stmt.excluded.pre_sleep_minutes,
                    "binge_sessions": stmt.excluded.binge_sessions,
                    "updated_at": datetime.utcnow(),
                },
            )
            await db.execute(stmt)
            counts["dailyStats"] += 1

        # === Scroll Events ===
        for event in data.scrollEvents:
            scroll = ScrollEvent(
                user_id=user.id,
                session_id=event.sessionId,
                page_type=event.pageType,
                timestamp=datetime.fromtimestamp(event.timestamp / 1000),
                scroll_y=event.scrollY,
                scroll_depth_percent=event.scrollDepthPercent,
                viewport_height=event.viewportHeight,
                page_height=event.pageHeight,
                scroll_velocity=event.scrollVelocity,
                scroll_direction=event.scrollDirection,
                visible_video_count=event.visibleVideoCount,
            )
            db.add(scroll)
            counts["scrollEvents"] += 1

        # === Thumbnail Events ===
        for event in data.thumbnailEvents:
            thumbnail = ThumbnailEvent(
                user_id=user.id,
                session_id=event.sessionId,
                video_id=event.videoId,
                video_title=event.videoTitle,
                channel_name=event.channelName,
                page_type=event.pageType,
                position_index=event.positionIndex,
                timestamp=datetime.fromtimestamp(event.timestamp / 1000),
                hover_duration_ms=event.hoverDurationMs,
                preview_played=event.previewPlayed,
                preview_watch_ms=event.previewWatchMs,
                clicked=event.clicked,
                title_caps_percent=event.titleCapsPercent,
                title_length=event.titleLength,
            )
            db.add(thumbnail)
            counts["thumbnailEvents"] += 1

        # === Page Events ===
        for event in data.pageEvents:
            page = PageEvent(
                user_id=user.id,
                session_id=event.sessionId,
                event_type=event.eventType,
                page_type=event.pageType,
                page_url=event.pageUrl,
                timestamp=datetime.fromtimestamp(event.timestamp / 1000),
                from_page_type=event.fromPageType,
                navigation_method=event.navigationMethod,
                search_query=event.searchQuery,
                search_results_count=event.searchResultsCount,
                time_on_page_ms=event.timeOnPageMs,
            )
            db.add(page)
            counts["pageEvents"] += 1

        # === Video Watch Events ===
        for event in data.videoWatchEvents:
            watch = VideoWatchEvent(
                user_id=user.id,
                session_id=event.sessionId,
                watch_session_id=event.watchSessionId,
                video_id=event.videoId,
                event_type=event.eventType,
                timestamp=datetime.fromtimestamp(event.timestamp / 1000),
                video_time_seconds=event.videoTimeSeconds,
                seek_from_seconds=event.seekFromSeconds,
                seek_to_seconds=event.seekToSeconds,
                seek_delta_seconds=event.seekDeltaSeconds,
                playback_speed=event.playbackSpeed,
                watch_percent_at_abandon=event.watchPercentAtAbandon,
            )
            db.add(watch)
            counts["videoWatchEvents"] += 1

        # === Recommendation Events ===
        for event in data.recommendationEvents:
            rec = RecommendationEvent(
                user_id=user.id,
                session_id=event.sessionId,
                location=event.location,
                position_index=event.positionIndex,
                video_id=event.videoId,
                video_title=event.videoTitle,
                channel_name=event.channelName,
                action=event.action,
                hover_duration_ms=event.hoverDurationMs,
                timestamp=datetime.fromtimestamp(event.timestamp / 1000),
                was_autoplay_next=event.wasAutoplayNext,
                autoplay_countdown_started=event.autoplayCountdownStarted,
                autoplay_cancelled=event.autoplayCancelled,
            )
            db.add(rec)
            counts["recommendationEvents"] += 1

        # === Intervention Events ===
        for event in data.interventionEvents:
            intervention = InterventionEvent(
                user_id=user.id,
                session_id=event.sessionId,
                intervention_type=event.interventionType,
                triggered_at=datetime.fromtimestamp(event.triggeredAt / 1000),
                trigger_reason=event.triggerReason,
                response=event.response,
                response_at=datetime.fromtimestamp(event.responseAt / 1000) if event.responseAt else None,
                response_time_ms=event.responseTimeMs,
                user_left_youtube=event.userLeftYoutube,
                minutes_until_return=event.minutesUntilReturn,
            )
            db.add(intervention)
            counts["interventionEvents"] += 1

        # === Mood Reports ===
        for report in data.moodReports:
            mood = MoodReport(
                user_id=user.id,
                session_id=report.sessionId,
                timestamp=datetime.fromtimestamp(report.timestamp / 1000),
                report_type=report.reportType,
                mood=report.mood,
                intention=report.intention,
                satisfaction=report.satisfaction,
            )
            db.add(mood)
            counts["moodReports"] += 1

        # === Productive URLs (Upsert with soft delete handling) ===
        for url_data in data.productiveUrls:
            # Check if exists (including soft deleted) — use first() since duplicates may exist
            existing = await db.execute(
                select(ProductiveUrl)
                .where(ProductiveUrl.user_id == user.id, ProductiveUrl.ext_id == url_data.id)
                .order_by(ProductiveUrl.deleted_at.is_(None).desc())
                .limit(1)
            )
            existing_url = existing.scalar_one_or_none()

            if existing_url:
                # Restore if soft deleted, update fields
                existing_url.url = url_data.url
                existing_url.title = url_data.title
                existing_url.deleted_at = None
            else:
                productive_url = ProductiveUrl(
                    user_id=user.id,
                    ext_id=url_data.id,
                    url=url_data.url,
                    title=url_data.title,
                    added_at=datetime.fromtimestamp(url_data.addedAt / 1000),
                )
                db.add(productive_url)
            counts["productiveUrls"] += 1

        # Commit all changes atomically
        await db.commit()

        return SyncResponse(success=True, syncedCounts=counts, lastSyncTime=int(time.time() * 1000), errors=errors)

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}") from e


# ===== Query Endpoints =====


@router.get("/videos")
@limiter.limit(settings.rate_limit)
async def get_synced_videos(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(100, le=500),  # Max 500 per request
    offset: int = Query(0, ge=0),
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
                "id": s.ext_session_id,  # Return extension's original ID
                "dbId": str(s.id),
                "videoId": s.video_id,
                "title": s.title,
                "channel": s.channel,
                "channelId": s.channel_id,
                "durationSeconds": s.duration_seconds,
                "watchedSeconds": s.watched_seconds,
                "watchedPercent": s.watched_percent,
                "category": s.category,
                "source": s.source,
                "isShort": s.is_short,
                "playbackSpeed": s.playback_speed,
                "seekCount": s.seek_count,
                "pauseCount": s.pause_count,
                "productivityRating": s.productivity_rating,
                "timestamp": int(s.timestamp.timestamp() * 1000),
            }
            for s in sessions
        ],
        "total": len(sessions),
        "limit": limit,
        "offset": offset,
    }


@router.get("/stats/{date_str}")
@limiter.limit(settings.rate_limit)
async def get_daily_stats(
    request: Request, date_str: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    """Get daily stats for a specific date."""
    try:
        stats_date = date.fromisoformat(date_str)
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD") from e

    result = await db.execute(select(DailyStats).where(DailyStats.user_id == user.id, DailyStats.date == stats_date))
    stats = result.scalar_one_or_none()

    if not stats:
        return {"date": date_str, "found": False}

    return {
        "date": date_str,
        "found": True,
        "totalSeconds": stats.total_seconds,
        "activeSeconds": stats.active_seconds,
        "sessionCount": stats.session_count,
        "videoCount": stats.video_count,
        "shortsCount": stats.shorts_count,
        "productiveVideos": stats.productive_videos,
        "unproductiveVideos": stats.unproductive_videos,
        "hourlySeconds": stats.hourly_seconds,
        "topChannels": stats.top_channels,
    }


# ===== Data Check & Restore Endpoints =====


# All child tables with user_id FK
_CHILD_TABLES = [
    VideoSession,
    BrowserSession,
    DailyStats,
    ScrollEvent,
    ThumbnailEvent,
    PageEvent,
    VideoWatchEvent,
    RecommendationEvent,
    InterventionEvent,
    MoodReport,
    ProductiveUrl,
]


@router.get("/check")
@limiter.limit(settings.rate_limit)
async def check_existing_data(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Check if the current user already has data on the server.
    Used after sign-in to detect reinstalls and offer data restore.

    Auth: X-User-Id header (Google ID) — user is auto-created by get_current_user if new.
    """
    counts: dict[str, int] = {}
    total = 0
    for model in _CHILD_TABLES:
        result = await db.execute(select(func.count()).where(model.user_id == user.id))
        count = result.scalar() or 0
        counts[model.__tablename__] = count
        total += count

    return {
        "hasData": total > 0,
        "counts": counts,
    }


@router.get("/restore")
@limiter.limit(settings.rate_limit)
async def restore_data(
    request: Request,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Return the current user's recent data in extension-compatible format.
    Used after linking to restore data from a previous install.
    """
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)

    # Video sessions (last 500)
    vs_result = await db.execute(
        select(VideoSession)
        .where(VideoSession.user_id == user.id, VideoSession.timestamp >= thirty_days_ago)
        .order_by(VideoSession.timestamp.desc())
        .limit(500)
    )
    video_sessions = vs_result.scalars().all()

    # Browser sessions (last 100)
    bs_result = await db.execute(
        select(BrowserSession)
        .where(BrowserSession.user_id == user.id, BrowserSession.started_at >= thirty_days_ago)
        .order_by(BrowserSession.started_at.desc())
        .limit(100)
    )
    browser_sessions = bs_result.scalars().all()

    # Daily stats (last 30 days)
    ds_result = await db.execute(
        select(DailyStats)
        .where(DailyStats.user_id == user.id, DailyStats.date >= thirty_days_ago.date())
        .order_by(DailyStats.date.desc())
    )
    daily_stats = ds_result.scalars().all()

    # Format video sessions
    formatted_videos = [
        {
            "id": s.ext_session_id or str(s.id),
            "videoId": s.video_id,
            "title": s.title,
            "channel": s.channel,
            "channelId": s.channel_id,
            "durationSeconds": s.duration_seconds,
            "watchedSeconds": s.watched_seconds,
            "watchedPercent": s.watched_percent,
            "category": s.category,
            "source": s.source,
            "sourcePosition": s.source_position,
            "isShort": s.is_short,
            "playbackSpeed": s.playback_speed,
            "averageSpeed": s.average_speed,
            "seekCount": s.seek_count,
            "pauseCount": s.pause_count,
            "tabSwitchCount": s.tab_switch_count,
            "productivityRating": s.productivity_rating,
            "ratedAt": int(s.rated_at.timestamp() * 1000) if s.rated_at else None,
            "intention": s.intention,
            "matchedIntention": s.matched_intention,
            "ledToAnotherVideo": s.led_to_another_video,
            "nextVideoSource": s.next_video_source,
            "timestamp": int(s.timestamp.timestamp() * 1000),
            "startedAt": int(s.started_at.timestamp() * 1000),
            "endedAt": int(s.ended_at.timestamp() * 1000) if s.ended_at else None,
        }
        for s in video_sessions
    ]

    # Format browser sessions
    formatted_browser = [
        {
            "id": s.ext_session_id,
            "startedAt": int(s.started_at.timestamp() * 1000),
            "endedAt": int(s.ended_at.timestamp() * 1000) if s.ended_at else None,
            "entryPageType": s.entry_page_type,
            "entryUrl": s.entry_url,
            "entrySource": s.entry_source,
            "triggerType": s.trigger_type,
            "totalDurationSeconds": s.total_duration_seconds,
            "activeDurationSeconds": s.active_duration_seconds,
            "backgroundSeconds": s.background_seconds,
            "pagesVisited": s.pages_visited,
            "videosWatched": s.videos_watched,
            "videosStartedNotFinished": s.videos_started_not_finished,
            "shortsCount": s.shorts_count,
            "totalScrollPixels": s.total_scroll_pixels,
            "thumbnailsHovered": s.thumbnails_hovered,
            "thumbnailsClicked": s.thumbnails_clicked,
            "pageReloads": s.page_reloads,
            "backButtonPresses": s.back_button_presses,
            "recommendationClicks": s.recommendation_clicks,
            "autoplayCount": s.autoplay_count,
            "autoplayCancelled": s.autoplay_cancelled,
            "searchCount": s.search_count,
            "timeOnHomeSeconds": s.time_on_home_seconds,
            "timeOnWatchSeconds": s.time_on_watch_seconds,
            "timeOnSearchSeconds": s.time_on_search_seconds,
            "timeOnShortsSeconds": s.time_on_shorts_seconds,
            "productiveVideos": s.productive_videos,
            "unproductiveVideos": s.unproductive_videos,
            "neutralVideos": s.neutral_videos,
            "exitType": s.exit_type,
            "searchQueries": s.search_queries or [],
        }
        for s in browser_sessions
    ]

    # Format daily stats keyed by ISO date
    formatted_daily: dict[str, dict] = {}
    for ds in daily_stats:
        formatted_daily[ds.date.isoformat()] = {
            "date": ds.date.isoformat(),
            "totalSeconds": ds.total_seconds,
            "activeSeconds": ds.active_seconds,
            "backgroundSeconds": ds.background_seconds,
            "sessionCount": ds.session_count,
            "avgSessionDurationSeconds": ds.avg_session_duration_seconds,
            "firstCheckTime": ds.first_check_time,
            "videoCount": ds.video_count,
            "videosCompleted": ds.videos_completed,
            "videosAbandoned": ds.videos_abandoned,
            "shortsCount": ds.shorts_count,
            "uniqueChannels": ds.unique_channels,
            "searchCount": ds.search_count,
            "recommendationClicks": ds.recommendation_clicks,
            "autoplayCount": ds.autoplay_count,
            "autoplayCancelled": ds.autoplay_cancelled,
            "totalScrollPixels": ds.total_scroll_pixels,
            "avgScrollVelocity": ds.avg_scroll_velocity,
            "thumbnailsHovered": ds.thumbnails_hovered,
            "thumbnailsClicked": ds.thumbnails_clicked,
            "pageReloads": ds.page_reloads,
            "backButtonPresses": ds.back_button_presses,
            "tabSwitches": ds.tab_switches,
            "productiveVideos": ds.productive_videos,
            "unproductiveVideos": ds.unproductive_videos,
            "neutralVideos": ds.neutral_videos,
            "promptsShown": ds.prompts_shown,
            "promptsAnswered": ds.prompts_answered,
            "interventionsShown": ds.interventions_shown,
            "interventionsEffective": ds.interventions_effective,
            "hourlySeconds": ds.hourly_seconds,
            "topChannels": ds.top_channels,
            "preSleepMinutes": ds.pre_sleep_minutes,
            "bingeSessions": ds.binge_sessions,
        }

    return {
        "success": True,
        "data": {
            "videoSessions": formatted_videos,
            "browserSessions": formatted_browser,
            "dailyStats": formatted_daily,
        },
        "counts": {
            "videoSessions": len(formatted_videos),
            "browserSessions": len(formatted_browser),
            "dailyStats": len(formatted_daily),
        },
    }
