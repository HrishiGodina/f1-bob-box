import asyncio
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Request

from app.config import (
    ESPN_NEWS_URL,
    JOLPICA_BASE_URL,
    OPENF1_PASSWORD,
    OPENF1_TOKEN_URL,
    OPENF1_USERNAME,
)
from app.livetiming.state import LiveSessionState
from app.schemas.idle import IdleDataResponse
from app.schemas.livetiming import StatusResponse

router = APIRouter()

_openf1_token_cache = {"access_token": None, "expires_at": None}
_openf1_token_lock = asyncio.Lock()


async def get_openf1_headers() -> dict:
    """Authorization header for OpenF1 when sponsor credentials are set, else empty.
    Never raises — an auth failure falls back to unauthenticated requests."""
    if not OPENF1_USERNAME or not OPENF1_PASSWORD:
        return {}

    async with _openf1_token_lock:
        now = datetime.now(timezone.utc)
        if (
            _openf1_token_cache["access_token"]
            and _openf1_token_cache["expires_at"]
            and now < _openf1_token_cache["expires_at"]
        ):
            return {"Authorization": f"Bearer {_openf1_token_cache['access_token']}"}

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    OPENF1_TOKEN_URL,
                    data={"username": OPENF1_USERNAME, "password": OPENF1_PASSWORD},
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                )
                resp.raise_for_status()
                token_data = resp.json()
                access_token = token_data.get("access_token")
                expires_in = int(token_data.get("expires_in", 3600))

                if not access_token:
                    return {}

                _openf1_token_cache["access_token"] = access_token
                _openf1_token_cache["expires_at"] = now + timedelta(seconds=expires_in - 60)
                return {"Authorization": f"Bearer {access_token}"}
        except Exception:
            return {}


@router.get("/api/status", response_model=StatusResponse)
async def get_status(request: Request):
    live_state: LiveSessionState = request.app.state.live_state
    return {"is_live": live_state.is_live()}


@router.get("/api/idle-data", response_model=IdleDataResponse)
async def get_idle_data():
    """Fetches standings and news for the idle dashboard."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                standings_url = f"{JOLPICA_BASE_URL}/current/driverStandings.json"
                standings_resp = await client.get(standings_url)
                standings_resp.raise_for_status()
                standings_data = standings_resp.json()
            except Exception as e:
                print(f"Error fetching driver standings: {e}")
                standings_data = {"MRData": {"StandingsTable": {"StandingsLists": []}}}

            try:
                constructor_url = f"{JOLPICA_BASE_URL}/current/constructorStandings.json"
                constructor_resp = await client.get(constructor_url)
                constructor_resp.raise_for_status()
                constructor_data = constructor_resp.json()
            except Exception as e:
                print(f"Error fetching constructor standings: {e}")
                constructor_data = {"MRData": {"StandingsTable": {"StandingsLists": []}}}

            try:
                news_resp = await client.get(ESPN_NEWS_URL)
                news_resp.raise_for_status()
                news_data = news_resp.json()
            except Exception as e:
                print(f"Error fetching news: {e}")
                news_data = {"articles": []}

            try:
                schedule_resp = await client.get(f"{JOLPICA_BASE_URL}/current.json")
                schedule_resp.raise_for_status()
                schedule_data = schedule_resp.json()
            except Exception as e:
                print(f"Error fetching schedule: {e}")
                schedule_data = {"MRData": {"RaceTable": {"Races": []}}}

            try:
                next_race_resp = await client.get(f"{JOLPICA_BASE_URL}/current/next.json")
                next_race_resp.raise_for_status()
                next_race_data = next_race_resp.json()
            except Exception as e:
                print(f"Error fetching next race: {e}")
                next_race_data = {"MRData": {"RaceTable": {"Races": [{}]}}}

            standings_lists = (
                standings_data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists")
            )
            constructor_lists = (
                constructor_data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists")
            )
            next_races = next_race_data.get("MRData", {}).get("RaceTable", {}).get("Races", [{}])

            driver_standings = (
                standings_lists[0].get("DriverStandings", []) if standings_lists else []
            )
            constructor_standings = (
                constructor_lists[0].get("ConstructorStandings", []) if constructor_lists else []
            )

            return {
                "driver_standings": driver_standings,
                "constructor_standings": constructor_standings,
                "news": news_data.get("articles", []),
                "schedule": schedule_data.get("MRData", {}).get("RaceTable", {}).get("Races", []),
                "next_race": next_races[0],
            }
    except Exception as e:
        print(f"Global error in get_idle_data: {e}")
        return {
            "driver_standings": [],
            "constructor_standings": [],
            "news": [],
            "schedule": [],
            "next_race": {},
        }
