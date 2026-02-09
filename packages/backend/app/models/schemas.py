from pydantic import BaseModel, Field
from datetime import datetime, date
from typing import Optional
from uuid import UUID


# ===== Video Session =====

class VideoSessionCreate(BaseModel):
    id: str
    video_id: str = Field(..., alias="videoId")
    title: Optional[str] = None
    channel: Optional[str] = None
    duration_seconds: int = Field(0, alias="durationSeconds")
    watched_seconds: int = Field(0, alias="watchedSeconds")
    watched_percent: int = Field(0, alias="watchedPercent")
    source: Optional[str] = None
    is_short: bool = Field(False, alias="isShort")
    playback_speed: float = Field(1.0, alias="playbackSpeed")
    productivity_rating: Optional[int] = Field(None, alias="productivityRating")
    timestamp: int
    rated_at: Optional[int] = Field(None, alias="ratedAt")
    
    class Config:
        populate_by_name = True


class VideoSessionResponse(BaseModel):
    id: UUID
    video_id: str
    title: Optional[str]
    channel: Optional[str]
    duration_seconds: int
    watched_seconds: int
    watched_percent: int
    source: Optional[str]
    is_short: bool
    playback_speed: float
    productivity_rating: Optional[int]
    timestamp: datetime
    
    class Config:
        from_attributes = True


# ===== Browser Session =====

class BrowserSessionCreate(BaseModel):
    id: str
    started_at: int = Field(..., alias="startedAt")
    ended_at: Optional[int] = Field(None, alias="endedAt")
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
    today: Optional[DailyStatsResponse] = None
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
