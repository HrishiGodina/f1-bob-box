from pydantic import BaseModel


class StatusResponse(BaseModel):
    is_live: bool


class F1AuthStatusResponse(BaseModel):
    valid_until: float | None
    needs_refresh: bool


class RefreshStartResponse(BaseModel):
    url: str
