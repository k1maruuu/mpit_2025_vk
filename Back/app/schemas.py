from typing import Optional, Dict, List, Any
from enum import Enum
from datetime import datetime, date

from pydantic import BaseModel, EmailStr, constr, conint, field_validator

"""СТРУКТУРЫ ДАННЫХ"""


class UserRole(str, Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    USER = "user"


# -------- USER --------


class UserBase(BaseModel):
    full_name: str
    birthday: date
    sex: str
    email_user: Optional[EmailStr] = None
    email_corporate: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    tg_name: str
    position_employee: str
    role: UserRole

    city: Optional[str] = None
    work_experience: Optional[int] = None
    hierarchy_status: Optional[str] = None

    june: Optional[int] = None
    july: Optional[int] = None
    august: Optional[int] = None
    september: Optional[int] = None
    october: Optional[int] = None

    accreditation: Optional[str] = None
    training: Optional[str] = None
    vacation: Optional[str] = None
    sick_leave: Optional[bool] = None
    rebuke: Optional[bool] = None
    activity: Optional[bool] = None

    burn_out_score: Optional[int] = None
    coins: Optional[int] = None
    company: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    birthday: Optional[date] = None
    sex: Optional[str] = None
    email_user: Optional[EmailStr] = None
    phone_number: Optional[str] = None
    tg_name: Optional[str] = None
    position_employee: Optional[str] = None
    role: Optional[UserRole] = None

    city: Optional[str] = None
    work_experience: Optional[int] = None
    hierarchy_status: Optional[str] = None

    june: Optional[int] = None
    july: Optional[int] = None
    august: Optional[int] = None
    september: Optional[int] = None
    october: Optional[int] = None

    accreditation: Optional[str] = None
    training: Optional[str] = None
    vacation: Optional[str] = None
    sick_leave: Optional[bool] = None
    rebuke: Optional[bool] = None
    activity: Optional[bool] = None

    burn_out_score: Optional[int] = None
    coins: Optional[int] = None
    company: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserInDB(UserBase):
    id: int
    is_active: bool
    login_attempts: int
    created_at: datetime

    class Config:
        from_attributes = True


# -------- NEWS --------


class NewsBase(BaseModel):
    title: str
    content: str


class NewsCreate(NewsBase):
    pass


class NewsUpdate(NewsBase):
    is_active: Optional[bool] = None


class NewsInDB(NewsBase):
    id: int
    created_by: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# -------- TOKEN --------


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None


# -------- CHAT --------


class UserShort(BaseModel):
    id: int
    full_name: str

    class Config:
        orm_mode = True


class ChatMessageBase(BaseModel):
    content: constr(min_length=1, max_length=500)


class ChatMessageCreate(ChatMessageBase):
    pass


class ChatMessageRead(ChatMessageBase):
    id: int
    created_at: datetime
    user: UserShort

    class Config:
        from_attributes = True


# ------- MOOD DIARY -------


class MoodEntryBase(BaseModel):
    mood: conint(ge=1, le=5)
    comment: Optional[str] = None


class MoodEntryCreate(MoodEntryBase):
    # можно прислать дату, а можно не присылать (будет сегодня)
    date: Optional[date] = None


class MoodEntryResponse(MoodEntryBase):
    id: int
    date: date

    class Config:
        orm_mode = True


class MoodDayStats(BaseModel):
    date: date
    total: int
    counts: Dict[int, int]
    percents: Dict[int, float]


class MoodEntryOut(BaseModel):
    id: int
    date: date
    mood: int
    comment: Optional[str] = None

    class Config:
        orm_mode = True


class DiaryStats(BaseModel):
    total_days: int
    first_entry_date: Optional[date]
    current_streak: int

    class Config:
        orm_mode = True


# --------- Burnout Test ---------


class BurnoutTestBase(BaseModel):
    physical_score: int
    emotional_score: int
    cognitive_score: int
    total_score: int


class BurnoutTestCreate(BurnoutTestBase):
    pass


class BurnoutTestUpdateComments(BaseModel):
    comment_work: Optional[str] = None
    comment_factors: Optional[str] = None


class BurnoutTestOut(BurnoutTestBase):
    id: int
    created_at: datetime
    comment_work: Optional[str] = None
    comment_factors: Optional[str] = None

    class Config:
        orm_mode = True


# --------- BOT ---------


class ChatMessageBotBase(BaseModel):
    role: str
    content: str


class ChatMessageBotCreate(ChatMessageBotBase):
    pass


class ChatMessageBotInDB(ChatMessageBotBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ChatSessionBotBase(BaseModel):
    title: Optional[str] = None


class ChatSessionBotCreate(ChatSessionBotBase):
    pass


class ChatSessionBotInDB(ChatSessionBotBase):
    id: int
    user_id: int
    created_at: datetime
    messages: List[ChatMessageBotInDB] = []

    class Config:
        from_attributes = True


class ChatSessionBotUpdate(BaseModel):
    title: Optional[str] = None


class ChatRequest(BaseModel):
    model: str = "gemma3:4b"
    messages: List[ChatMessageBotBase]
    session_id: Optional[int] = None


# --------- Burnout Analysis ---------


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RecommendationCategory(str, Enum):
    WORKLOAD = "workload"
    REST = "rest"
    SUPPORT = "support"
    DEVELOPMENT = "development"
    HEALTH = "health"


class Recommendation(BaseModel):
    category: RecommendationCategory
    priority: str  # "high", "medium", "low"
    text: str
    action_items: List[str] = []

    # ВАЖНО: нормализуем строки от LLM, типа "workload (оптимизация нагрузки)"
    @field_validator("category", mode="before")
    @classmethod
    def normalize_category(cls, v):
        # Уже Enum — ничего не делаем
        if isinstance(v, RecommendationCategory):
            return v

        if not isinstance(v, str):
            raise ValueError("Invalid category type")

        s = v.strip().lower()

        # Разрешаем формат "workload (что-то)", "workload: ..." и т.п.
        if s.startswith("workload"):
            return RecommendationCategory.WORKLOAD
        if s.startswith("rest"):
            return RecommendationCategory.REST
        if s.startswith("support"):
            return RecommendationCategory.SUPPORT
        if s.startswith("development"):
            return RecommendationCategory.DEVELOPMENT
        if s.startswith("health"):
            return RecommendationCategory.HEALTH

        # Если вообще мимо — пусть падает, это отловится выше как ValueError
        raise ValueError(
            "Category should start with 'workload', 'rest', 'support', "
            "'development' or 'health'"
        )


class BurnoutAnalysisResponse(BaseModel):
    user_id: int
    analysis_date: datetime
    risk_level: RiskLevel
    summary: str
    key_factors: List[str]
    recommendations: List[Recommendation]
    suggested_actions: List[str]

    class Config:
        from_attributes = True


# --------- Group Analysis ---------


class GroupAnalysisRequest(BaseModel):
    company: Optional[str] = None
    city: Optional[str] = None
    # новый флаг — запрашивать пересчёт или брать из кеша
    force_refresh: bool = False

    class Config:
        from_attributes = True



class EmployeeGroupStats(BaseModel):
    total_employees: int
    employees_with_tests: int
    avg_burnout_score: Optional[float]
    high_risk_count: int
    medium_risk_count: int
    low_risk_count: int
    critical_risk_count: int
    avg_work_experience: Optional[float]
    long_vacation_gap_count: int 
    avg_mood_last_30d: Optional[float]


class GroupBurnoutAnalysisResponse(BaseModel):
    analysis_date: datetime
    filter_type: str  
    filter_value: str
    group_stats: EmployeeGroupStats
    summary: str
    key_trends: List[str]
    recommendations: List[Recommendation]
    priority_actions: List[str]
    employee_breakdown: List[Dict[str, Any]]

    class Config:
        from_attributes = True
