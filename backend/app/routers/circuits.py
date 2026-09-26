import httpx
from fastapi import APIRouter, HTTPException

from app.config import JOLPICA_BASE_URL, OPENF1_BASE_URL
from app.schemas.circuits import CircuitDetailsResponse, RaceWeekendResponse

router = APIRouter()

CIRCUIT_REDESIGN_YEAR = {
    "silverstone": 2010,
    "spa": 2007,
    "monza": 2000,
    "monaco": 1929,
    "bahrain": 2004,
    "jeddah": 2021,
    "albert_park": 2022,
    "suzuka": 1987,
    "shanghai": 2004,
    "miami": 2022,
    "imola": 1988,
    "catalunya": 1991,
    "villeneuve": 1978,
    "red_bull_ring": 2011,
    "hungaroring": 1986,
    "zandvoort": 2021,
    "marina_bay": 2008,
    "americas": 2012,
    "rodriguez": 1962,
    "interlagos": 1984,
    "las_vegas": 2023,
    "losail": 2021,
    "yas_marina": 2009,
    "baku": 2016,
    "madring": 2026,
    "sepang": 1999,
    "vegas": 2023,
}

DEFAULT_HISTORY_WINDOW = 10

CIRCUIT_OPENF1_SHORT_NAME = {
    "bahrain": "Bahrain",
    "jeddah": "Jeddah",
    "albert_park": "Melbourne",
    "suzuka": "Suzuka",
    "shanghai": "Shanghai",
    "miami": "Miami",
    "imola": "Imola",
    "monaco": "Monaco",
    "villeneuve": "Montreal",
    "catalunya": "Barcelona",
    "red_bull_ring": "Spielberg",
    "silverstone": "Silverstone",
    "hungaroring": "Budapest",
    "spa": "Spa-Francorchamps",
    "zandvoort": "Zandvoort",
    "monza": "Monza",
    "baku": "Baku",
    "marina_bay": "Singapore",
    "americas": "Austin",
    "rodriguez": "Mexico City",
    "interlagos": "São Paulo",
    "las_vegas": "Las Vegas",
    "losail": "Lusail",
    "yas_marina": "Abu Dhabi",
    "madring": "Madring",
    "sepang": "Sepang",
    "vegas": "Las Vegas",
}


