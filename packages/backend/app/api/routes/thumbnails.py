from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List
import time

from app.db.session import get_db
from app.models.domain import User, ThumbnailEvent
from app.api.deps import get_or_create_user
from pydantic import BaseModel

router = APIRouter()


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


class ThumbnailEventsBatchRequest(BaseModel):
    events: List[ThumbnailEventCreate]


class ThumbnailEventsBatchResponse(BaseModel):
    success: bool
    synced_events: int
    last_sync_time: int


@router.post("/events", response_model=ThumbnailEventsBatchResponse)
async def sync_thumbnail_events(
    data: ThumbnailEventsBatchRequest,
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Batch sync thumbnail hover/click events from extension."""
    
    synced_events = 0
    
    for event in data.events:
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
        synced_events += 1
    
    await db.commit()
    
    return ThumbnailEventsBatchResponse(
        success=True,
        synced_events=synced_events,
        last_sync_time=int(time.time() * 1000)
    )
