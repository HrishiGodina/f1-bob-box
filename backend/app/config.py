import os

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(extra="ignore")

    livetiming_autostart: bool = True
    livetiming_replay: str | None = None


LIVETIMING_REPLAY_DELAY_SECONDS = 5

OPENF1_BASE_URL = "https://api.openf1.org/v1"
OPENF1_TOKEN_URL = "https://api.openf1.org/token"
JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1"
ESPN_NEWS_URL = "https://site.api.espn.com/apis/site/v2/sports/racing/f1/news"

OPENF1_USERNAME = os.environ.get("OPENF1_USERNAME")
OPENF1_PASSWORD = os.environ.get("OPENF1_PASSWORD")
