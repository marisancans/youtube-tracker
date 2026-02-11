from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

# ===== Video Session =====


class VideoSessionCreate(BaseModel):
    id: str
    video_id: str = Field(..., alias="videoId")
    title: str | None = None
    channel: str | None = None
    duration_seconds: int = Field(0, alias="durationSeconds")
    watched_seconds: int = Field(0, alias="watchedSeconds")
    watched_percent: int = Field(0, alias="watchedPercent")
    source: str | None = None
    is_short: bool = Field(False, alias="isShort")
    playback_speed: float = Field(1.0, alias="playbackSpeed")
    productivity_rating: int | None = Field(None, alias="productivityRating")
    timestamp: int
    rated_at: int | None = Field(None, alias="ratedAt")

    class Config:
        populate_by_name = True


class VideoSessionResponse(BaseModel):
    id: UUID
    video_id: str
    title: str | None
    channel: str | None
    duration_seconds: int
    watched_seconds: int
    watched_percent: int
    source: str | None
    is_short: bool
    playback_speed: float
    productivity_rating: int | None
    timestamp: datetime

    class Config:
        from_attributes = True


# ===== Browser Session =====


class BrowserSessionCreate(BaseModel):
    id: str
    started_at: int = Field(..., alias="startedAt")
    ended_at: int | None = Field(None, alias="endedAt")
    active_seconds: int = Field(0, alias="activeSeconds")
    background_seconds: int = Field(0, alias="backgroundSeconds")
    duration_seconds: int = Field(0, alias="durationSeconds")
    video_count: int = Field(0)
    shorts_count: int = Field(0, alias="shortsCount")
    autoplay_count: int = Field(0, alias="autoplayCount")
    recommendation_clicks: int = Field(0, alias="recommendationClicks")
    search_count: int = Field(0, alias="searchCount")

    class Config:
        populate_by_name = True


# ===== Daily Stats =====


class DailyStatsCreate(BaseModel):
    date: str
    total_seconds: int = Field(0, alias="totalSeconds")
    active_seconds: int = Field(0, alias="activeSeconds")
    background_seconds: int = Field(0, alias="backgroundSeconds")
    video_count: int = Field(0, alias="videoCount")
    shorts_count: int = Field(0, alias="shortsCount")
    session_count: int = Field(0, alias="sessions")
    search_count: int = Field(0, alias="searchCount")
    recommendation_clicks: int = Field(0, alias="recommendationClicks")
    autoplay_count: int = Field(0, alias="autoplayCount")
    productive_videos: int = Field(0, alias="productiveVideos")
    unproductive_videos: int = Field(0, alias="unproductiveVideos")
    neutral_videos: int = Field(0, alias="neutralVideos")
    prompts_shown: int = Field(0, alias="promptsShown")
    prompts_answered: int = Field(0, alias="promptsAnswered")

    class Config:
        populate_by_name = True


class DailyStatsResponse(BaseModel):
    date: date
    total_seconds: int
    active_seconds: int
    background_seconds: int
    video_count: int
    shorts_count: int
    session_count: int
    search_count: int
    recommendation_clicks: int
    autoplay_count: int
    productive_videos: int
    unproductive_videos: int
    neutral_videos: int
    prompts_shown: int
    prompts_answered: int

    class Config:
        from_attributes = True


# ===== Sync Request/Response =====


class SyncRequest(BaseModel):
    sessions: list[VideoSessionCreate] = []
    browser_sessions: list[BrowserSessionCreate] = Field([], alias="browserSessions")
    daily_stats: dict[str, DailyStatsCreate] = Field({}, alias="dailyStats")

    class Config:
        populate_by_name = True


class SyncResponse(BaseModel):
    success: bool
    synced_sessions: int
    synced_browser_sessions: int
    synced_daily_stats: int
    last_sync_time: int


# ===== Stats Response =====


class StatsOverview(BaseModel):
    today: DailyStatsResponse | None = None
    last7days: list[DailyStatsResponse] = []
    total_videos: int = 0
    total_hours: float = 0
    avg_daily_minutes: float = 0


class WeeklyComparison(BaseModel):
    this_week_minutes: int
    prev_week_minutes: int
    change_percent: float
    this_week_videos: int
    prev_week_videos: int


# ===== Productive URLs =====


class ProductiveUrlCreate(BaseModel):
    id: str
    url: str
    title: str
    added_at: int = Field(..., alias="addedAt")

    class Config:
        populate_by_name = True


class ProductiveUrlResponse(BaseModel):
    id: str
    url: str
    title: str
    added_at: datetime
    times_suggested: int = 0
    times_clicked: int = 0

    class Config:
        from_attributes = True
