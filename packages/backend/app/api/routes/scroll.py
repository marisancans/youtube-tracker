from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List
import time

from app.db.session import get_db
from app.models.domain import User, ScrollEvent
from app.api.deps import get_or_create_user
from pydantic import BaseModel

router = APIRouter()


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


class ScrollEventsBatchRequest(BaseModel):
    events: List[ScrollEventCreate]


class ScrollEventsBatchResponse(BaseModel):
    success: bool
    synced_events: int
    last_sync_time: int


@router.post("/events", response_model=ScrollEventsBatchResponse)
async def sync_scroll_events(
    data: ScrollEventsBatchRequest,
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Batch sync scroll events from extension."""
    
    synced_events = 0
    
    for event in data.events:
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
        synced_events += 1
    
    await db.commit()
    
    return ScrollEventsBatchResponse(
        success=True,
        synced_events=synced_events,
        last_sync_time=int(time.time() * 1000)
    )
