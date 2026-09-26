from typing import Any

from pydantic import BaseModel, ConfigDict

from app.schemas.common import CircuitRecord


class CircuitStats(BaseModel):
    corners: int
    elevation_gain: int
    laps: int
    lap_record: str


class UpgradeRecord(BaseModel):
    team: str
    item: str
    impact: str


class CircuitDetailsResponse(BaseModel):
    circuit: CircuitRecord | dict[str, Any]
    prev_results: list[dict[str, Any]]
    available_years: list[int]
    stats: CircuitStats
    upgrades: list[UpgradeRecord]


class RaceResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: str | None
    driver_id: str | None
    family_name: str | None
    given_name: str | None
    team: str | None
    status: str | None
    is_finished: bool
    time: str | None


class SprintResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: str | None
    driver_id: str | None
    family_name: str | None
    given_name: str | None
    team: str | None
    is_finished: bool
    time: str | None


class QualiResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: str | None
    driver_id: str | None
    family_name: str | None
    given_name: str | None
    team: str | None
    time: str
    q1: str | None
    q2: str | None
    q3: str | None


class FPResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    position: str
    driver_number: int
    family_name: str | None
    given_name: str | None
    team_name: str | None
    time: str


SessionResult = RaceResult | SprintResult | QualiResult | FPResult


class RaceWeekendResponse(BaseModel):
    results: list[SessionResult]
    available: bool
