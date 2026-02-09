from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List
import time

from app.db.session import get_db
from app.models.domain import User, VideoWatchEvent
from app.api.deps import get_or_create_user
from pydantic import BaseModel

router = APIRouter()


class VideoWatchEventCreate(BaseModel):
    type: str = "video_watch"
    sessionId: str
    watchSessionId: str
    videoId: str
    eventType: str  # play, pause, seek, speed_change, ended, abandoned, buffer
    timestamp: int
    videoTimeSeconds: float
    seekFromSeconds: float | None = None
    seekToSeconds: float | None = None
    seekDeltaSeconds: float | None = None
    playbackSpeed: float | None = None
    watchPercentAtAbandon: int | None = None


class VideoEventsBatchRequest(BaseModel):
    events: List[VideoWatchEventCreate]


class VideoEventsBatchResponse(BaseModel):
    success: bool
    synced_events: int
    last_sync_time: int


@router.post("/events", response_model=VideoEventsBatchResponse)
async def sync_video_events(
    data: VideoEventsBatchRequest,
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Batch sync video playback events from extension."""
    
    synced_events = 0
    
    for event in data.events:
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
        synced_events += 1
    
    await db.commit()
    
    return VideoEventsBatchResponse(
        success=True,
        synced_events=synced_events,
        last_sync_time=int(time.time() * 1000)
    )
