"""Initial baseline – all 12 tables from SQLAlchemy models.

Revision ID: 001_initial
Revises:
Create Date: 2026-02-12
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("settings", postgresql.JSONB, nullable=True),
        sa.UniqueConstraint("device_id"),
    )
    op.create_index("ix_users_device_id", "users", ["device_id"])

    # --- video_sessions ---
    op.create_table(
        "video_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("browser_session_id", sa.String(64), nullable=True),
        sa.Column("video_id", sa.String(20), nullable=False),
        sa.Column("title", sa.Text, nullable=True),
        sa.Column("channel", sa.String(255), nullable=True),
        sa.Column("channel_id", sa.String(30), nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("watched_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("watched_percent", sa.Integer, nullable=False, server_default="0"),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("source", sa.String(30), nullable=True),
        sa.Column("source_position", sa.Integer, nullable=True),
        sa.Column("is_short", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("playback_speed", sa.Float, nullable=False, server_default="1.0"),
        sa.Column("average_speed", sa.Float, nullable=True),
        sa.Column("seek_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("pause_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tab_switch_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("productivity_rating", sa.Integer, nullable=True),
        sa.Column("rated_at", sa.DateTime, nullable=True),
        sa.Column("intention", sa.Text, nullable=True),
        sa.Column("matched_intention", sa.Boolean, nullable=True),
        sa.Column("led_to_another_video", sa.Boolean, nullable=True),
        sa.Column("next_video_source", sa.String(30), nullable=True),
        sa.Column("started_at", sa.DateTime, nullable=False),
        sa.Column("ended_at", sa.DateTime, nullable=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("synced_at", sa.DateTime, nullable=False),
        sa.Column("ext_session_id", sa.String(64), nullable=True),
    )
    op.create_index("ix_video_sessions_video_id", "video_sessions", ["video_id"])
    op.create_index("idx_video_session_user_time", "video_sessions", ["user_id", "timestamp"])
    op.create_index("idx_video_session_channel", "video_sessions", ["user_id", "channel_id"])

    # --- browser_sessions ---
    op.create_table(
        "browser_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("ext_session_id", sa.String(64), nullable=False),
        sa.Column("started_at", sa.DateTime, nullable=False),
        sa.Column("ended_at", sa.DateTime, nullable=True),
        sa.Column("entry_page_type", sa.String(20), nullable=True),
        sa.Column("entry_url", sa.Text, nullable=True),
        sa.Column("entry_source", sa.String(30), nullable=True),
        sa.Column("trigger_type", sa.String(30), nullable=True),
        sa.Column("total_duration_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("active_duration_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("background_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("pages_visited", sa.Integer, nullable=False, server_default="0"),
        sa.Column("videos_watched", sa.Integer, nullable=False, server_default="0"),
        sa.Column("videos_started_not_finished", sa.Integer, nullable=False, server_default="0"),
        sa.Column("shorts_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_scroll_pixels", sa.Integer, nullable=False, server_default="0"),
        sa.Column("thumbnails_hovered", sa.Integer, nullable=False, server_default="0"),
        sa.Column("thumbnails_clicked", sa.Integer, nullable=False, server_default="0"),
        sa.Column("page_reloads", sa.Integer, nullable=False, server_default="0"),
        sa.Column("back_button_presses", sa.Integer, nullable=False, server_default="0"),
        sa.Column("recommendation_clicks", sa.Integer, nullable=False, server_default="0"),
        sa.Column("autoplay_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("autoplay_cancelled", sa.Integer, nullable=False, server_default="0"),
        sa.Column("search_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("time_on_home_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("time_on_watch_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("time_on_search_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("time_on_shorts_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("productive_videos", sa.Integer, nullable=False, server_default="0"),
        sa.Column("unproductive_videos", sa.Integer, nullable=False, server_default="0"),
        sa.Column("neutral_videos", sa.Integer, nullable=False, server_default="0"),
        sa.Column("exit_type", sa.String(20), nullable=True),
        sa.Column("search_queries", postgresql.JSONB, nullable=True),
        sa.Column("synced_at", sa.DateTime, nullable=False),
        sa.UniqueConstraint("ext_session_id"),
    )
    op.create_index("ix_browser_sessions_ext_session_id", "browser_sessions", ["ext_session_id"])
    op.create_index("idx_browser_session_user_time", "browser_sessions", ["user_id", "started_at"])

    # --- daily_stats ---
    op.create_table(
        "daily_stats",
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("date", sa.Date, primary_key=True),
        sa.Column("total_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("active_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("background_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("session_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_session_duration_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("first_check_time", sa.String(5), nullable=True),
        sa.Column("video_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("videos_completed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("videos_abandoned", sa.Integer, nullable=False, server_default="0"),
        sa.Column("shorts_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("unique_channels", sa.Integer, nullable=False, server_default="0"),
        sa.Column("search_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("recommendation_clicks", sa.Integer, nullable=False, server_default="0"),
        sa.Column("autoplay_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("autoplay_cancelled", sa.Integer, nullable=False, server_default="0"),
        sa.Column("total_scroll_pixels", sa.Integer, nullable=False, server_default="0"),
        sa.Column("avg_scroll_velocity", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("thumbnails_hovered", sa.Integer, nullable=False, server_default="0"),
        sa.Column("thumbnails_clicked", sa.Integer, nullable=False, server_default="0"),
        sa.Column("page_reloads", sa.Integer, nullable=False, server_default="0"),
        sa.Column("back_button_presses", sa.Integer, nullable=False, server_default="0"),
        sa.Column("tab_switches", sa.Integer, nullable=False, server_default="0"),
        sa.Column("productive_videos", sa.Integer, nullable=False, server_default="0"),
        sa.Column("unproductive_videos", sa.Integer, nullable=False, server_default="0"),
        sa.Column("neutral_videos", sa.Integer, nullable=False, server_default="0"),
        sa.Column("prompts_shown", sa.Integer, nullable=False, server_default="0"),
        sa.Column("prompts_answered", sa.Integer, nullable=False, server_default="0"),
        sa.Column("interventions_shown", sa.Integer, nullable=False, server_default="0"),
        sa.Column("interventions_effective", sa.Integer, nullable=False, server_default="0"),
        sa.Column("hourly_seconds", postgresql.JSONB, nullable=True),
        sa.Column("top_channels", postgresql.JSONB, nullable=True),
        sa.Column("pre_sleep_minutes", sa.Integer, nullable=False, server_default="0"),
        sa.Column("binge_sessions", sa.Integer, nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime, nullable=False),
    )

    # --- scroll_events ---
    op.create_table(
        "scroll_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("page_type", sa.String(20), nullable=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("scroll_y", sa.Integer, nullable=False),
        sa.Column("scroll_depth_percent", sa.Integer, nullable=False),
        sa.Column("viewport_height", sa.Integer, nullable=False),
        sa.Column("page_height", sa.Integer, nullable=False),
        sa.Column("scroll_velocity", sa.Float, nullable=False),
        sa.Column("scroll_direction", sa.String(4), nullable=False),
        sa.Column("visible_video_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_scroll_events_session_id", "scroll_events", ["session_id"])
    op.create_index("idx_scroll_user_time", "scroll_events", ["user_id", "timestamp"])

    # --- thumbnail_events ---
    op.create_table(
        "thumbnail_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("video_id", sa.String(20), nullable=False),
        sa.Column("video_title", sa.Text, nullable=True),
        sa.Column("channel_name", sa.String(255), nullable=True),
        sa.Column("page_type", sa.String(20), nullable=True),
        sa.Column("position_index", sa.Integer, nullable=False),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("hover_duration_ms", sa.Integer, nullable=False, server_default="0"),
        sa.Column("preview_played", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("preview_watch_ms", sa.Integer, nullable=False, server_default="0"),
        sa.Column("clicked", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("title_caps_percent", sa.Integer, nullable=False, server_default="0"),
        sa.Column("title_length", sa.Integer, nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_thumbnail_events_session_id", "thumbnail_events", ["session_id"])
    op.create_index("idx_thumbnail_user_time", "thumbnail_events", ["user_id", "timestamp"])

    # --- page_events ---
    op.create_table(
        "page_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("event_type", sa.String(30), nullable=False),
        sa.Column("page_type", sa.String(20), nullable=True),
        sa.Column("page_url", sa.Text, nullable=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("from_page_type", sa.String(20), nullable=True),
        sa.Column("navigation_method", sa.String(20), nullable=True),
        sa.Column("search_query", sa.Text, nullable=True),
        sa.Column("search_results_count", sa.Integer, nullable=True),
        sa.Column("time_on_page_ms", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_page_events_session_id", "page_events", ["session_id"])
    op.create_index("idx_page_user_time", "page_events", ["user_id", "timestamp"])

    # --- video_watch_events ---
    op.create_table(
        "video_watch_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("watch_session_id", sa.String(64), nullable=False),
        sa.Column("video_id", sa.String(20), nullable=False),
        sa.Column("event_type", sa.String(20), nullable=False),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("video_time_seconds", sa.Float, nullable=False),
        sa.Column("seek_from_seconds", sa.Float, nullable=True),
        sa.Column("seek_to_seconds", sa.Float, nullable=True),
        sa.Column("seek_delta_seconds", sa.Float, nullable=True),
        sa.Column("playback_speed", sa.Float, nullable=True),
        sa.Column("watch_percent_at_abandon", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_video_watch_events_session_id", "video_watch_events", ["session_id"])
    op.create_index("ix_video_watch_events_watch_session_id", "video_watch_events", ["watch_session_id"])
    op.create_index("idx_video_watch_user_time", "video_watch_events", ["user_id", "timestamp"])

    # --- recommendation_events ---
    op.create_table(
        "recommendation_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("location", sa.String(30), nullable=False),
        sa.Column("position_index", sa.Integer, nullable=False),
        sa.Column("video_id", sa.String(20), nullable=False),
        sa.Column("video_title", sa.Text, nullable=True),
        sa.Column("channel_name", sa.String(255), nullable=True),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column("hover_duration_ms", sa.Integer, nullable=True),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("was_autoplay_next", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("autoplay_countdown_started", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("autoplay_cancelled", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_recommendation_events_session_id", "recommendation_events", ["session_id"])
    op.create_index("idx_rec_user_time", "recommendation_events", ["user_id", "timestamp"])

    # --- intervention_events ---
    op.create_table(
        "intervention_events",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("intervention_type", sa.String(50), nullable=False),
        sa.Column("triggered_at", sa.DateTime, nullable=False),
        sa.Column("trigger_reason", sa.Text, nullable=True),
        sa.Column("response", sa.String(30), nullable=True),
        sa.Column("response_at", sa.DateTime, nullable=True),
        sa.Column("response_time_ms", sa.Integer, nullable=True),
        sa.Column("user_left_youtube", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("minutes_until_return", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_intervention_events_session_id", "intervention_events", ["session_id"])
    op.create_index("idx_intervention_user_time", "intervention_events", ["user_id", "triggered_at"])

    # --- mood_reports ---
    op.create_table(
        "mood_reports",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("timestamp", sa.DateTime, nullable=False),
        sa.Column("report_type", sa.String(50), nullable=False),
        sa.Column("mood", sa.Integer, nullable=False),
        sa.Column("intention", sa.Text, nullable=True),
        sa.Column("satisfaction", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    op.create_index("ix_mood_reports_session_id", "mood_reports", ["session_id"])
    op.create_index("idx_mood_user_time", "mood_reports", ["user_id", "timestamp"])

    # --- productive_urls ---
    op.create_table(
        "productive_urls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("ext_id", sa.String(64), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("added_at", sa.DateTime, nullable=False),
        sa.Column("times_suggested", sa.Integer, nullable=False, server_default="0"),
        sa.Column("times_clicked", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_suggested_at", sa.DateTime, nullable=True),
        sa.Column("last_clicked_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("deleted_at", sa.DateTime, nullable=True),
    )
    op.create_index("ix_productive_urls_ext_id", "productive_urls", ["ext_id"])
    op.create_index("idx_productive_url_user", "productive_urls", ["user_id", "deleted_at"])


def downgrade() -> None:
    op.drop_table("productive_urls")
    op.drop_table("mood_reports")
    op.drop_table("intervention_events")
    op.drop_table("recommendation_events")
    op.drop_table("video_watch_events")
    op.drop_table("page_events")
    op.drop_table("thumbnail_events")
    op.drop_table("scroll_events")
    op.drop_table("daily_stats")
    op.drop_table("browser_sessions")
    op.drop_table("video_sessions")
    op.drop_table("users")
