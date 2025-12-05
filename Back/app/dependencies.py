from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.schemas import UserInDB
from app.database import get_db
from app.auth import verify_token
from app.crud import get_user_by_email
from app.models import UserRole
from app.logging_config import logger
from app import models
"""ЗАВИСИМОСТИ"""

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = get_user_by_email(db, email=token_data.email)
    if user is None or not user.is_active:
        raise credentials_exception
    return user

def get_admin_user(current_user: UserInDB = Depends(get_current_user)):
    if current_user.role != UserRole.ADMIN:
        logger.warning(f"У пользователя {current_user.email_corporate} нет доступа")
        raise HTTPException(status_code=403, detail="Not enough permissions")
    return current_user

async def get_current_active_user(
    current_user: models.User = Depends(get_current_user),
):
    """
    Возвращает только активного пользователя.
    Если пользователь не активен — 400.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user",
        )
    return current_user