import httpx
from fastapi import APIRouter, HTTPException

from app.config import JOLPICA_BASE_URL
from app.schemas.stats import (
    ConstructorStatsResponse,
    DriverStatsResponse,
    MilestoneErrorResponse,
    MilestonesResponse,
)

router = APIRouter()

CHAMPIONSHIPS = {
    "hamilton": 7, "michael_schumacher": 7, "vettel": 4, "prost": 4,
    "senna": 3, "max_verstappen": 3, "alonso": 2, "lauda": 3,
    "piquet": 3, "jack_brabham": 3, "stewart": 3, "fangio": 5,
    "ferrari": 16, "williams": 9, "mclaren": 8, "mercedes": 8, "red_bull": 6, "lotus_f1": 7,
}


@router.get("/api/milestones", response_model=MilestonesResponse | MilestoneErrorResponse)
async def get_milestones():
    """Stats to be beaten for the upcoming race. Simplified prototype."""
    try:
        async with httpx.AsyncClient() as client:
            next_resp = await client.get(f"{JOLPICA_BASE_URL}/current/next.json")
            next_data = next_resp.json()
            next_race = next_data.get("MRData", {}).get("RaceTable", {}).get("Races", [{}])[0]

            return {
                "circuit_name": next_race.get("Circuit", {}).get("circuitName"),
                "milestones": [
                    {
                        "driver": "Lewis Hamilton",
                        "stat": "Most wins at this circuit",
                        "value": "8",
                        "target": "9",
                    },
                    {
                        "driver": "Max Verstappen",
                        "stat": "Podium streak",
                        "value": "5",
                        "target": "6",
                    },
                    {"team": "Red Bull", "stat": "Consecutive wins", "value": "11", "target": "12"},
                ],
            }
    except Exception as e:
        return {"error": str(e)}


@router.get("/api/driver/{driver_id}/stats", response_model=DriverStatsResponse)
async def get_driver_stats(driver_id: str):
    """Fetches career statistics for a specific driver."""
    try:
        async with httpx.AsyncClient() as client:
            info_resp = await client.get(f"{JOLPICA_BASE_URL}/drivers/{driver_id}.json")
            info_data = info_resp.json().get("MRData", {}).get("DriverTable", {}).get("Drivers", [])
            if not info_data:
                raise HTTPException(status_code=404, detail="Driver not found")
            info = info_data[0]

            wins_resp = await client.get(f"{JOLPICA_BASE_URL}/drivers/{driver_id}/results/1.json")
            wins = wins_resp.json().get("MRData", {}).get("total", "0")

            champ_count = 0
            try:
                champ_count = CHAMPIONSHIPS.get(driver_id, 0)
                if champ_count == 0:
                    champs_resp = await client.get(
                        f"{JOLPICA_BASE_URL}/drivers/{driver_id}/driverStandings/1.json"
                    )
                    champs = champs_resp.json().get("MRData", {}).get("StandingsTable", {}).get(
                        "StandingsLists", []
                    )
                    champ_count = len(champs)
            except Exception:
                pass

            teams_url = f"{JOLPICA_BASE_URL}/drivers/{driver_id}/constructors.json"
            teams_resp = await client.get(teams_url)
            teams_data = teams_resp.json().get("MRData", {})
            teams = teams_data.get("ConstructorTable", {}).get("Constructors", [])

            return {
                "info": info,
                "wins": wins,
                "championships": champ_count,
                "career_teams": teams,
            }
    except Exception as e:
        print(f"Error in get_driver_stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/constructor/{constructor_id}/stats", response_model=ConstructorStatsResponse)
async def get_constructor_stats(constructor_id: str):
    """Fetches career statistics for a specific constructor."""
    try:
        async with httpx.AsyncClient() as client:
            info_url = f"{JOLPICA_BASE_URL}/constructors/{constructor_id}.json"
            info_resp = await client.get(info_url)
            constructor_data = info_resp.json().get("MRData", {})
            info_data = constructor_data.get("ConstructorTable", {}).get("Constructors", [])
            if not info_data:
                raise HTTPException(status_code=404, detail="Constructor not found")
            info = info_data[0]

            wins_url = f"{JOLPICA_BASE_URL}/constructors/{constructor_id}/results/1.json"
            wins_resp = await client.get(wins_url)
            wins = wins_resp.json().get("MRData", {}).get("total", "0")

            champ_count = CHAMPIONSHIPS.get(constructor_id, 0)
            if champ_count == 0:
                try:
                    champs_resp = await client.get(
                        f"{JOLPICA_BASE_URL}/constructors/{constructor_id}/constructorStandings/1.json"
                    )
                    champs = champs_resp.json().get("MRData", {}).get("StandingsTable", {}).get(
                        "StandingsLists", []
                    )
                    champ_count = len(champs)
                except Exception:
                    pass

            return {
                "info": info,
                "wins": wins,
                "championships": champ_count,
            }
    except Exception as e:
        print(f"Error in get_constructor_stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
