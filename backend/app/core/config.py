from functools import cached_property

from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL


class Settings(BaseSettings):
    app_name: str = "Digital Platform"

    database_url: str | None = None
    db_host: str = "localhost"
    db_port: int = 5432
    db_name: str = "digital_platform"
    db_user: str = "postgres"
    db_password: str = ""
    db_schema: str = "platform"

    jwt_secret: str = "cambiar"
    jwt_expire_minutes: int = 480
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @cached_property
    def sqlalchemy_url(self) -> str | URL:
        if self.database_url:
            return self.database_url
        # URL.create escapa correctamente caracteres especiales de la contraseña
        return URL.create(
            "postgresql+psycopg",
            username=self.db_user,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
        )

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
