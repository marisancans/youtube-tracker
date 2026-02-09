"""initial

Revision ID: 001
Revises: 
Create Date: 2024-02-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table('users',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('device_id', sa.String(64), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_users_device_id', 'users', ['device_id'], unique=True)

    # Video sessions table
    op.create_table('video_sessions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('video_id', sa.String(20), nullable=False),
        sa.Column('title', sa.Text(), nullable=True),
        sa.Column('channel', sa.String(255), nullable=True),
        sa.Column('duration_seconds', sa.Integer(), default=0),
        sa.Column('watched_seconds', sa.Integer(), default=0),
        sa.Column('watched_percent', sa.Integer(), default=0),
        sa.Column('source', sa.String(30), nullable=True),
        sa.Column('is_short', sa.Boolean(), default=False),
        sa.Column('playback_speed', sa.Float(), default=1.0),
        sa.Column('productivity_rating', sa.Integer(), nullable=True),
        sa.Column('rated_at', sa.DateTime(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.Column('ext_session_id', sa.String(64), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_video_session_user_time', 'video_sessions', ['user_id', 'timestamp'])
    op.create_index('ix_video_sessions_video_id', 'video_sessions', ['video_id'])

    # Browser sessions table
    op.create_table('browser_sessions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('ext_session_id', sa.String(64), nullable=False),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('ended_at', sa.DateTime(), nullable=True),
        sa.Column('active_seconds', sa.Integer(), default=0),
        sa.Column('background_seconds', sa.Integer(), default=0),
        sa.Column('duration_seconds', sa.Integer(), default=0),
        sa.Column('video_count', sa.Integer(), default=0),
        sa.Column('shorts_count', sa.Integer(), default=0),
        sa.Column('autoplay_count', sa.Integer(), default=0),
        sa.Column('recommendation_clicks', sa.Integer(), default=0),
        sa.Column('search_count', sa.Integer(), default=0),
        sa.Column('synced_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_browser_session_user_time', 'browser_sessions', ['user_id', 'started_at'])
    op.create_index('ix_browser_sessions_ext_session_id', 'browser_sessions', ['ext_session_id'], unique=True)

    # Daily stats table
    op.create_table('daily_stats',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('total_seconds', sa.Integer(), default=0),
        sa.Column('active_seconds', sa.Integer(), default=0),
        sa.Column('background_seconds', sa.Integer(), default=0),
        sa.Column('video_count', sa.Integer(), default=0),
        sa.Column('shorts_count', sa.Integer(), default=0),
        sa.Column('session_count', sa.Integer(), default=0),
        sa.Column('search_count', sa.Integer(), default=0),
        sa.Column('recommendation_clicks', sa.Integer(), default=0),
        sa.Column('autoplay_count', sa.Integer(), default=0),
        sa.Column('productive_videos', sa.Integer(), default=0),
        sa.Column('unproductive_videos', sa.Integer(), default=0),
        sa.Column('neutral_videos', sa.Integer(), default=0),
        sa.Column('prompts_shown', sa.Integer(), default=0),
        sa.Column('prompts_answered', sa.Integer(), default=0),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'date')
    )


def downgrade() -> None:
    op.drop_table('daily_stats')
    op.drop_table('browser_sessions')
    op.drop_table('video_sessions')
    op.drop_table('users')
