from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Momentum"
    DATABASE_URL: str = "postgresql://postgres:password@db:5432/momentum"
    REDIS_URL: str = "redis://redis:6379/0"

    class Config:
        case_sensitive = True

settings = Settings()
