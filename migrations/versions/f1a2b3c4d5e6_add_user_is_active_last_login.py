"""add is_suspended + last_login_at to user (admin suspend + login tracking)

Revision ID: f1a2b3c4d5e6
Revises: e3877a92ffe3
Create Date: 2026-07-10 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'f1a2b3c4d5e6'
down_revision = 'e3877a92ffe3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default on the NOT NULL column so this is safe on a populated table
    # (existing users are back-filled not-suspended). ``last_login_at`` is nullable
    # and stamped on the user's next sign-in.
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_suspended', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('last_login_at')
        batch_op.drop_column('is_suspended')
