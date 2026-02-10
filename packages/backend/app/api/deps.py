"""
Authentication and dependency injection.

Security features:
- Google OAuth token verification
- Rate limiting per user
- Request validation
"""

from typing import Annotated, Optional
from fastapi import Header, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from cachetools import TTLCache
import hashlib
import time

from app.db.session import get_db
from app.models.domain import User
from app.config import get_settings

settings = get_settings()

# Cache verified tokens for 5 minutes to reduce Google API calls
_token_cache: TTLCache = TTLCache(maxsize=1000, ttl=300)

# Security scheme
bearer_scheme = HTTPBearer(auto_error=False)


class AuthError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=401, detail=detail)


class RateLimitError(HTTPException):
    def __init__(self, detail: str = "Rate limit exceeded"):
        super().__init__(status_code=429, detail=detail)


async def verify_google_token(token: str) -> dict:
    """
    Verify Google OAuth ID token and return user info.
    Uses caching to reduce API calls.
    """
    # Check cache first
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:16]
    if token_hash in _token_cache:
        return _token_cache[token_hash]
    
    try:
        # Verify the token with Google
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.google_client_id
        )
        
        # Verify issuer
        if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
            raise AuthError("Invalid token issuer")
        
        user_info = {
            'google_id': idinfo['sub'],
            'email': idinfo.get('email'),
            'name': idinfo.get('name'),
            'picture': idinfo.get('picture'),
            'email_verified': idinfo.get('email_verified', False),
        }
        
        # Cache the result
        _token_cache[token_hash] = user_info
        return user_info
        
    except ValueError as e:
        raise AuthError(f"Invalid token: {str(e)}")


async def get_current_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)],
    x_user_id: Annotated[Optional[str], Header()] = None,
    db: AsyncSession = Depends(get_db)
) -> User:
    """
    Get or create user from Google OAuth token.
    
    Auth flow:
    1. Extract Bearer token from Authorization header
    2. Verify with Google OAuth
    3. Get/create user by Google ID
    
    For development: if require_auth=False, falls back to X-User-Id header
    """
    
    # Development mode - allow unauthenticated access
    if not settings.require_auth:
        if not x_user_id:
            raise AuthError("X-User-Id header required (dev mode)")
        
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
    
    # Production mode - require Google OAuth
    if not credentials:
        raise AuthError("Authorization header required")
    
    token = credentials.credentials
    user_info = await verify_google_token(token)
    
    # Find user by Google ID (stored in device_id for compatibility)
    google_id = f"google:{user_info['google_id']}"
    
    result = await db.execute(
        select(User).where(User.device_id == google_id)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        # Create new user
        user = User(
            device_id=google_id,
            settings={
                'email': user_info['email'],
                'name': user_info['name'],
                'picture': user_info['picture'],
            }
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
    
    return user


# Alias for backward compatibility
get_or_create_user = get_current_user


def validate_sync_payload(data: dict) -> None:
    """
    Validate sync payload sizes to prevent abuse.
    Raises HTTPException if limits exceeded.
    """
    limits = {
        'videoSessions': settings.max_video_sessions_per_sync,
        'browserSessions': 100,
        'scrollEvents': settings.max_events_per_sync,
        'thumbnailEvents': settings.max_events_per_sync,
        'pageEvents': settings.max_events_per_sync,
        'videoWatchEvents': settings.max_events_per_sync,
        'recommendationEvents': settings.max_events_per_sync,
        'interventionEvents': settings.max_events_per_sync,
        'moodReports': settings.max_events_per_sync,
        'productiveUrls': 100,
    }
    
    errors = []
    for key, limit in limits.items():
        if key in data:
            items = data[key]
            if isinstance(items, list) and len(items) > limit:
                errors.append(f"{key}: {len(items)} exceeds limit of {limit}")
            elif isinstance(items, dict) and len(items) > limit:
                errors.append(f"{key}: {len(items)} exceeds limit of {limit}")
    
    if errors:
        raise HTTPException(
            status_code=413,
            detail=f"Payload too large: {', '.join(errors)}"
        )


def sanitize_string(value: Optional[str], max_length: int = 1000) -> Optional[str]:
    """Sanitize and truncate string input."""
    if value is None:
        return None
    # Remove null bytes and control characters
    cleaned = ''.join(c for c in value if c.isprintable() or c in '\n\r\t')
    return cleaned[:max_length]


def sanitize_url(value: Optional[str]) -> Optional[str]:
    """Sanitize URL input."""
    if value is None:
        return None
    url = sanitize_string(value, max_length=2000)
    if url and not url.startswith(('http://', 'https://')):
        return None  # Invalid URL scheme
    return url
