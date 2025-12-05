from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from app.database import get_db
from app.dependencies import get_current_user, get_admin_user
from app import models, schemas
from app.services.burnout_analyzer import (
    generate_burnout_recommendations, 
    generate_group_burnout_analysis
)
from app.logging_config import logger
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/ai/analysis", tags=["burnout-analysis"])
limiter = Limiter(key_func=get_remote_address)

def get_manager_or_admin(current_user: models.User = Depends(get_current_user)):
    """Проверка прав: только MANAGER или ADMIN"""
    if current_user.role not in [models.UserRole.ADMIN, models.UserRole.MANAGER]:
        logger.warning(f"Доступ запрещен для пользователя {current_user.email_corporate} с ролью {current_user.role}")
        raise HTTPException(status_code=403, detail="Доступ разрешен только менеджерам и администраторам")
    return current_user

@router.post("/analyze/{user_id}", response_model=schemas.BurnoutAnalysisResponse)
@limiter.limit("5/hour")
def analyze_user_burnout(
    request: Request,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_manager_or_admin)
):
    """
    Генерирует персонализированный анализ выгорания для конкретного сотрудника.
    Доступно только администраторам и менеджерам.
    """
    try:
        logger.info(f"Менеджер {current_user.email_corporate} запросил анализ для user_id={user_id}")
        
        # Проверка прав доступа: менеджер может анализировать только своих подчиненных
        if current_user.role == models.UserRole.MANAGER:
            target_user = db.query(models.User).filter(models.User.id == user_id).first()
            if not target_user or target_user.hierarchy_status != f"подчиненный_{current_user.id}":
                raise HTTPException(
                    status_code=403,
                    detail="Менеджеры могут анализировать только своих прямых подчиненных"
                )
        
        analysis = generate_burnout_recommendations(db, user_id)
        
        # Логирование для аудита
        logger.info(f"Анализ сгенерирован для user_id={user_id}, риск: {analysis.risk_level}")
        
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
    current_user: models.User = Depends(get_current_user)
):
    """
    Персональный анализ выгорания для текущего пользователя.
    """
    try:
        logger.info(f"Пользователь {current_user.email_corporate} запросил самоанализ")
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
    current_user: models.User = Depends(get_manager_or_admin)
):
    """
    Групповой анализ выгорания сотрудников по компании или городу.
    Доступно только администраторам и менеджерам.
    """
    try:
        logger.info(f"Пользователь {current_user.email_corporate} запросил групповой анализ: company={group_request.company}, city={group_request.city}")
        
        # Проверка, что указан хотя бы один параметр
        if not group_request.company and not group_request.city:
            raise HTTPException(status_code=400, detail="Необходимо указать company или city")
        
        # Для менеджеров: проверяем, что они запрашивают свою компанию/город
        if current_user.role == models.UserRole.MANAGER:
            if group_request.company and group_request.company != current_user.company:
                raise HTTPException(
                    status_code=403,
                    detail="Менеджеры могут анализировать только свою компанию"
                )
            if group_request.city and group_request.city != current_user.city:
                raise HTTPException(
                    status_code=403,
                    detail="Менеджеры могут анализировать только свой город"
                )
        
        analysis = generate_group_burnout_analysis(db, group_request.company, group_request.city)
        
        logger.info(f"Групповой анализ сгенерирован для {analysis.filter_type}={analysis.filter_value}, сотрудников: {analysis.group_stats.total_employees}")
        
        return analysis
        
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Ошибка в групповом анализе: {e}")
        raise HTTPException(status_code=500, detail="Ошибка генерации группового анализа")

@router.get("/user/{user_id}/history", response_model=List[schemas.BurnoutAnalysisResponse])
@limiter.limit("10/minute")
def get_analysis_history(
    request: Request,
    user_id: int,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_manager_or_admin)
):
    """
    Получить историю анализов пользователя (для отслеживания динамики).
    """
    # Пример: можно добавить таблицу для сохранения истории анализов
    # Сейчас вернем только последний анализ как историю
    raise HTTPException(status_code=501, detail="Функция в разработке")