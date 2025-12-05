from sqlalchemy.orm import Session
from passlib.context import CryptContext
from fastapi import HTTPException
from dotenv import load_dotenv
from app.logging_config import logger
from app.schemas import UserCreate, UserUpdate, NewsCreate, NewsUpdate
from app.models import User, Notification, News, UserRole, MoodEntry
from . import models, schemas
from typing import Optional, List, Dict, Any
from datetime import date
from datetime import date as date_cls
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from app import models, schemas
from fastapi import status
"""ФУНКЦИИ"""

load_dotenv()

SPECIAL_CHARS = '!@#$%^&*()_-+=№;%:?*'
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------- USER ----------------

def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email_corporate == email).first()


def get_user(db: Session, user_id: int):
    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user


def password_check(user: UserCreate) -> bool:
    password = user.password
    if not (8 <= len(password) <= 40):
        return False
    try:
        name_parts = user.full_name.split()
        if len(name_parts) < 1:
            return False
        first_name = name_parts[0]
        last_name = name_parts[1] if len(name_parts) > 1 else ""
        if first_name in password or (last_name and last_name in password):
            return False
    except IndexError:
        return False

    has_special = any(char in SPECIAL_CHARS for char in password)
    if not has_special:
        return False

    upper_count = sum(1 for char in password if char.isupper())
    lower_count = sum(1 for char in password if char.islower())
    if upper_count + lower_count <= 2:
        return False

    try:
        with open('top_passwords.txt', 'r') as f:
            weak_passwords = {line.strip() for line in f}
        if password in weak_passwords:
            return False
    except FileNotFoundError:
        # если файла нет — просто пропускаем эту проверку
        pass

    return True


def create_user(db: Session, user: UserCreate) -> User:
    logger.info(f"Attempting to create user: {user.full_name}")
    logger.info(f"Попытка создания аккаунта для: {user.full_name}")
    hashed_password = pwd_context.hash(user.password)

    db_user = User(
        birthday=user.birthday,
        sex=user.sex,
        tg_name=user.tg_name,
        position_employee=user.position_employee,
        email_user=user.email_user,
        email_corporate=user.email_corporate,
        hashed_password=hashed_password,
        full_name=user.full_name,
        phone_number=user.phone_number,
        role=user.role,
        is_active=True,
        login_attempts=0,

        city=user.city,
        work_experience=user.work_experience,
        hierarchy_status=user.hierarchy_status,
        june=user.june,
        july=user.july,
        august=user.august,
        september=user.september,
        october=user.october,
        accreditation=user.accreditation,
        training=user.training,
        vacation=user.vacation,
        sick_leave=user.sick_leave,
        rebuke=user.rebuke,
        activity=user.activity,
        burn_out_score=user.burn_out_score,
        coins=user.coins,
        company=user.company
    )

    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    logger.info(
        f"Создан новый пользователь: {db_user.email_corporate}, ID: {db_user.id}"
    )
    return db_user


def update_user(db: Session, user_id: int, user_update: UserUpdate):
    NOTIFY_FIELDS = {
        "full_name": "Ваше имя обновлено",
        "phone_number": "Ваш номер телефона обновлён",
        "position_employee": "Ваша должность обновлена",
        "email_user": "Ваш личный email обновлён",
        "tg_name": "Ваш Telegram обновлён",
        "sex": "Ваш пол обновлён",
        "birthday": "Ваша дата рождения обновлена",
        "city": "Ваш город обновлён",
        "hierarchy_status": "Ваш статус в иерархии обновлён",
        "vacation": "Информация об отпуске обновлена",
        "training": "Данные о вашем обучении обновлены",
        "accreditation": "Данные об аттестации обновлены",
    }

    db_user = db.query(User).filter(User.id == user_id).first()
    if not db_user:
        return None

    update_data = user_update.dict(exclude_unset=True)

    for field, value in update_data.items():
        setattr(db_user, field, value)
        if field in NOTIFY_FIELDS:
            create_notification(
                db, db_user.id, f"{NOTIFY_FIELDS[field]}: {value}"
            )

    db.commit()
    db.refresh(db_user)
    return db_user


