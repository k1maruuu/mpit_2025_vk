# app/routers/chat.py
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app import crud, schemas
from app.dependencies import get_current_user, get_admin_user
from app.schemas import UserInDB
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.get("/messages", response_model=list[schemas.ChatMessageRead])
@limiter.limit("30/second")
def get_messages(
    request: Request,  # 👈 ОБЯЗАТЕЛЬНО
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: UserInDB = Depends(get_current_user),
):
    messages = crud.get_chat_messages(db, limit=limit)
    return messages


@router.post("/messages", response_model=schemas.ChatMessageRead)
@limiter.limit("10/minute")
def post_message(
    request: Request,  # 👈 ТОЖЕ ОБЯЗАТЕЛЬНО
    msg_in: schemas.ChatMessageCreate = ...,
    db: Session = Depends(get_db),
    current_user: UserInDB = Depends(get_current_user),
):
    message = crud.create_chat_message(db, user_id=current_user.id, content=msg_in.content)
    return message


@router.delete("/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_message(
    request: Request,  # 👈 и тут
    message_id: int,
    db: Session = Depends(get_db),
    admin_user: UserInDB = Depends(get_admin_user),
):
    message = crud.get_chat_message_by_id(db, message_id=message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    crud.delete_chat_message(db, message)
    return
