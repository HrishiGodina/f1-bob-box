from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.common import CircuitRecord, ConstructorRecord, DriverRecord


class DriverStanding(BaseModel):
    model_config = ConfigDict(extra="allow")

    position: str
    points: str
    Driver: DriverRecord
    Constructors: list[ConstructorRecord]


class ConstructorStanding(BaseModel):
    model_config = ConfigDict(extra="allow")

    position: str
    points: str
    Constructor: ConstructorRecord


class NewsImage(BaseModel):
    model_config = ConfigDict(extra="allow")

    url: str


class NewsWebLink(BaseModel):
    model_config = ConfigDict(extra="allow")

    href: str


class NewsLinks(BaseModel):
    model_config = ConfigDict(extra="allow")

    web: NewsWebLink


class NewsArticle(BaseModel):
    model_config = ConfigDict(extra="allow")

    headline: str
    description: str
    images: list[NewsImage] = []
    links: NewsLinks


class ScheduledRace(BaseModel):
    model_config = ConfigDict(extra="allow")

    round: str
    raceName: str
    date: str
    Circuit: CircuitRecord


class RaceSummary(BaseModel):
    model_config = ConfigDict(extra="allow")

    round: str
    raceName: str
    date: str
    Circuit: CircuitRecord


class IdleDataResponse(BaseModel):
    driver_standings: list[DriverStanding]
    constructor_standings: list[ConstructorStanding]
    news: list[NewsArticle]
    schedule: list[ScheduledRace]
    next_race: RaceSummary | dict[str, Any]
