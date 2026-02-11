"""extend report_type length

Revision ID: 59144a27538d
Revises: 003_productive_urls
Create Date: 2026-02-10 09:47:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "59144a27538d"
down_revision: str | None = "003_productive_urls"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Extend report_type column from VARCHAR(10) to VARCHAR(50)
    op.alter_column(
        "mood_reports", "report_type", existing_type=sa.String(10), type_=sa.String(50), existing_nullable=False
    )


def downgrade() -> None:
    op.alter_column(
        "mood_reports", "report_type", existing_type=sa.String(50), type_=sa.String(10), existing_nullable=False
    )
