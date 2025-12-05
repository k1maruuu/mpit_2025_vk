# app/routers/burnout_test.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app import schemas, crud, models

router = APIRouter(prefix="/burnout-tests", tags=["burnout-test"])


@router.post("", response_model=schemas.BurnoutTestOut)
def create_burnout_test(
    data: schemas.BurnoutTestCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.create_burnout_test(db=db, user_id=current_user.id, data=data)


@router.patch("/{test_id}/comments", response_model=schemas.BurnoutTestOut)
def update_burnout_test_comments(
    test_id: int,
    data: schemas.BurnoutTestUpdateComments,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return crud.update_burnout_test_comments(
        db=db,
        user_id=current_user.id,
        test_id=test_id,
        data=data,
    )


@router.get("/last", response_model=schemas.BurnoutTestOut)
def get_last_burnout_test(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Последний пройденный тест по выгоранию для текущего пользователя.
    """
    obj = (
        db.query(models.BurnoutTestResult)
        .filter(models.BurnoutTestResult.user_id == current_user.id)
        .order_by(models.BurnoutTestResult.created_at.desc())
        .first()
    )
    if not obj:
        raise HTTPException(status_code=404, detail="Тесты не найдены")

    return obj
