"""Add productive_urls table

Revision ID: 003_productive_urls
Revises: 0436cd4d4827
Create Date: 2025-02-10

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision = '003_productive_urls'
down_revision = '0436cd4d4827'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'productive_urls',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('ext_id', sa.String(64), nullable=False, index=True),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('added_at', sa.DateTime(), nullable=False),
        sa.Column('times_suggested', sa.Integer(), default=0, nullable=False),
        sa.Column('times_clicked', sa.Integer(), default=0, nullable=False),
        sa.Column('last_suggested_at', sa.DateTime(), nullable=True),
        sa.Column('last_clicked_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
    )
    
    op.create_index(
        'idx_productive_url_user',
        'productive_urls',
        ['user_id', 'deleted_at']
    )


def downgrade() -> None:
    op.drop_index('idx_productive_url_user')
    op.drop_table('productive_urls')