def search_users(
    db: Session,
    full_name: str = None,
    role: UserRole = None,
    sex: str = None,
    position_employee: str = None,
):
    try:
        query = db.query(User)

        if full_name:
            query = query.filter(User.full_name.ilike(f"%{full_name}%"))

        if role:
            query = query.filter(User.role == role)

        if sex:
            if sex not in ["М", "Ж"]:
                raise HTTPException(
                    status_code=422,
                    detail="Invalid sex value. Must be 'М' or 'Ж'",
                )
            query = query.filter(User.sex == sex)

        if position_employee:
            query = query.filter(
                User.position_employee.ilike(f"%{position_employee}%")
            )

        result = query.all()
        print(
            f"Search results for filters {locals()}: "
            f"{[u.full_name for u in result]}"
        )
        return result
    except Exception as e:
        print(f"Search error for filters {locals()}: {str(e)}")
        raise HTTPException(
            status_code=422, detail=f"Error processing filters: {str(e)}"
        )


def authenticate_user(db: Session, email: str, password: str):
    logger.info(f"Authentication attempt for email: {email}")
    user = get_user_by_email(db, email)
    if not user or not user.is_active:
        logger.warning(
            f"Authentication failed for {email}: User not found or inactive"
        )
        return False
    if not pwd_context.verify(password, user.hashed_password):
        user.login_attempts += 1
        logger.warning(
            f"Authentication failed for {email}: Incorrect password, "
            f"attempts: {user.login_attempts}"
        )
        if user.login_attempts >= 5:
            user.is_active = False
            logger.error(
                f"User {email} blocked due to too many login attempts"
            )
            if not has_block_notification(db, user.id):
                create_notification(
                    db,
                    user.id,
                    "Ваш аккаунт заблокирован из-за неудачных попыток входа.",
                )
                if user.role == "admin":
                    admins = db.query(User).filter(User.role == "admin").all()
                    for admin in admins:
                        if not has_block_notification(db, admin.id):
                            create_notification(
                                db,
                                admin.id,
                                f"Пользователь {user.email_corporate} "
                                f"заблокирован из-за неудачных попыток входа.",
                            )
        db.commit()
        return False
    user.login_attempts = 0
    db.commit()
    logger.info(f"User {email} authenticated successfully")
    return user


# ---------------- УВЕДОМЛЕНИЯ ----------------

def create_notification(db: Session, user_id: int, message: str):
    if db.query(Notification).filter(
        Notification.user_id == user_id,
        Notification.message == message,
    ).first():
        return None
    db_notification = Notification(user_id=user_id, message=message)
    db.add(db_notification)
    db.commit()
    db.refresh(db_notification)
    return db_notification


def has_block_notification(db: Session, user_id: int):
    """Проверяет, есть ли уже уведомление о блокировке для пользователя."""
    return (
        db.query(Notification)
        .filter(
            Notification.user_id == user_id,
            Notification.message.like(
                "%заблокирован из-за неудачных попыток входа%"
            ),
        )
        .first()
        is not None
    )


def get_user_notifications(db: Session, user_id: int):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .all()
    )


# ---------------- NEWS ----------------

def create_news(db: Session, news: NewsCreate, user_id: int):
    db_news = News(
        title=news.title,
        content=news.content,
        created_by=user_id,
        is_active=True,
    )
    db.add(db_news)
    db.commit()
    db.refresh(db_news)
    return db_news


