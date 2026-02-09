from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timedelta
from typing import List
import time

from app.db.session import get_db
from app.models.domain import User, MoodReport
from app.api.deps import get_or_create_user
from pydantic import BaseModel

router = APIRouter()


class MoodReportCreate(BaseModel):
    timestamp: int
    sessionId: str
    reportType: str  # 'pre' or 'post'
    mood: int  # 1-5
    intention: str | None = None
    satisfaction: int | None = None  # 1-5


class MoodReportsBatchRequest(BaseModel):
    reports: List[MoodReportCreate]


class MoodReportsBatchResponse(BaseModel):
    success: bool
    synced_reports: int
    last_sync_time: int


class MoodReportResponse(BaseModel):
    id: int
    sessionId: str
    timestamp: int
    reportType: str
    mood: int
    intention: str | None
    satisfaction: int | None


class MoodReportsListResponse(BaseModel):
    reports: List[MoodReportResponse]
    total: int
    avg_pre_mood: float | None
    avg_post_mood: float | None
    avg_satisfaction: float | None
    mood_change: float | None  # post - pre average


@router.post("/reports", response_model=MoodReportsBatchResponse)
async def sync_mood_reports(
    data: MoodReportsBatchRequest,
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db)
):
    """Batch sync mood reports from extension."""
    
    synced_reports = 0
    
    for report in data.reports:
        mood = MoodReport(
            user_id=user.id,
            session_id=report.sessionId,
            timestamp=datetime.fromtimestamp(report.timestamp / 1000),
            report_type=report.reportType,
            mood=report.mood,
            intention=report.intention,
            satisfaction=report.satisfaction,
        )
        db.add(mood)
        synced_reports += 1
    
    await db.commit()
    
    return MoodReportsBatchResponse(
        success=True,
        synced_reports=synced_reports,
        last_sync_time=int(time.time() * 1000)
    )


@router.get("/reports", response_model=MoodReportsListResponse)
async def get_mood_reports(
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0)
):
    """Get mood reports with aggregated stats."""
    
    since = datetime.utcnow() - timedelta(days=days)
    
    result = await db.execute(
        select(MoodReport)
        .where(
            MoodReport.user_id == user.id,
            MoodReport.timestamp >= since
        )
        .order_by(MoodReport.timestamp.desc())
        .limit(limit)
        .offset(offset)
    )
    reports = result.scalars().all()
    
    # Calculate averages
    pre_moods = [r.mood for r in reports if r.report_type == 'pre']
    post_moods = [r.mood for r in reports if r.report_type == 'post']
    satisfactions = [r.satisfaction for r in reports if r.satisfaction is not None]
    
    avg_pre_mood = sum(pre_moods) / len(pre_moods) if pre_moods else None
    avg_post_mood = sum(post_moods) / len(post_moods) if post_moods else None
    avg_satisfaction = sum(satisfactions) / len(satisfactions) if satisfactions else None
    
    mood_change = None
    if avg_pre_mood is not None and avg_post_mood is not None:
        mood_change = round(avg_post_mood - avg_pre_mood, 2)
    
    return MoodReportsListResponse(
        reports=[
            MoodReportResponse(
                id=r.id,
                sessionId=r.session_id,
                timestamp=int(r.timestamp.timestamp() * 1000),
                reportType=r.report_type,
                mood=r.mood,
                intention=r.intention,
                satisfaction=r.satisfaction,
            )
            for r in reports
        ],
        total=len(reports),
        avg_pre_mood=round(avg_pre_mood, 2) if avg_pre_mood else None,
        avg_post_mood=round(avg_post_mood, 2) if avg_post_mood else None,
        avg_satisfaction=round(avg_satisfaction, 2) if avg_satisfaction else None,
        mood_change=mood_change,
    )


@router.get("/trends")
async def get_mood_trends(
    user: User = Depends(get_or_create_user),
    db: AsyncSession = Depends(get_db),
    days: int = Query(default=30, ge=7, le=90)
):
    """Get mood trends over time, grouped by day."""
    
    since = datetime.utcnow() - timedelta(days=days)
    
    result = await db.execute(
        select(MoodReport)
        .where(
            MoodReport.user_id == user.id,
            MoodReport.timestamp >= since
        )
        .order_by(MoodReport.timestamp)
    )
    reports = result.scalars().all()
    
    # Group by date
    by_date: dict = {}
    for report in reports:
        date_str = report.timestamp.strftime('%Y-%m-%d')
        if date_str not in by_date:
            by_date[date_str] = {
                "pre_moods": [],
                "post_moods": [],
                "satisfactions": [],
                "intentions": [],
            }
        
        if report.report_type == 'pre':
            by_date[date_str]["pre_moods"].append(report.mood)
        else:
            by_date[date_str]["post_moods"].append(report.mood)
        
        if report.satisfaction:
            by_date[date_str]["satisfactions"].append(report.satisfaction)
        
        if report.intention:
            by_date[date_str]["intentions"].append(report.intention)
    
    # Calculate daily averages
    trends = []
    for date_str, data in sorted(by_date.items()):
        trends.append({
            "date": date_str,
            "avg_pre_mood": round(sum(data["pre_moods"]) / len(data["pre_moods"]), 2) if data["pre_moods"] else None,
            "avg_post_mood": round(sum(data["post_moods"]) / len(data["post_moods"]), 2) if data["post_moods"] else None,
            "avg_satisfaction": round(sum(data["satisfactions"]) / len(data["satisfactions"]), 2) if data["satisfactions"] else None,
            "report_count": len(data["pre_moods"]) + len(data["post_moods"]),
            "common_intentions": list(set(data["intentions"]))[:5],
        })
    
    return {
        "period_days": days,
        "trends": trends,
    }