@router.get("/api/circuit/{circuit_id}", response_model=CircuitDetailsResponse)
async def get_circuit_details(circuit_id: str, season: int = 2026):
    """Detailed circuit info plus historical data for the given season.
    season=2026 fetches 2025 results (season-1); returns available_years."""
    try:
        current_season = 2026
        async with httpx.AsyncClient() as client:
            circ_resp = await client.get(f"{JOLPICA_BASE_URL}/circuits/{circuit_id}.json")
            circuit_table = circ_resp.json().get("MRData", {}).get("CircuitTable", {})
            circuit = circuit_table.get("Circuits", [{}])[0]

            results_season = season - 1
            prev_results = []
            try:
                res_resp = await client.get(
                    f"{JOLPICA_BASE_URL}/{results_season}/circuits/{circuit_id}/results.json"
                )
                race_table = res_resp.json().get("MRData", {}).get("RaceTable", {})
                prev_results = race_table.get("Races", [{}])[0].get("Results", [])
            except Exception:
                pass

            fallback_start = current_season - DEFAULT_HISTORY_WINDOW
            start_year = CIRCUIT_REDESIGN_YEAR.get(circuit_id, fallback_start)
            available_years = list(range(start_year, current_season + 1))

            corners = 19
            elevation_max = 40
            if "monaco" in circuit_id:
                corners, elevation_max = 19, 42
            elif "spa" in circuit_id:
                corners, elevation_max = 20, 102
            elif "monza" in circuit_id:
                corners, elevation_max = 11, 12
            elif "silverstone" in circuit_id:
                corners, elevation_max = 18, 11

            return {
                "circuit": circuit,
                "prev_results": prev_results,
                "available_years": available_years,
                "stats": {
                    "corners": corners,
                    "elevation_gain": elevation_max,
                    "laps": 78 if "monaco" in circuit_id else 53,
                    "lap_record": "1:10.166" if "monaco" in circuit_id else "1:21.046",
                },
                "upgrades": [
                    {"team": "Mercedes", "item": "Front Wing Endplate", "impact": "High"},
                    {"team": "Red Bull", "item": "Floor Edge", "impact": "Medium"},
                    {"team": "Ferrari", "item": "Rear Brake Duct", "impact": "Low"},
                ],
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/race-weekend/{circuit_id}", response_model=RaceWeekendResponse)
async def get_race_weekend(circuit_id: str, year: int = 2025, session: str = "race"):
    """Results for one session of a race weekend: race | quali | sprint | fp1 | fp2 | fp3.
    FP sessions are only available for year >= 2023 via OpenF1."""
    try:
        session = session.lower()

        if session in ("fp1", "fp2", "fp3"):
            if year < 2023:
                return {"results": [], "available": False}
            short_name = CIRCUIT_OPENF1_SHORT_NAME.get(circuit_id)
            if not short_name:
                return {"results": [], "available": False}
            session_name_map = {"fp1": "Practice 1", "fp2": "Practice 2", "fp3": "Practice 3"}
            session_name = session_name_map[session]
            async with httpx.AsyncClient(timeout=15.0) as client:
                sess_resp = await client.get(
                    f"{OPENF1_BASE_URL}/sessions",
                    params={
                        "year": year,
                        "circuit_short_name": short_name,
                        "session_name": session_name,
                    },
                )
                sessions_data = sess_resp.json()
                if not sessions_data:
                    return {"results": [], "available": False}
                session_key = sessions_data[0].get("session_key")
                if not session_key:
                    return {"results": [], "available": False}

                laps_resp = await client.get(
                    f"{OPENF1_BASE_URL}/laps",
                    params={"session_key": session_key, "is_pit_out_lap": False},
                )
                laps = laps_resp.json()

                drivers_resp = await client.get(
                    f"{OPENF1_BASE_URL}/drivers",
                    params={"session_key": session_key},
                )
                drivers = {d["driver_number"]: d for d in drivers_resp.json()}

                best: dict = {}
                for lap in laps:
                    dn = lap.get("driver_number")
                    lt = lap.get("lap_duration")
                    if dn and lt and (dn not in best or lt < best[dn]["lap_duration"]):
                        best[dn] = lap

                ranked = sorted(best.values(), key=lambda x: x.get("lap_duration") or 9999)
                results = []
                for i, lap in enumerate(ranked):
                    dn = lap["driver_number"]
                    drv = drivers.get(dn, {})
                    dur = lap.get("lap_duration")
                    mins = int(dur // 60) if dur else 0
                    secs = dur % 60 if dur else 0
                    time_str = f"{mins}:{secs:06.3f}" if dur else "N/A"
                    results.append(
                        {
                            "position": str(i + 1),
                            "driver_number": dn,
                            "family_name": drv.get("last_name", f"#{dn}"),
                            "given_name": drv.get("first_name", ""),
                            "team_name": drv.get("team_name", ""),
                            "time": time_str,
                        }
                    )
                return {"results": results, "available": len(results) > 0}

        endpoint_map = {
            "race": f"{JOLPICA_BASE_URL}/{year}/circuits/{circuit_id}/results.json",
            "quali": f"{JOLPICA_BASE_URL}/{year}/circuits/{circuit_id}/qualifying.json",
            "sprint": f"{JOLPICA_BASE_URL}/{year}/circuits/{circuit_id}/sprint.json",
        }
        url = endpoint_map.get(session)
        if not url:
            raise HTTPException(status_code=400, detail=f"Unknown session: {session}")

        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            races = resp.json().get("MRData", {}).get("RaceTable", {}).get("Races", [])
            if not races:
                return {"results": [], "available": False}

            race = races[0]
            if session == "race":
                raw = race.get("Results", [])
                results = []
                for r in raw:
                    is_finished = r.get("status", "").startswith("Finished") or bool(
                        __import__("re").match(r"^\+\d+ Lap", r.get("status", ""))
                    )
                    finish_time = (
                        r.get("Time", {}).get("time") if is_finished else r.get("status")
                    )
                    results.append(
                        {
                            "position": r.get("position"),
                            "driver_id": r.get("Driver", {}).get("driverId"),
                            "family_name": r.get("Driver", {}).get("familyName"),
                            "given_name": r.get("Driver", {}).get("givenName"),
                            "team": r.get("Constructor", {}).get("name"),
                            "status": r.get("status"),
                            "is_finished": is_finished,
                            "time": finish_time,
                        }
                    )
            elif session == "sprint":
                raw = race.get("SprintResults", [])
                results = []
                for r in raw:
                    is_finished = r.get("status", "").startswith("Finished") or bool(
                        __import__("re").match(r"^\+\d+ Lap", r.get("status", ""))
                    )
                    finish_time = (
                        r.get("Time", {}).get("time") if is_finished else r.get("status")
                    )
                    results.append(
                        {
                            "position": r.get("position"),
                            "driver_id": r.get("Driver", {}).get("driverId"),
                            "family_name": r.get("Driver", {}).get("familyName"),
                            "given_name": r.get("Driver", {}).get("givenName"),
                            "team": r.get("Constructor", {}).get("name"),
                            "is_finished": is_finished,
                            "time": finish_time,
                        }
                    )
            else:
                raw = race.get("QualifyingResults", [])
                results = []
                for r in raw:
                    best_time = r.get("Q3") or r.get("Q2") or r.get("Q1") or "N/A"
                    results.append(
                        {
                            "position": r.get("position"),
                            "driver_id": r.get("Driver", {}).get("driverId"),
                            "family_name": r.get("Driver", {}).get("familyName"),
                            "given_name": r.get("Driver", {}).get("givenName"),
                            "team": r.get("Constructor", {}).get("name"),
                            "time": best_time,
                            "q1": r.get("Q1"),
                            "q2": r.get("Q2"),
                            "q3": r.get("Q3"),
                        }
                    )

            return {"results": results, "available": len(results) > 0}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
