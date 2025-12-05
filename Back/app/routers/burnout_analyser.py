from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Tuple, Dict

from app.database import get_db
from app.dependencies import get_current_user
from app import models, schemas
from app.logging_config import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.services.burnout_analyzer import (
    generate_burnout_recommendations,
    generate_group_burnout_analysis,
)

router = APIRouter(prefix="/ai/analysis", tags=["burnout-analysis"])
limiter = Limiter(key_func=get_remote_address)

# ===== КЕШ ДЛЯ ГРУППОВОГО АНАЛИЗА =====
# Кешируем по ключу (company, city) -> последний GroupBurnoutAnalysisResponse
_group_analysis_cache: Dict[Tuple[str, str], schemas.GroupBurnoutAnalysisResponse] = {}


def _make_cache_key(company: str | None, city: str | None) -> Tuple[str, str]:
    return (company or "", city or "")


def get_manager_or_admin(current_user: models.User = Depends(get_current_user)):
    """Проверка прав: только MANAGER или ADMIN"""
    if current_user.role not in [models.UserRole.ADMIN, models.UserRole.MANAGER]:
        logger.warning(
            f"Доступ запрещен для пользователя "
            f"{current_user.email_corporate} с ролью {current_user.role}"
        )
        raise HTTPException(
            status_code=403,
            detail="Доступ разрешен только менеджерам и администраторам",
        )
    return current_user


@router.post("/analyze/{user_id}", response_model=schemas.BurnoutAnalysisResponse)
@limiter.limit("5/hour")
def analyze_user_burnout(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_manager_or_admin),
):
    """
    Генерирует персонализированный анализ выгорания для конкретного сотрудника.
    Доступно только администраторам и менеджерам.
    """
    try:
        logger.info(
            f"Менеджер {current_user.email_corporate} "
            f"запросил анализ для user_id={user_id}"
        )

        # Проверка прав доступа: менеджер может анализировать только своих подчиненных
        if current_user.role == models.UserRole.MANAGER:
            target_user = (
                db.query(models.User)
                .filter(models.User.id == user_id)
                .first()
            )
            if (
                not target_user
                or target_user.hierarchy_status
                != f"подчиненный_{current_user.id}"
            ):
                raise HTTPException(
                    status_code=403,
                    detail="Менеджеры могут анализировать только своих прямых подчиненных",
                )

        analysis = generate_burnout_recommendations(db, user_id)

        logger.info(
            f"Анализ сгенерирован для user_id={user_id}, "
            f"риск: {analysis.risk_level}"
        )

        return analysis

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка в анализе выгорания: {e}")
        raise HTTPException(status_code=500, detail="Ошибка генерации анализа")


@router.post("/analyze-me", response_model=schemas.BurnoutAnalysisResponse)
@limiter.limit("3/hour")
def analyze_my_burnout(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Персональный анализ выгорания для текущего пользователя.
    """
    try:
        logger.info(
            f"Пользователь {current_user.email_corporate} запросил самоанализ"
        )
        return generate_burnout_recommendations(db, current_user.id)
    except Exception as e:
        logger.error(f"Ошибка в самоанализе: {e}")
        raise HTTPException(status_code=500, detail="Ошибка генерации анализа")


@router.post("/group-analysis", response_model=schemas.GroupBurnoutAnalysisResponse)
@limiter.limit("10/hour")
def analyze_group_burnout(
    request: Request,
    group_request: schemas.GroupAnalysisRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_manager_or_admin),
):
    """
    Групповой анализ выгорания сотрудников по компании или городу.
    Доступно только администраторам и менеджерам.

    Теперь:
    - если force_refresh = False (по умолчанию) и в кеше есть результат для
      (company, city) -> вернём кеш
    - если force_refresh = True -> пересчитаем, перезапишем кеш и вернем новый
    """
    try:
        logger.info(
            f"Пользователь {current_user.email_corporate} запросил групповой анализ: "
            f"company={group_request.company}, city={group_request.city}, "
            f"force_refresh={group_request.force_refresh}"
        )

        # Проверка, что указан хотя бы один параметр
        if not group_request.company and not group_request.city:
            raise HTTPException(
                status_code=400,
                detail="Необходимо указать company или city",
            )

        # Для менеджеров: проверяем, что они запрашивают свою компанию/город
        if current_user.role == models.UserRole.MANAGER:
            if group_request.company and group_request.company != current_user.company:
                raise HTTPException(
                    status_code=403,
                    detail="Менеджеры могут анализировать только свою компанию",
                )
            if group_request.city and group_request.city != current_user.city:
                raise HTTPException(
                    status_code=403,
                    detail="Менеджеры могут анализировать только свой город",
                )

        cache_key = _make_cache_key(group_request.company, group_request.city)

        # 1) если есть кеш и НЕ force_refresh — вернуть кеш
        if cache_key in _group_analysis_cache and not group_request.force_refresh:
            logger.info(
                f"Возвращаем КЕШ группового анализа для key={cache_key}"
            )
            return _group_analysis_cache[cache_key]

        # 2) иначе считаем заново и обновляем кеш
        analysis = generate_group_burnout_analysis(
            db, group_request.company, group_request.city
        )

        _group_analysis_cache[cache_key] = analysis
        logger.info(
            f"Групповой анализ сгенерирован и сохранён в кеш для "
            f"{analysis.filter_type}={analysis.filter_value}, "
            f"сотрудников: {analysis.group_stats.total_employees}"
        )

        return analysis

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка в групповом анализе: {e}")
        raise HTTPException(
            status_code=500,
            detail="Ошибка генерации группового анализа",
        )


@router.get(
    "/user/{user_id}/history",
    response_model=List[schemas.BurnoutAnalysisResponse],
)
@limiter.limit("10/minute")
def get_analysis_history(
    request: Request,
    user_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_manager_or_admin),
):
    """
    Получить историю анализов пользователя (для отслеживания динамики).
    """
    raise HTTPException(status_code=501, detail="Функция в разработке")
