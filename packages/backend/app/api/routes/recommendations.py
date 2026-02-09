from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List
import time

from app.db.session import get_db
from app.models.domain import User, RecommendationEvent
from app.api.deps import get_or_create_user
from pydantic import BaseModel

router = APIRouter()


class RecommendationEventCreate(BaseModel):
    type: str = "recommendation"
    sessionId: str
    location: str  # sidebar, end_screen, home_feed, search_results, autoplay_queue
    positionIndex: int
    videoId: str
    videoTitle: str | None = None
    channelName: str | None = None
    action: str  # ignored, hovered, clicked, not_interested, dont_recommend
    hoverDurationMs: int | None = None
    timestamp: int
    wasAutoplayNext: bool = False
    autoplayCountdownStarted: bool = False
    autoplayCancelled: bool = False


class RecommendationEventsBatchRequest(BaseModel):
    events: List[RecommendationEventCreate]


class RecommendationEventsBatchResponse(BaseModel):
    success: bool
    synced_events: int
    last_sync_time: int


@router.post("/events", response_model=RecommendationEventsBatchResponse)
async def sync_recommendation_events(
    data: RecommendationEventsBatchRequest,
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Batch sync recommendation interaction events from extension."""
    
    synced_events = 0
    
    for event in data.events:
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
        synced_events += 1
    
    await db.commit()
    
    return RecommendationEventsBatchResponse(
        success=True,
        synced_events=synced_events,
        last_sync_time=int(time.time() * 1000)
    )
