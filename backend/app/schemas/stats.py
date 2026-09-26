from pydantic import BaseModel, ConfigDict

from app.schemas.common import ConstructorRecord, DriverRecord


class MilestoneRecord(BaseModel):
    model_config = ConfigDict(extra="allow")

    stat: str
    value: str
    target: str


class MilestonesResponse(BaseModel):
    circuit_name: str | None
    milestones: list[MilestoneRecord]


class MilestoneErrorResponse(BaseModel):
    error: str


class DriverStatsResponse(BaseModel):
    info: DriverRecord
    wins: str
    championships: int
    career_teams: list[ConstructorRecord]


class ConstructorStatsResponse(BaseModel):
    info: ConstructorRecord
    wins: str
    championships: int
