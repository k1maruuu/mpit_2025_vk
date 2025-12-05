from datetime import date, timedelta
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app import schemas, crud, models

router = APIRouter(prefix="/diary", tags=["diary"])


@router.post("/entries", response_model=schemas.MoodEntryResponse)
def create_entry(
    entry_in: schemas.MoodEntryCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    # если дата не передана – берём сегодняшнюю
    entry_date = entry_in.date or date.today()

    entry = crud.create_mood_entry(
        db=db,
        user_id=current_user.id,
        entry_date=entry_date,      # <-- имя совпадает с сигнатурой
        mood=entry_in.mood,
        comment=entry_in.comment,
    )
    return entry


@router.get("", response_model=List[schemas.MoodEntryOut])
def get_mood_entries_for_month(
    year: int = Query(..., ge=2020, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Все записи дневника за указанный месяц для текущего пользователя."""
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1)
    else:
        end = date(year, month + 1, 1)

    entries = (
        db.query(models.MoodEntry)
        .filter(
            models.MoodEntry.user_id == current_user.id,
            models.MoodEntry.date >= start,
            models.MoodEntry.date < end,
        )
        .order_by(models.MoodEntry.date)
        .all()
    )
    return entries


@router.get("/stats", response_model=schemas.DiaryStats)
def get_diary_stats(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    Статистика дневника:
    - total_days: сколько дней всего есть запись
    - first_entry_date: дата первой записи
    - current_streak: сколько дней подряд до сегодня есть записи
    """
    # базовый запрос по пользователю
    q = db.query(models.MoodEntry).filter(
        models.MoodEntry.user_id == current_user.id
    )

    # всего уникальных дат с записями
    total_days = q.distinct(models.MoodEntry.date).count()

    # первая запись
    first_entry = q.order_by(models.MoodEntry.date.asc()).first()
    first_date = first_entry.date if first_entry else None

    # стрик: дни подряд до сегодня
    today = date.today()
    dates = [
        row.date
        for row in q.filter(models.MoodEntry.date <= today)
        .order_by(models.MoodEntry.date.desc())
        .all()
    ]

    expected = today
    streak = 0

    for d in dates:
        if d == expected:
            streak += 1
            expected = expected - timedelta(days=1)
        elif d < expected:
            # нашли "дырку" — стрик обрываем
            break

    return schemas.DiaryStats(
        total_days=total_days,
        first_entry_date=first_date,
        current_streak=streak,
    )
