from typing import Annotated
from fastapi import Header, HTTPException, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.db.session import get_db
from app.models.domain import User


async def get_or_create_user(
    x_user_id: Annotated[str, Header()],
    db: AsyncSession = Depends(get_db)
) -> User:
    """Get user by device ID, create if not exists."""
    result = await db.execute(
        select(User).where(User.device_id == x_user_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        user = User(device_id=x_user_id)
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    return user
