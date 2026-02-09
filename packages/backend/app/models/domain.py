from datetime import datetime, date
from sqlalchemy import String, Integer, Float, Boolean, DateTime, Date, ForeignKey, Text, Index
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, JSONB
import uuid


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    device_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    video_sessions: Mapped[list["VideoSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    browser_sessions: Mapped[list["BrowserSession"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    daily_stats: Mapped[list["DailyStats"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class VideoSession(Base):
    __tablename__ = "video_sessions"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    
    # Video info
    video_id: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str | None] = mapped_column(Text)
    channel: Mapped[str | None] = mapped_column(String(255))
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    watched_seconds: Mapped[int] = mapped_column(Integer, default=0)
    watched_percent: Mapped[int] = mapped_column(Integer, default=0)
    
    # Context
    source: Mapped[str | None] = mapped_column(String(30))
    is_short: Mapped[bool] = mapped_column(Boolean, default=False)
    playback_speed: Mapped[float] = mapped_column(Float, default=1.0)
    
    # User feedback
    productivity_rating: Mapped[int | None] = mapped_column(Integer)
    rated_at: Mapped[datetime | None] = mapped_column(DateTime)
    
    # Timestamps
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    # Extension session ID (for linking)
    ext_session_id: Mapped[str | None] = mapped_column(String(64))
    
    user: Mapped["User"] = relationship(back_populates="video_sessions")
    
    __table_args__ = (
        Index("idx_video_session_user_time", "user_id", "timestamp"),
    )


class BrowserSession(Base):
    __tablename__ = "browser_sessions"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    
    ext_session_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    
    started_at: Mapped[datetime] = mapped_column(DateTime)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    
    active_seconds: Mapped[int] = mapped_column(Integer, default=0)
    background_seconds: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    
    video_count: Mapped[int] = mapped_column(Integer, default=0)
    shorts_count: Mapped[int] = mapped_column(Integer, default=0)
    autoplay_count: Mapped[int] = mapped_column(Integer, default=0)
    recommendation_clicks: Mapped[int] = mapped_column(Integer, default=0)
    search_count: Mapped[int] = mapped_column(Integer, default=0)
    
    synced_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="browser_sessions")
    
    __table_args__ = (
        Index("idx_browser_session_user_time", "user_id", "started_at"),
    )


class DailyStats(Base):
    __tablename__ = "daily_stats"
    
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    
    total_seconds: Mapped[int] = mapped_column(Integer, default=0)
    active_seconds: Mapped[int] = mapped_column(Integer, default=0)
    background_seconds: Mapped[int] = mapped_column(Integer, default=0)
    
    video_count: Mapped[int] = mapped_column(Integer, default=0)
    shorts_count: Mapped[int] = mapped_column(Integer, default=0)
    session_count: Mapped[int] = mapped_column(Integer, default=0)
    
    search_count: Mapped[int] = mapped_column(Integer, default=0)
    recommendation_clicks: Mapped[int] = mapped_column(Integer, default=0)
    autoplay_count: Mapped[int] = mapped_column(Integer, default=0)
    
    productive_videos: Mapped[int] = mapped_column(Integer, default=0)
    unproductive_videos: Mapped[int] = mapped_column(Integer, default=0)
    neutral_videos: Mapped[int] = mapped_column(Integer, default=0)
    
    prompts_shown: Mapped[int] = mapped_column(Integer, default=0)
    prompts_answered: Mapped[int] = mapped_column(Integer, default=0)
    
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user: Mapped["User"] = relationship(back_populates="daily_stats")
