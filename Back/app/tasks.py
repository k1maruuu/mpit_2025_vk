from celery import Celery
from dotenv import load_dotenv
from transliterate import translit
from app.schemas import UserCreate
from app.logging_config import logger
import os

load_dotenv()

celery = Celery(
    "tasks",
    broker=os.getenv("REDIS_URL"),
    backend=os.getenv("REDIS_URL")
)

@celery.task
def generate_email_for_employee(user: UserCreate):
    logger.info(f"Генерация почты для: {user.full_name}")
    name_parts = user.full_name.split()
    mail_generate = ''
    if len(name_parts) >= 2:
        first_initial = str(translit(name_parts[1][0], 'ru', reversed=True)).upper()
        last_name = str(translit(name_parts[0], 'ru', reversed=True)).lower()
        mail_generate = f"{first_initial}.{last_name}"
    else:
        mail_generate = str(translit(user.full_name, 'ru', reversed=True)).lower()
    email = f"{mail_generate}@cdek.ru"
    logger.info(f"Удачная генерация почты: {email}")
    return email