export enum UserRole {
    ADMIN = "admin",
    MANAGER = "manager",
    USER = "user",
}

export interface User {
  id: number;

  full_name: string;
  birthday: string;      
  sex: string;
  company?: string | null;
  email_user?: string | null;
  email_corporate?: string | null;
  phone_number?: string | null;
  tg_name: string;
  position_employee: string;
  role: UserRole;

  // новые HR-поля
  city?: string | null;
  work_experience?: number | null;
  hierarchy_status?: string | null;

  june?: number | null;
  july?: number | null;
  august?: number | null;
  september?: number | null;
  october?: number | null;

  accreditation?: string | null;
  training?: string | null;
  vacation?: string | null;
  sick_leave?: boolean | null;
  rebuke?: boolean | null;
  activity?: boolean | null;

  burn_out_score?: number | null;

  is_active: boolean;
  login_attempts: number;
  created_at: string;       
}

export interface UserUpdate {
    full_name?: string;
    birthday?: string;
    sex?: string;
    email_user?: string | null;
    phone_number?: string | null;
    tg_name?: string;
    position_employee?: string;
    subdivision?: string;
    role?: UserRole;
}

export interface UserCreate {
    full_name: string;
    birthday: string;
    sex: string;
    email_user?: string | null;
    phone_number?: string | null;
    tg_name: string;
    position_employee: string;
    subdivision: string;
    role: UserRole;
    password: string;
    email_corporate?: string | null;
}

export interface News {
    id: number;
    title: string;
    content: string;
    newsc: string | null;  // Добавлено поле newsc
    created_by: number;
    is_active: boolean;
    created_at: string;
}

export interface NewsCreate {
    title: string;
    content: string;
    newsc?: string;  // Добавлено поле newsc, опциональное
}

export interface NewsUpdate {
    title?: string;
    content?: string;
    newsc?: string;  // Добавлено поле newsc для обновления
}

//ddddddddddddddddddddddddddd

export type ChatUserShort = {
  id: number;
  full_name: string;
};

export type ChatMessage = {
  id: number;
  content: string;
  created_at: string;
  user: ChatUserShort;
};