"""add last_totp_step to user (TOTP anti-replay)

Revision ID: c4f2a9b1d7e3
Revises: 7dd9df5ce610
Create Date: 2026-07-06 09:30:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'c4f2a9b1d7e3'
down_revision = '7dd9df5ce610'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable column: existing users have no recorded step yet (treated as
    # "no step used"), so the first login records one. Safe on a populated table.
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.add_column(sa.Column('last_totp_step', sa.BigInteger(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('user', schema=None) as batch_op:
        batch_op.drop_column('last_totp_step')
