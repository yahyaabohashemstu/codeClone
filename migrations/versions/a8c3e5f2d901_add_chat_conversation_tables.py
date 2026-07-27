"""add chat conversation tables

Revision ID: a8c3e5f2d901
Revises: c7e2d9a4b1f8
Create Date: 2026-07-27 12:40:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a8c3e5f2d901'
down_revision = 'c7e2d9a4b1f8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('chat_conversation',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('user_id', sa.Integer(), nullable=False),
    sa.Column('analysis_id', sa.Integer(), nullable=True),
    sa.Column('title', sa.String(length=160), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['user.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_conversation', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_chat_conversation_analysis_id'), ['analysis_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_chat_conversation_updated_at'), ['updated_at'], unique=False)
        batch_op.create_index(batch_op.f('ix_chat_conversation_user_id'), ['user_id'], unique=False)

    op.create_table('chat_message',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('conversation_id', sa.Integer(), nullable=False),
    sa.Column('role', sa.String(length=12), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('grounded', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['conversation_id'], ['chat_conversation.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('chat_message', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_chat_message_conversation_id'), ['conversation_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('chat_message', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_chat_message_conversation_id'))
    op.drop_table('chat_message')

    with op.batch_alter_table('chat_conversation', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_chat_conversation_user_id'))
        batch_op.drop_index(batch_op.f('ix_chat_conversation_updated_at'))
        batch_op.drop_index(batch_op.f('ix_chat_conversation_analysis_id'))
    op.drop_table('chat_conversation')
