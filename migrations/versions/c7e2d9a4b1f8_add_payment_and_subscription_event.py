"""add payment + subscription_event tables (P2 revenue ledger + churn history)

Revision ID: c7e2d9a4b1f8
Revises: f1a2b3c4d5e6
Create Date: 2026-07-10 13:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'c7e2d9a4b1f8'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'payment',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('stripe_invoice_id', sa.String(length=255), nullable=True),
        sa.Column('stripe_customer_id', sa.String(length=255), nullable=True),
        sa.Column('product', sa.String(length=16), nullable=False),
        sa.Column('amount_cents', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(length=8), nullable=False),
        sa.Column('status', sa.String(length=16), nullable=False),
        sa.Column('refunded_amount_cents', sa.Integer(), nullable=False),
        sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('payment', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_payment_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_payment_stripe_customer_id'), ['stripe_customer_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_payment_stripe_invoice_id'), ['stripe_invoice_id'], unique=True)
        batch_op.create_index(batch_op.f('ix_payment_user_id'), ['user_id'], unique=False)

    op.create_table(
        'subscription_event',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=True),
        sa.Column('product', sa.String(length=16), nullable=False),
        sa.Column('kind', sa.String(length=32), nullable=False),
        sa.Column('from_plan', sa.String(length=32), nullable=True),
        sa.Column('to_plan', sa.String(length=32), nullable=True),
        sa.Column('status', sa.String(length=32), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    with op.batch_alter_table('subscription_event', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_subscription_event_created_at'), ['created_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_subscription_event_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('subscription_event', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_subscription_event_user_id'))
        batch_op.drop_index(batch_op.f('ix_subscription_event_created_at'))
    op.drop_table('subscription_event')

    with op.batch_alter_table('payment', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_payment_user_id'))
        batch_op.drop_index(batch_op.f('ix_payment_stripe_invoice_id'))
        batch_op.drop_index(batch_op.f('ix_payment_stripe_customer_id'))
        batch_op.drop_index(batch_op.f('ix_payment_created_at'))
    op.drop_table('payment')
