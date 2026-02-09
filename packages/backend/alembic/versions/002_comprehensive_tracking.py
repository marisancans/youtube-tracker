"""comprehensive tracking

Revision ID: 002
Revises: 001
Create Date: 2024-02-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add new columns to video_sessions
    op.add_column('video_sessions', sa.Column('browser_session_id', sa.String(64), nullable=True))
    op.add_column('video_sessions', sa.Column('channel_id', sa.String(30), nullable=True))
    op.add_column('video_sessions', sa.Column('category', sa.String(50), nullable=True))
    op.add_column('video_sessions', sa.Column('source_position', sa.Integer(), nullable=True))
    op.add_column('video_sessions', sa.Column('average_speed', sa.Float(), nullable=True))
    op.add_column('video_sessions', sa.Column('seek_count', sa.Integer(), default=0))
    op.add_column('video_sessions', sa.Column('pause_count', sa.Integer(), default=0))
    op.add_column('video_sessions', sa.Column('tab_switch_count', sa.Integer(), default=0))
    op.add_column('video_sessions', sa.Column('intention', sa.Text(), nullable=True))
    op.add_column('video_sessions', sa.Column('matched_intention', sa.Boolean(), nullable=True))
    op.add_column('video_sessions', sa.Column('led_to_another_video', sa.Boolean(), nullable=True))
    op.add_column('video_sessions', sa.Column('next_video_source', sa.String(30), nullable=True))
    op.add_column('video_sessions', sa.Column('started_at', sa.DateTime(), nullable=True))
    op.add_column('video_sessions', sa.Column('ended_at', sa.DateTime(), nullable=True))
    op.create_index('idx_video_session_channel', 'video_sessions', ['user_id', 'channel_id'])

    # Add new columns to browser_sessions
    op.add_column('browser_sessions', sa.Column('entry_page_type', sa.String(20), nullable=True))
    op.add_column('browser_sessions', sa.Column('entry_url', sa.Text(), nullable=True))
    op.add_column('browser_sessions', sa.Column('entry_source', sa.String(30), nullable=True))
    op.add_column('browser_sessions', sa.Column('trigger_type', sa.String(30), nullable=True))
    op.add_column('browser_sessions', sa.Column('total_duration_seconds', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('active_duration_seconds', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('pages_visited', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('videos_started_not_finished', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('total_scroll_pixels', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('thumbnails_hovered', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('thumbnails_clicked', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('page_reloads', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('back_button_presses', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('autoplay_cancelled', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('time_on_home_seconds', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('time_on_watch_seconds', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('time_on_search_seconds', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('time_on_shorts_seconds', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('productive_videos', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('unproductive_videos', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('neutral_videos', sa.Integer(), default=0))
    op.add_column('browser_sessions', sa.Column('exit_type', sa.String(20), nullable=True))
    op.add_column('browser_sessions', sa.Column('search_queries', postgresql.JSONB(), nullable=True))
    # Note: background_seconds already exists in 001, and video_count stays as-is
    # The rename operations were removed as the schema already has the correct columns

    # Add new columns to daily_stats
    op.add_column('daily_stats', sa.Column('avg_session_duration_seconds', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('first_check_time', sa.String(5), nullable=True))
    op.add_column('daily_stats', sa.Column('videos_completed', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('videos_abandoned', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('unique_channels', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('autoplay_cancelled', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('total_scroll_pixels', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('avg_scroll_velocity', sa.Float(), default=0.0))
    op.add_column('daily_stats', sa.Column('thumbnails_hovered', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('thumbnails_clicked', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('page_reloads', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('back_button_presses', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('tab_switches', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('interventions_shown', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('interventions_effective', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('hourly_seconds', postgresql.JSONB(), nullable=True))
    op.add_column('daily_stats', sa.Column('top_channels', postgresql.JSONB(), nullable=True))
    op.add_column('daily_stats', sa.Column('pre_sleep_minutes', sa.Integer(), default=0))
    op.add_column('daily_stats', sa.Column('binge_sessions', sa.Integer(), default=0))

    # Add settings column to users
    op.add_column('users', sa.Column('settings', postgresql.JSONB(), nullable=True))

    # Create scroll_events table
    op.create_table('scroll_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('page_type', sa.String(20), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('scroll_y', sa.Integer(), nullable=False),
        sa.Column('scroll_depth_percent', sa.Integer(), nullable=False),
        sa.Column('viewport_height', sa.Integer(), nullable=False),
        sa.Column('page_height', sa.Integer(), nullable=False),
        sa.Column('scroll_velocity', sa.Float(), nullable=False),
        sa.Column('scroll_direction', sa.String(4), nullable=False),
        sa.Column('visible_video_count', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_scroll_user_time', 'scroll_events', ['user_id', 'timestamp'])
    op.create_index('idx_scroll_session', 'scroll_events', ['session_id'])

    # Create thumbnail_events table
    op.create_table('thumbnail_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('video_id', sa.String(20), nullable=False),
        sa.Column('video_title', sa.Text(), nullable=True),
        sa.Column('channel_name', sa.String(255), nullable=True),
        sa.Column('page_type', sa.String(20), nullable=True),
        sa.Column('position_index', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('hover_duration_ms', sa.Integer(), default=0),
        sa.Column('preview_played', sa.Boolean(), default=False),
        sa.Column('preview_watch_ms', sa.Integer(), default=0),
        sa.Column('clicked', sa.Boolean(), default=False),
        sa.Column('title_caps_percent', sa.Integer(), default=0),
        sa.Column('title_length', sa.Integer(), default=0),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_thumbnail_user_time', 'thumbnail_events', ['user_id', 'timestamp'])
    op.create_index('idx_thumbnail_session', 'thumbnail_events', ['session_id'])

    # Create page_events table
    op.create_table('page_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('event_type', sa.String(30), nullable=False),
        sa.Column('page_type', sa.String(20), nullable=True),
        sa.Column('page_url', sa.Text(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('from_page_type', sa.String(20), nullable=True),
        sa.Column('navigation_method', sa.String(20), nullable=True),
        sa.Column('search_query', sa.Text(), nullable=True),
        sa.Column('search_results_count', sa.Integer(), nullable=True),
        sa.Column('time_on_page_ms', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_page_user_time', 'page_events', ['user_id', 'timestamp'])
    op.create_index('idx_page_session', 'page_events', ['session_id'])

    # Create video_watch_events table
    op.create_table('video_watch_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('watch_session_id', sa.String(64), nullable=False),
        sa.Column('video_id', sa.String(20), nullable=False),
        sa.Column('event_type', sa.String(20), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('video_time_seconds', sa.Float(), nullable=False),
        sa.Column('seek_from_seconds', sa.Float(), nullable=True),
        sa.Column('seek_to_seconds', sa.Float(), nullable=True),
        sa.Column('seek_delta_seconds', sa.Float(), nullable=True),
        sa.Column('playback_speed', sa.Float(), nullable=True),
        sa.Column('watch_percent_at_abandon', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_video_watch_user_time', 'video_watch_events', ['user_id', 'timestamp'])
    op.create_index('idx_video_watch_session', 'video_watch_events', ['watch_session_id'])

    # Create recommendation_events table
    op.create_table('recommendation_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('location', sa.String(30), nullable=False),
        sa.Column('position_index', sa.Integer(), nullable=False),
        sa.Column('video_id', sa.String(20), nullable=False),
        sa.Column('video_title', sa.Text(), nullable=True),
        sa.Column('channel_name', sa.String(255), nullable=True),
        sa.Column('action', sa.String(20), nullable=False),
        sa.Column('hover_duration_ms', sa.Integer(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('was_autoplay_next', sa.Boolean(), default=False),
        sa.Column('autoplay_countdown_started', sa.Boolean(), default=False),
        sa.Column('autoplay_cancelled', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_rec_user_time', 'recommendation_events', ['user_id', 'timestamp'])
    op.create_index('idx_rec_session', 'recommendation_events', ['session_id'])

    # Create intervention_events table
    op.create_table('intervention_events',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('intervention_type', sa.String(50), nullable=False),
        sa.Column('triggered_at', sa.DateTime(), nullable=False),
        sa.Column('trigger_reason', sa.Text(), nullable=True),
        sa.Column('response', sa.String(30), nullable=True),
        sa.Column('response_at', sa.DateTime(), nullable=True),
        sa.Column('response_time_ms', sa.Integer(), nullable=True),
        sa.Column('user_left_youtube', sa.Boolean(), default=False),
        sa.Column('minutes_until_return', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_intervention_user_time', 'intervention_events', ['user_id', 'triggered_at'])
    op.create_index('idx_intervention_session', 'intervention_events', ['session_id'])

    # Create mood_reports table
    op.create_table('mood_reports',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('session_id', sa.String(64), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('report_type', sa.String(10), nullable=False),
        sa.Column('mood', sa.Integer(), nullable=False),
        sa.Column('intention', sa.Text(), nullable=True),
        sa.Column('satisfaction', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_mood_user_time', 'mood_reports', ['user_id', 'timestamp'])


def downgrade() -> None:
    # Drop new tables
    op.drop_table('mood_reports')
    op.drop_table('intervention_events')
    op.drop_table('recommendation_events')
    op.drop_table('video_watch_events')
    op.drop_table('page_events')
    op.drop_table('thumbnail_events')
    op.drop_table('scroll_events')
    
    # Remove added columns from users
    op.drop_column('users', 'settings')
    
    # Remove added columns from daily_stats
    op.drop_column('daily_stats', 'binge_sessions')
    op.drop_column('daily_stats', 'pre_sleep_minutes')
    op.drop_column('daily_stats', 'top_channels')
    op.drop_column('daily_stats', 'hourly_seconds')
    op.drop_column('daily_stats', 'interventions_effective')
    op.drop_column('daily_stats', 'interventions_shown')
    op.drop_column('daily_stats', 'tab_switches')
    op.drop_column('daily_stats', 'back_button_presses')
    op.drop_column('daily_stats', 'page_reloads')
    op.drop_column('daily_stats', 'thumbnails_clicked')
    op.drop_column('daily_stats', 'thumbnails_hovered')
    op.drop_column('daily_stats', 'avg_scroll_velocity')
    op.drop_column('daily_stats', 'total_scroll_pixels')
    op.drop_column('daily_stats', 'autoplay_cancelled')
    op.drop_column('daily_stats', 'unique_channels')
    op.drop_column('daily_stats', 'videos_abandoned')
    op.drop_column('daily_stats', 'videos_completed')
    op.drop_column('daily_stats', 'first_check_time')
    op.drop_column('daily_stats', 'avg_session_duration_seconds')
    
    # Revert browser_sessions changes (no renames needed, columns already existed)
    op.drop_column('browser_sessions', 'search_queries')
    op.drop_column('browser_sessions', 'exit_type')
    op.drop_column('browser_sessions', 'neutral_videos')
    op.drop_column('browser_sessions', 'unproductive_videos')
    op.drop_column('browser_sessions', 'productive_videos')
    op.drop_column('browser_sessions', 'time_on_shorts_seconds')
    op.drop_column('browser_sessions', 'time_on_search_seconds')
    op.drop_column('browser_sessions', 'time_on_watch_seconds')
    op.drop_column('browser_sessions', 'time_on_home_seconds')
    op.drop_column('browser_sessions', 'autoplay_cancelled')
    op.drop_column('browser_sessions', 'back_button_presses')
    op.drop_column('browser_sessions', 'page_reloads')
    op.drop_column('browser_sessions', 'thumbnails_clicked')
    op.drop_column('browser_sessions', 'thumbnails_hovered')
    op.drop_column('browser_sessions', 'total_scroll_pixels')
    op.drop_column('browser_sessions', 'videos_started_not_finished')
    op.drop_column('browser_sessions', 'pages_visited')
    op.drop_column('browser_sessions', 'active_duration_seconds')
    op.drop_column('browser_sessions', 'total_duration_seconds')
    op.drop_column('browser_sessions', 'trigger_type')
    op.drop_column('browser_sessions', 'entry_source')
    op.drop_column('browser_sessions', 'entry_url')
    op.drop_column('browser_sessions', 'entry_page_type')
    
    # Revert video_sessions changes
    op.drop_index('idx_video_session_channel', 'video_sessions')
    op.drop_column('video_sessions', 'ended_at')
    op.drop_column('video_sessions', 'started_at')
    op.drop_column('video_sessions', 'next_video_source')
    op.drop_column('video_sessions', 'led_to_another_video')
    op.drop_column('video_sessions', 'matched_intention')
    op.drop_column('video_sessions', 'intention')
    op.drop_column('video_sessions', 'tab_switch_count')
    op.drop_column('video_sessions', 'pause_count')
    op.drop_column('video_sessions', 'seek_count')
    op.drop_column('video_sessions', 'average_speed')
    op.drop_column('video_sessions', 'source_position')
    op.drop_column('video_sessions', 'category')
    op.drop_column('video_sessions', 'channel_id')
    op.drop_column('video_sessions', 'browser_session_id')
