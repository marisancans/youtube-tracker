from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from typing import List
import time

from app.db.session import get_db
from app.models.domain import User, InterventionEvent
from app.api.deps import get_or_create_user
from pydantic import BaseModel

router = APIRouter()


class InterventionEventCreate(BaseModel):
    type: str = "intervention"
    sessionId: str
    interventionType: str  # productivity_prompt, time_warning, intention_prompt, friction_delay, etc.
    triggeredAt: int
    triggerReason: str | None = None
    response: str | None = None  # dismissed, engaged, productive, unproductive, neutral, stopped_watching
    responseAt: int | None = None
    responseTimeMs: int | None = None
    userLeftYoutube: bool = False
    minutesUntilReturn: int | None = None


class InterventionEventsBatchRequest(BaseModel):
    events: List[InterventionEventCreate]


class InterventionEventsBatchResponse(BaseModel):
    success: bool
    synced_events: int
    last_sync_time: int


class InterventionEventResponse(BaseModel):
    id: int
    sessionId: str
    interventionType: str
    triggeredAt: int
    triggerReason: str | None
    response: str | None
    responseAt: int | None
    responseTimeMs: int | None
    userLeftYoutube: bool
    minutesUntilReturn: int | None


class InterventionEventsListResponse(BaseModel):
    events: List[InterventionEventResponse]
    total: int
    effectiveness_rate: float  # % of interventions that led to user leaving


@router.post("/events", response_model=InterventionEventsBatchResponse)
async def sync_intervention_events(
    data: InterventionEventsBatchRequest,
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Batch sync intervention events from extension."""
    
    synced_events = 0
    
    for event in data.events:
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
        synced_events += 1
    
    await db.commit()
    
    return InterventionEventsBatchResponse(
        success=True,
        synced_events=synced_events,
        last_sync_time=int(time.time() * 1000)
    )


@router.get("/events", response_model=InterventionEventsListResponse)
async def get_intervention_events(
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=7, ge=1, le=90),
    intervention_type: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0)
):
    """Get intervention events for analysis."""
    
    since = datetime.utcnow() - timedelta(days=days)
    
    query = select(InterventionEvent).where(
        InterventionEvent.user_id == user.id,
        InterventionEvent.triggered_at >= since
    )
    
    if intervention_type:
        query = query.where(InterventionEvent.intervention_type == intervention_type)
    
    query = query.order_by(InterventionEvent.triggered_at.desc()).limit(limit).offset(offset)
    
    result = await db.execute(query)
    events = result.scalars().all()
    
    # Calculate effectiveness rate
    total_with_response = sum(1 for e in events if e.response is not None)
    effective_count = sum(1 for e in events if e.user_left_youtube)
    effectiveness_rate = (effective_count / total_with_response * 100) if total_with_response > 0 else 0.0
    
    return InterventionEventsListResponse(
        events=[
            InterventionEventResponse(
                id=e.id,
                sessionId=e.session_id,
                interventionType=e.intervention_type,
                triggeredAt=int(e.triggered_at.timestamp() * 1000),
                triggerReason=e.trigger_reason,
                response=e.response,
                responseAt=int(e.response_at.timestamp() * 1000) if e.response_at else None,
                responseTimeMs=e.response_time_ms,
                userLeftYoutube=e.user_left_youtube,
                minutesUntilReturn=e.minutes_until_return,
            )
            for e in events
        ],
        total=len(events),
        effectiveness_rate=round(effectiveness_rate, 1)
    )


@router.get("/summary")
async def get_intervention_summary(
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=7, ge=1, le=90)
):
    """Get intervention effectiveness summary."""
    
    since = datetime.utcnow() - timedelta(days=days)
    
    result = await db.execute(
        select(InterventionEvent).where(
            InterventionEvent.user_id == user.id,
            InterventionEvent.triggered_at >= since
        )
    )
    events = result.scalars().all()
    
    # Group by intervention type
    by_type: dict = {}
    for event in events:
        if event.intervention_type not in by_type:
            by_type[event.intervention_type] = {
                "total": 0,
                "responded": 0,
                "effective": 0,
                "avg_response_time_ms": 0,
                "response_times": [],
            }
        
        stats = by_type[event.intervention_type]
        stats["total"] += 1
        
        if event.response:
            stats["responded"] += 1
            if event.response_time_ms:
                stats["response_times"].append(event.response_time_ms)
        
        if event.user_left_youtube:
            stats["effective"] += 1
    
    # Calculate averages
    for stats in by_type.values():
        if stats["response_times"]:
            stats["avg_response_time_ms"] = sum(stats["response_times"]) / len(stats["response_times"])
        del stats["response_times"]
        
        stats["response_rate"] = round(stats["responded"] / stats["total"] * 100, 1) if stats["total"] > 0 else 0
        stats["effectiveness_rate"] = round(stats["effective"] / stats["total"] * 100, 1) if stats["total"] > 0 else 0
    
    return {
        "period_days": days,
        "total_interventions": len(events),
        "by_type": by_type,
    }
