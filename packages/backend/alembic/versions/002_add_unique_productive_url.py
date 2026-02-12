"""Add unique constraint on productive_urls(user_id, ext_id).

Deduplicates existing rows first (keeps the most recent non-deleted, or the most
recent overall), then creates a partial unique index so the DB prevents future dupes.

Revision ID: 002
Revises: 001
"""

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Remove duplicates, keeping the "best" row per (user_id, ext_id):
    #    prefer deleted_at IS NULL, then most recent updated_at.
    op.execute(
        """
        DELETE FROM productive_urls
        WHERE id NOT IN (
            SELECT DISTINCT ON (user_id, ext_id) id
            FROM productive_urls
            ORDER BY user_id, ext_id, deleted_at NULLS FIRST, updated_at DESC
        )
        """
    )

    # 2. Add a unique index so this can never happen again.
    #    Using a regular unique constraint (not partial) — one row per (user_id, ext_id).
    op.create_unique_constraint("uq_productive_url_user_ext", "productive_urls", ["user_id", "ext_id"])


def downgrade() -> None:
    op.drop_constraint("uq_productive_url_user_ext", "productive_urls", type_="unique")
