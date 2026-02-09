from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List
import time

from app.db.session import get_db
from app.models.domain import User, PageEvent
from app.api.deps import get_or_create_user
from pydantic import BaseModel

router = APIRouter()


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


class PageEventsBatchRequest(BaseModel):
    events: List[PageEventCreate]


class PageEventsBatchResponse(BaseModel):
    success: bool
    synced_events: int
    last_sync_time: int


@router.post("/events", response_model=PageEventsBatchResponse)
async def sync_page_events(
    data: PageEventsBatchRequest,
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Batch sync page navigation events from extension."""
    
    synced_events = 0
    
    for event in data.events:
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
        synced_events += 1
    
    await db.commit()
    
    return PageEventsBatchResponse(
        success=True,
        synced_events=synced_events,
        last_sync_time=int(time.time() * 1000)
    )
