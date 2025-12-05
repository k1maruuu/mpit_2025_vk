from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    DateTime,
    Text,
    ForeignKey,
    UniqueConstraint,
    Date,
    Enum,
    Text,
)
from sqlalchemy.sql import func
from app.database import Base
from enum import Enum as En
from datetime import date
from datetime import datetime
from sqlalchemy.orm import relationship

class UserRole(str, En):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "message", name="uix_user_message"),
    )


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    birthday = Column(Date, nullable=False)
    sex = Column(String, nullable=True)
    email_user = Column(String, unique=True, index=True, nullable=False)
    email_corporate = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    phone_number = Column(String, nullable=False)
    tg_name = Column(String, nullable=True)
    position_employee = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER, nullable=False)
    is_active = Column(Boolean, default=True)
    login_attempts = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    city = Column(String, nullable=True)
    work_experience = Column(Integer, nullable=True)
    hierarchy_status = Column(String, nullable=True)

    june = Column(Integer, nullable=True)
    july = Column(Integer, nullable=True)
    august = Column(Integer, nullable=True)
    september = Column(Integer, nullable=True)
    october = Column(Integer, nullable=True)

    accreditation = Column(String, nullable=True)
    training = Column(String, nullable=True)
    vacation = Column(String, nullable=True)
    sick_leave = Column(Boolean, nullable=True)
    rebuke = Column(Boolean, nullable=True)
    activity = Column(Boolean, nullable=True)

    burn_out_score = Column(Integer, nullable=True)
    
    burnout_tests = relationship("BurnoutTestResult", back_populates="user")
    coins = Column(Integer, default=0)
    company = Column(String, nullable=True)

    chat_messages = relationship(
        "ChatMessage",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    chat_sessions_bot = relationship(
        "ChatSessionBot",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    # оставляем вторую связь, если где-то используется
    # bot_sessions = relationship(
    #     "ChatSessionBot",
    #     back_populates="user",
    #     cascade="all, delete-orphan",
    # )

    mood_entries = relationship(
        "MoodEntry",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class News(Base):
    __tablename__ = "news"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    content = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="chat_messages")


class ChatSessionBot(Base):
    __tablename__ = "chat_sessions_bot"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="chat_sessions_bot")

    messages = relationship(
        "ChatMessageBot",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class ChatMessageBot(Base):
    __tablename__ = "chat_messages_bot"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # к какой сессии относится сообщение
    session_id = Column(
        Integer,
        ForeignKey("chat_sessions_bot.id", ondelete="CASCADE"),
        nullable=False,
    )

    title = Column(String, nullable=True)
    role = Column(String, nullable=False)  # "user" / "assistant"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship(
        "ChatSessionBot",
        back_populates="messages",
    )


class MoodEntry(Base):
    __tablename__ = "mood_entries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )

    # дата записи (по умолчанию сегодня)
    date = Column(Date, nullable=False, default=date.today)

    # настроение 1–5 (1 — очень плохо, 5 — супер)
    mood = Column(Integer, nullable=False)

    # комментарий пользователя
    comment = Column(String, nullable=True)

    user = relationship("User", back_populates="mood_entries")

    __table_args__ = (
        UniqueConstraint("user_id", "date", name="uix_user_date"),
    )


class BurnoutTestResult(Base):
    __tablename__ = "burnout_tests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    physical_score = Column(Integer, nullable=False)
    emotional_score = Column(Integer, nullable=False)
    cognitive_score = Column(Integer, nullable=False)
    total_score = Column(Integer, nullable=False)

    comment_work = Column(String(2000), nullable=True)
    comment_factors = Column(String(2000), nullable=True)

    user = relationship("User", back_populates="burnout_tests")