from datetime import datetime, date
from sqlalchemy import String, Integer, Float, Boolean, DateTime, Date, ForeignKey, Text, Index, BigInteger
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
import uuid


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    settings: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    
    video_sessions: Mapped[list["VideoSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    browser_sessions: Mapped[list["BrowserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    daily_stats: Mapped[list["DailyStats"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    scroll_events: Mapped[list["ScrollEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    thumbnail_events: Mapped[list["ThumbnailEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    page_events: Mapped[list["PageEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    video_watch_events: Mapped[list["VideoWatchEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    recommendation_events: Mapped[list["RecommendationEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    intervention_events: Mapped[list["InterventionEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    mood_reports: Mapped[list["MoodReport"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class VideoSession(Base):
    """One row per video watched."""
    __tablename__ = "video_sessions"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    browser_session_id: Mapped[str | None] = mapped_column(String(64))
    
    # Video info
    video_id: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str | None] = mapped_column(Text)
    channel: Mapped[str | None] = mapped_column(String(255))
    channel_id: Mapped[str | None] = mapped_column(String(30))
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    watched_seconds: Mapped[int] = mapped_column(Integer, default=0)
    watched_percent: Mapped[int] = mapped_column(Integer, default=0)
    category: Mapped[str | None] = mapped_column(String(50))
    
    # Context
    source: Mapped[str | None] = mapped_column(String(30))
    source_position: Mapped[int | None] = mapped_column(Integer)
    is_short: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Playback
    playback_speed: Mapped[float] = mapped_column(Float, default=1.0)
    average_speed: Mapped[float | None] = mapped_column(Float)
    
    # Engagement metrics
    seek_count: Mapped[int] = mapped_column(Integer, default=0)
    pause_count: Mapped[int] = mapped_column(Integer, default=0)
    tab_switch_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # User feedback
    productivity_rating: Mapped[int | None] = mapped_column(Integer)
    rated_at: Mapped[datetime | None] = mapped_column(DateTime)
    intention: Mapped[str | None] = mapped_column(Text)
    matched_intention: Mapped[bool | None] = mapped_column(Boolean)
    
    # Outcome
    led_to_another_video: Mapped[bool | None] = mapped_column(Boolean)
    next_video_source: Mapped[str | None] = mapped_column(String(30))
    
    # Timestamps
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Extension session ID (for linking)
    ext_session_id: Mapped[str | None] = mapped_column(String(64))
    
    user: Mapped["User"] = relationship(back_populates="video_sessions")
    
    __table_args__ = (
        Index("idx_video_session_user_time", "user_id", "timestamp"),
        Index("idx_video_session_channel", "user_id", "channel_id"),
    )


class BrowserSession(Base):
    """One row per YouTube visit."""
    __tablename__ = "browser_sessions"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    ext_session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    
    # Entry
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    entry_page_type: Mapped[str | None] = mapped_column(String(20))
    entry_url: Mapped[str | None] = mapped_column(Text)
    entry_source: Mapped[str | None] = mapped_column(String(30))
    trigger_type: Mapped[str | None] = mapped_column(String(30))
    
    # Durations
    total_duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    active_duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    background_seconds: Mapped[int] = mapped_column(Integer, default=0)
    
    # Counts
    pages_visited: Mapped[int] = mapped_column(Integer, default=0)
    videos_watched: Mapped[int] = mapped_column(Integer, default=0)
    videos_started_not_finished: Mapped[int] = mapped_column(Integer, default=0)
    shorts_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Behavioral
    total_scroll_pixels: Mapped[int] = mapped_column(Integer, default=0)
    thumbnails_hovered: Mapped[int] = mapped_column(Integer, default=0)
    thumbnails_clicked: Mapped[int] = mapped_column(Integer, default=0)
    page_reloads: Mapped[int] = mapped_column(Integer, default=0)
    back_button_presses: Mapped[int] = mapped_column(Integer, default=0)
    recommendation_clicks: Mapped[int] = mapped_column(Integer, default=0)
    autoplay_count: Mapped[int] = mapped_column(Integer, default=0)
    autoplay_cancelled: Mapped[int] = mapped_column(Integer, default=0)
    search_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Time distribution
    time_on_home_seconds: Mapped[int] = mapped_column(Integer, default=0)
    time_on_watch_seconds: Mapped[int] = mapped_column(Integer, default=0)
    time_on_search_seconds: Mapped[int] = mapped_column(Integer, default=0)
    time_on_shorts_seconds: Mapped[int] = mapped_column(Integer, default=0)
    
    # Productivity
    productive_videos: Mapped[int] = mapped_column(Integer, default=0)
    unproductive_videos: Mapped[int] = mapped_column(Integer, default=0)
    neutral_videos: Mapped[int] = mapped_column(Integer, default=0)
    
    # Exit
    exit_type: Mapped[str | None] = mapped_column(String(20))
    
    # Search queries
    search_queries: Mapped[list | None] = mapped_column(JSONB)
    
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="browser_sessions")
    
    __table_args__ = (
        Index("idx_browser_session_user_time", "user_id", "started_at"),
    )


class DailyStats(Base):
    """Pre-computed daily aggregates."""
    __tablename__ = "daily_stats"
    
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    
    # Time
    total_seconds: Mapped[int] = mapped_column(Integer, default=0)
    active_seconds: Mapped[int] = mapped_column(Integer, default=0)
    background_seconds: Mapped[int] = mapped_column(Integer, default=0)
    
    # Sessions
    session_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_session_duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    first_check_time: Mapped[str | None] = mapped_column(String(5))  # HH:MM
    
    # Videos
    video_count: Mapped[int] = mapped_column(Integer, default=0)
    videos_completed: Mapped[int] = mapped_column(Integer, default=0)
    videos_abandoned: Mapped[int] = mapped_column(Integer, default=0)
    shorts_count: Mapped[int] = mapped_column(Integer, default=0)
    unique_channels: Mapped[int] = mapped_column(Integer, default=0)
    
    # Behavioral
    search_count: Mapped[int] = mapped_column(Integer, default=0)
    recommendation_clicks: Mapped[int] = mapped_column(Integer, default=0)
    autoplay_count: Mapped[int] = mapped_column(Integer, default=0)
    autoplay_cancelled: Mapped[int] = mapped_column(Integer, default=0)
    total_scroll_pixels: Mapped[int] = mapped_column(Integer, default=0)
    avg_scroll_velocity: Mapped[float] = mapped_column(Float, default=0.0)
    thumbnails_hovered: Mapped[int] = mapped_column(Integer, default=0)
    thumbnails_clicked: Mapped[int] = mapped_column(Integer, default=0)
    page_reloads: Mapped[int] = mapped_column(Integer, default=0)
    back_button_presses: Mapped[int] = mapped_column(Integer, default=0)
    tab_switches: Mapped[int] = mapped_column(Integer, default=0)
    
    # Productivity
    productive_videos: Mapped[int] = mapped_column(Integer, default=0)
    unproductive_videos: Mapped[int] = mapped_column(Integer, default=0)
    neutral_videos: Mapped[int] = mapped_column(Integer, default=0)
    prompts_shown: Mapped[int] = mapped_column(Integer, default=0)
    prompts_answered: Mapped[int] = mapped_column(Integer, default=0)
    
    # Interventions
    interventions_shown: Mapped[int] = mapped_column(Integer, default=0)
    interventions_effective: Mapped[int] = mapped_column(Integer, default=0)
    
    # Temporal
    hourly_seconds: Mapped[dict | None] = mapped_column(JSONB)
    top_channels: Mapped[list | None] = mapped_column(JSONB)
    
    # Patterns
    pre_sleep_minutes: Mapped[int] = mapped_column(Integer, default=0)
    binge_sessions: Mapped[int] = mapped_column(Integer, default=0)
    
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="daily_stats")


class ScrollEvent(Base):
    """Scroll behavior tracking."""
    __tablename__ = "scroll_events"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    
    page_type: Mapped[str | None] = mapped_column(String(20))
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    scroll_y: Mapped[int] = mapped_column(Integer)
    scroll_depth_percent: Mapped[int] = mapped_column(Integer)
    viewport_height: Mapped[int] = mapped_column(Integer)
    page_height: Mapped[int] = mapped_column(Integer)
    scroll_velocity: Mapped[float] = mapped_column(Float)
    scroll_direction: Mapped[str] = mapped_column(String(4))
    visible_video_count: Mapped[int] = mapped_column(Integer, default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="scroll_events")
    
    __table_args__ = (
        Index("idx_scroll_user_time", "user_id", "timestamp"),
    )


class ThumbnailEvent(Base):
    """Thumbnail hover/click behavior."""
    __tablename__ = "thumbnail_events"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    
    video_id: Mapped[str] = mapped_column(String(20))
    video_title: Mapped[str | None] = mapped_column(Text)
    channel_name: Mapped[str | None] = mapped_column(String(255))
    page_type: Mapped[str | None] = mapped_column(String(20))
    position_index: Mapped[int] = mapped_column(Integer)
    
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    hover_duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    preview_played: Mapped[bool] = mapped_column(Boolean, default=False)
    preview_watch_ms: Mapped[int] = mapped_column(Integer, default=0)
    clicked: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Clickbait indicators
    title_caps_percent: Mapped[int] = mapped_column(Integer, default=0)
    title_length: Mapped[int] = mapped_column(Integer, default=0)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="thumbnail_events")
    
    __table_args__ = (
        Index("idx_thumbnail_user_time", "user_id", "timestamp"),
    )


class PageEvent(Base):
    """Navigation and page-level events."""
    __tablename__ = "page_events"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    
    event_type: Mapped[str] = mapped_column(String(30))
    page_type: Mapped[str | None] = mapped_column(String(20))
    page_url: Mapped[str | None] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    
    from_page_type: Mapped[str | None] = mapped_column(String(20))
    navigation_method: Mapped[str | None] = mapped_column(String(20))
    search_query: Mapped[str | None] = mapped_column(Text)
    search_results_count: Mapped[int | None] = mapped_column(Integer)
    time_on_page_ms: Mapped[int | None] = mapped_column(Integer)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="page_events")
    
    __table_args__ = (
        Index("idx_page_user_time", "user_id", "timestamp"),
    )


class VideoWatchEvent(Base):
    """Granular video playback events."""
    __tablename__ = "video_watch_events"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    watch_session_id: Mapped[str] = mapped_column(String(64), index=True)
    
    video_id: Mapped[str] = mapped_column(String(20))
    event_type: Mapped[str] = mapped_column(String(20))
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    video_time_seconds: Mapped[float] = mapped_column(Float)
    
    # Seek data
    seek_from_seconds: Mapped[float | None] = mapped_column(Float)
    seek_to_seconds: Mapped[float | None] = mapped_column(Float)
    seek_delta_seconds: Mapped[float | None] = mapped_column(Float)
    
    # Speed change
    playback_speed: Mapped[float | None] = mapped_column(Float)
    
    # Abandonment
    watch_percent_at_abandon: Mapped[int | None] = mapped_column(Integer)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="video_watch_events")
    
    __table_args__ = (
        Index("idx_video_watch_user_time", "user_id", "timestamp"),
    )


class RecommendationEvent(Base):
    """Recommendation interactions."""
    __tablename__ = "recommendation_events"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    
    location: Mapped[str] = mapped_column(String(30))
    position_index: Mapped[int] = mapped_column(Integer)
    video_id: Mapped[str] = mapped_column(String(20))
    video_title: Mapped[str | None] = mapped_column(Text)
    channel_name: Mapped[str | None] = mapped_column(String(255))
    
    action: Mapped[str] = mapped_column(String(20))
    hover_duration_ms: Mapped[int | None] = mapped_column(Integer)
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    
    was_autoplay_next: Mapped[bool] = mapped_column(Boolean, default=False)
    autoplay_countdown_started: Mapped[bool] = mapped_column(Boolean, default=False)
    autoplay_cancelled: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="recommendation_events")
    
    __table_args__ = (
        Index("idx_rec_user_time", "user_id", "timestamp"),
    )


class InterventionEvent(Base):
    """Track intervention triggers and responses."""
    __tablename__ = "intervention_events"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    
    intervention_type: Mapped[str] = mapped_column(String(50))
    triggered_at: Mapped[datetime] = mapped_column(DateTime)
    trigger_reason: Mapped[str | None] = mapped_column(Text)
    
    response: Mapped[str | None] = mapped_column(String(30))
    response_at: Mapped[datetime | None] = mapped_column(DateTime)
    response_time_ms: Mapped[int | None] = mapped_column(Integer)
    
    user_left_youtube: Mapped[bool] = mapped_column(Boolean, default=False)
    minutes_until_return: Mapped[int | None] = mapped_column(Integer)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="intervention_events")
    
    __table_args__ = (
        Index("idx_intervention_user_time", "user_id", "triggered_at"),
    )


class MoodReport(Base):
    """Self-reported mood/intention."""
    __tablename__ = "mood_reports"
    
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[str] = mapped_column(String(64), index=True)
    
    timestamp: Mapped[datetime] = mapped_column(DateTime)
    report_type: Mapped[str] = mapped_column(String(10))  # 'pre' or 'post'
    mood: Mapped[int] = mapped_column(Integer)  # 1-5
    intention: Mapped[str | None] = mapped_column(Text)
    satisfaction: Mapped[int | None] = mapped_column(Integer)  # 1-5
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="mood_reports")
    
    __table_args__ = (
        Index("idx_mood_user_time", "user_id", "timestamp"),
    )