def get_news(db: Session, skip: int = 0, limit: int = 10):
    return (
        db.query(News)
        .filter(News.is_active == True)
        .order_by(News.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_news_by_id(db: Session, news_id: int):
    return (
        db.query(News)
        .filter(News.id == news_id, News.is_active == True)
        .first()
    )


def update_news(db: Session, news_id: int, news_update: NewsUpdate):
    db_news = db.query(News).filter(News.id == news_id).first()
    if not db_news:
        return None
    if news_update.title is not None:
        db_news.title = news_update.title
    if news_update.content is not None:
        db_news.content = news_update.content
    if news_update.is_active is not None:
        db_news.is_active = news_update.is_active
    db.commit()
    db.refresh(db_news)
    return db_news


def delete_news(db: Session, news_id: int):
    db_news = db.query(News).filter(News.id == news_id).first()
    if not db_news:
        return None
    db_news.is_active = False
    db.commit()
    return db_news


# ---------------- CHAT ----------------

def create_chat_message(
    db: Session, user_id: int, content: str
) -> models.ChatMessage:
    msg = models.ChatMessage(user_id=user_id, content=content)
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg


def get_chat_messages(db: Session, limit: int = 50) -> list[models.ChatMessage]:
    msgs = (
        db.query(models.ChatMessage)
        .order_by(models.ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(msgs))


def get_chat_message_by_id(
    db: Session, message_id: int
) -> Optional[models.ChatMessage]:
    return (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.id == message_id)
        .first()
    )


def delete_chat_message(db: Session, message: models.ChatMessage) -> None:
    db.delete(message)
    db.commit()


# ------------- ДНЕВНИК САМОЧУВСТВИЯ -------------

def create_mood_entry(
    db: Session,
    user_id: int,
    entry_date: date,
    mood: int,
    comment: Optional[str] = None,
) -> models.MoodEntry:
    """
    Создаёт запись дневника самочувствия на указанную дату.
    Разрешена только одна запись на день.
    """

    # проверяем, есть ли уже запись на эту дату
    existing = (
        db.query(models.MoodEntry)
        .filter(
            models.MoodEntry.user_id == user_id,
            models.MoodEntry.date == entry_date,
        )
        .first()
    )

    if existing:
        # это как раз то, что мы ловим на фронте
        raise HTTPException(
            status_code=400,
            detail="Вы уже отправили дневник сегодня",
        )

    entry = models.MoodEntry(
        user_id=user_id,
        date=entry_date,
        mood=mood,
        comment=comment,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_mood_entries_for_user(
    db: Session,
    user_id: int,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> list[MoodEntry]:
    q = db.query(MoodEntry).filter(MoodEntry.user_id == user_id)
    if start_date:
        q = q.filter(MoodEntry.date >= start_date)
    if end_date:
        q = q.filter(MoodEntry.date <= end_date)
    return q.order_by(MoodEntry.date.asc()).all()


def get_mood_entries_for_user_month(
    db: Session,
    user_id: int,
    year: int,
    month: int,
) -> List[MoodEntry]:
    first_day = date_cls(year, month, 1)
    if month == 12:
        next_month = date_cls(year + 1, 1, 1)
    else:
        next_month = date_cls(year, month + 1, 1)

    return (
        db.query(MoodEntry)
        .filter(
            MoodEntry.user_id == user_id,
            MoodEntry.date >= first_day,
            MoodEntry.date < next_month,
        )
        .order_by(MoodEntry.date.asc(), MoodEntry.id.asc())
        .all()
    )


def get_mood_stats_for_month(
    db: Session,
    user_id: int,
    year: int,
    month: int,
) -> List[dict]:
    """
    Возвращает по каждому дню:
    {
      "date": date,
      "total": int,
      "counts": {1: n1, 2: n2, ...},
      "percents": {1: p1, ...}   # 0–100
    }
    """
    first_day = date_cls(year, month, 1)
    if month == 12:
        next_month = date_cls(year + 1, 1, 1)
    else:
        next_month = date_cls(year, month + 1, 1)

    rows = (
        db.query(
            MoodEntry.date.label("date"),
            MoodEntry.mood.label("mood"),
            func.count(MoodEntry.id).label("cnt"),
        )
        .filter(
            MoodEntry.user_id == user_id,
            MoodEntry.date >= first_day,
            MoodEntry.date < next_month,
        )
        .group_by(MoodEntry.date, MoodEntry.mood)
        .order_by(MoodEntry.date.asc())
        .all()
    )

    by_day: Dict[date_cls, Dict[str, Any]] = {}
    for r in rows:
        d = r.date
        mood = int(r.mood)
        cnt = int(r.cnt)
        if d not in by_day:
            by_day[d] = {
                "date": d,
                "total": 0,
                "counts": {i: 0 for i in range(1, 6)},
            }
        by_day[d]["total"] += cnt
        by_day[d]["counts"][mood] += cnt

    result = []
    for d, data in sorted(by_day.items(), key=lambda x: x[0]):
        total = data["total"] or 1
        percents = {
            mood: round(count * 100.0 / total, 1)
            for mood, count in data["counts"].items()
        }
        result.append(
            {
                "date": data["date"],
                "total": data["total"],
                "counts": data["counts"],
                "percents": percents,
            }
        )
    return result

"""Test"""
def create_burnout_test(
    db: Session,
    user_id: int,
    data: schemas.BurnoutTestCreate,
) -> models.BurnoutTestResult:
    obj = models.BurnoutTestResult(
        user_id=user_id,
        physical_score=data.physical_score,
        emotional_score=data.emotional_score,
        cognitive_score=data.cognitive_score,
        total_score=data.total_score,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


def update_burnout_test_comments(
    db: Session,
    user_id: int,
    test_id: int,
    data: schemas.BurnoutTestUpdateComments,
) -> models.BurnoutTestResult:
    obj = (
        db.query(models.BurnoutTestResult)
        .filter(
            models.BurnoutTestResult.id == test_id,
            models.BurnoutTestResult.user_id == user_id,
        )
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="Тест не найден")

    obj.comment_work = data.comment_work
    obj.comment_factors = data.comment_factors

    db.commit()
    db.refresh(obj)
    return obj