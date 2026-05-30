from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from datetime import datetime, timedelta, timezone
from typing import Optional

app = FastAPI(title="F1 Dashboard API")

# Indian Standard Time (IST) - UTC+5:30
IST = timezone(timedelta(hours=5, minutes=30))

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origin
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OPENF1_BASE_URL = "https://api.openf1.org/v1"
JOLPICA_BASE_URL = "https://api.jolpi.ca/ergast/f1"
ESPN_NEWS_URL = "https://site.api.espn.com/apis/site/v2/sports/racing/f1/news"

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
}
DEFAULT_HISTORY_WINDOW = 10

@app.get("/api/status")
async def get_status(mock: bool = False):
    """
    Checks if there is a live F1 session happening.
    A session is considered live if the current time is within [start_time - 30m, end_time + 30m].
    Timezone used: IST (UTC+5:30).
    """
    if mock:
        return {
            "is_live": True,
            "session_type": "Race",
            "session_name": "Mock Grand Prix",
            "session_key": 9500, # Example session key
            "meeting_key": 1217
        }

    try:
        async with httpx.AsyncClient() as client:
            # Get the latest session
            response = await client.get(f"{OPENF1_BASE_URL}/sessions?session_key=latest")
            response.raise_for_status()
            sessions = response.json()
            
            if not sessions:
                return {"is_live": False, "message": "No session data found"}

            latest_session = sessions[0]
            start_time_str = latest_session.get("date_start")
            end_time_str = latest_session.get("date_end")
            
            if not start_time_str:
                return {"is_live": False, "message": "Session start time missing"}

            # OpenF1 returns ISO format: 2024-03-02T15:00:00
            # We assume it's UTC or has offset
            start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
            
            # If end_time is missing, assume it lasts 2 hours for now
            if end_time_str:
                end_time = datetime.fromisoformat(end_time_str.replace("Z", "+00:00"))
            else:
                end_time = start_time + timedelta(hours=2)

            now = datetime.now(IST)
            
            live_start = start_time - timedelta(minutes=30)
            live_end = end_time + timedelta(minutes=30)
            
            is_live = live_start <= now <= live_end
            
            return {
                "is_live": is_live,
                "session_type": latest_session.get("session_type"),
                "session_name": latest_session.get("session_name"),
                "session_key": latest_session.get("session_key"),
                "meeting_key": latest_session.get("meeting_key"),
                "start_time": start_time_str,
                "end_time": end_time_str,
                "now": now.isoformat()
            }
    except Exception as e:
        # Fallback if API is down
        return {"is_live": False, "error": str(e)}

@app.get("/api/idle-data")
async def get_idle_data():
    """
    Fetches standings and news for the idle dashboard.
    """
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Fetch Driver Standings
            try:
                standings_resp = await client.get(f"{JOLPICA_BASE_URL}/current/driverStandings.json")
                standings_resp.raise_for_status()
                standings_data = standings_resp.json()
            except Exception as e:
                print(f"Error fetching driver standings: {e}")
                standings_data = {"MRData": {"StandingsTable": {"StandingsLists": []}}}

            # Fetch Constructor Standings
            try:
                constructor_resp = await client.get(f"{JOLPICA_BASE_URL}/current/constructorStandings.json")
                constructor_resp.raise_for_status()
                constructor_data = constructor_resp.json()
            except Exception as e:
                print(f"Error fetching constructor standings: {e}")
                constructor_data = {"MRData": {"StandingsTable": {"StandingsLists": []}}}
            
            # Fetch News from ESPN
            try:
                news_resp = await client.get(ESPN_NEWS_URL)
                news_resp.raise_for_status()
                news_data = news_resp.json()
            except Exception as e:
                print(f"Error fetching news: {e}")
                news_data = {"articles": []}
            
            # Fetch Full Season Schedule
            try:
                schedule_resp = await client.get(f"{JOLPICA_BASE_URL}/current.json")
                schedule_resp.raise_for_status()
                schedule_data = schedule_resp.json()
            except Exception as e:
                print(f"Error fetching schedule: {e}")
                schedule_data = {"MRData": {"RaceTable": {"Races": []}}}

            # Fetch Next Race info
            try:
                next_race_resp = await client.get(f"{JOLPICA_BASE_URL}/current/next.json")
                next_race_resp.raise_for_status()
                next_race_data = next_race_resp.json()
            except Exception as e:
                print(f"Error fetching next race: {e}")
                next_race_data = {"MRData": {"RaceTable": {"Races": [{}]}}}

            return {
                "driver_standings": standings_data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [{}])[0].get("DriverStandings", []) if standings_data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists") else [],
                "constructor_standings": constructor_data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [{}])[0].get("ConstructorStandings", []) if constructor_data.get("MRData", {}).get("StandingsTable", {}).get("StandingsLists") else [],
                "news": news_data.get("articles", []),
                "schedule": schedule_data.get("MRData", {}).get("RaceTable", {}).get("Races", []),
                "next_race": next_race_data.get("MRData", {}).get("RaceTable", {}).get("Races", [{}])[0]
            }
    except Exception as e:
        print(f"Global error in get_idle_data: {e}")
        return {
            "driver_standings": [],
            "constructor_standings": [],
            "news": [],
            "schedule": [],
            "next_race": {}
        }

@app.get("/api/live-data")
async def get_live_data(session_key: int, driver_number: Optional[int] = None):
    """
    Fetches live telemetry and interval data for a session.
    """
    try:
        async with httpx.AsyncClient() as client:
            # 1. Fetch Leaderboard (Intervals) - Get latest intervals for all drivers
            intervals_resp = await client.get(f"{OPENF1_BASE_URL}/intervals?session_key={session_key}")
            intervals = intervals_resp.json()

            # 2. Fetch Driver Positions
            pos_resp = await client.get(f"{OPENF1_BASE_URL}/position?session_key={session_key}")
            positions = pos_resp.json()

            # 3. Fetch Car Data (Telemetry) for a specific driver if provided, else maybe top 3
            telemetry = []
            if driver_number:
                tel_resp = await client.get(f"{OPENF1_BASE_URL}/car_data?session_key={session_key}&driver_number={driver_number}")
                telemetry = tel_resp.json()[-50:] # Last 50 points for a small trace
            
            # 4. Fetch Driver Info (to map driver numbers to names)
            drivers_resp = await client.get(f"{OPENF1_BASE_URL}/drivers?session_key={session_key}")
            drivers = drivers_resp.json()

            return {
                "intervals": intervals[-20:] if intervals else [], # Latest intervals
                "positions": positions[-20:] if positions else [], # Latest positions
                "telemetry": telemetry,
                "drivers": {d["driver_number"]: d for d in drivers}
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/location")
async def get_location(session_key: int):
    """
    Fetches the latest locations for all drivers.
    """
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{OPENF1_BASE_URL}/location?session_key={session_key}")
            locations = resp.json()
            # Return only the latest location for each driver to reduce payload
            latest_locs = {}
            for loc in locations:
                latest_locs[loc["driver_number"]] = loc
            return list(latest_locs.values())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/milestones")
async def get_milestones():
    """
    Calculate stats to be beaten for the upcoming race.
    Simplified version for prototype.
    """
    try:
        async with httpx.AsyncClient() as client:
            # Get next race
            next_resp = await client.get(f"{JOLPICA_BASE_URL}/current/next.json")
            next_data = next_resp.json()
            next_race = next_data.get("MRData", {}).get("RaceTable", {}).get("Races", [{}])[0]
            circuit_id = next_race.get("Circuit", {}).get("circuitId")
            
            # In a real app, we'd query historical wins for this circuitId
            # and compare with current driver wins. 
            # For now, return some hardcoded interesting stats based on the circuit.
            
            return {
                "circuit_name": next_race.get("Circuit", {}).get("circuitName"),
                "milestones": [
                    {"driver": "Lewis Hamilton", "stat": "Most wins at this circuit", "value": "8", "target": "9"},
                    {"driver": "Max Verstappen", "stat": "Podium streak", "value": "5", "target": "6"},
                    {"team": "Red Bull", "stat": "Consecutive wins", "value": "11", "target": "12"}
                ]
            }
    except Exception as e:
        return {"error": str(e)}

# Fallback Championship Data (Top Drivers/Constructors)
CHAMPIONSHIPS = {
    "hamilton": 7, "michael_schumacher": 7, "vettel": 4, "prost": 4, 
    "senna": 3, "max_verstappen": 3, "alonso": 2, "lauda": 3, 
    "piquet": 3, "jack_brabham": 3, "stewart": 3, "fangio": 5,
    "ferrari": 16, "williams": 9, "mclaren": 8, "mercedes": 8, "red_bull": 6, "lotus_f1": 7
}

@app.get("/api/driver/{driver_id}/stats")
async def get_driver_stats(driver_id: str):
    """
    Fetches career statistics for a specific driver.
    """
    try:
        async with httpx.AsyncClient() as client:
            # 1. Basic Info
            info_resp = await client.get(f"{JOLPICA_BASE_URL}/drivers/{driver_id}.json")
            info_data = info_resp.json().get("MRData", {}).get("DriverTable", {}).get("Drivers", [])
            if not info_data:
                raise HTTPException(status_code=404, detail="Driver not found")
            info = info_data[0]

            # 2. Total Wins
            wins_resp = await client.get(f"{JOLPICA_BASE_URL}/drivers/{driver_id}/results/1.json")
            wins = wins_resp.json().get("MRData", {}).get("total", "0")

            # 3. Championships
            # Attempt API first, fallback to lookup
            champ_count = 0
            try:
                # Some API versions might support this, but Jolpica /ergast is strict.
                # We'll check if the driver is in our top champions list first for accuracy.
                champ_count = CHAMPIONSHIPS.get(driver_id, 0)
                if champ_count == 0:
                    champs_resp = await client.get(f"{JOLPICA_BASE_URL}/drivers/{driver_id}/driverStandings/1.json")
                    champs = champs_resp.json().get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])
                    champ_count = len(champs)
            except:
                pass

            # 4. Career Teams
            teams_resp = await client.get(f"{JOLPICA_BASE_URL}/drivers/{driver_id}/constructors.json")
            teams = teams_resp.json().get("MRData", {}).get("ConstructorTable", {}).get("Constructors", [])

            return {
                "info": info,
                "wins": wins,
                "championships": champ_count,
                "career_teams": teams
            }
    except Exception as e:
        print(f"Error in get_driver_stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/constructor/{constructor_id}/stats")
async def get_constructor_stats(constructor_id: str):
    """
    Fetches career statistics for a specific constructor.
    """
    try:
        async with httpx.AsyncClient() as client:
            # 1. Basic Info
            info_resp = await client.get(f"{JOLPICA_BASE_URL}/constructors/{constructor_id}.json")
            info_data = info_resp.json().get("MRData", {}).get("ConstructorTable", {}).get("Constructors", [])
            if not info_data:
                raise HTTPException(status_code=404, detail="Constructor not found")
            info = info_data[0]

            # 2. Total Wins
            wins_resp = await client.get(f"{JOLPICA_BASE_URL}/constructors/{constructor_id}/results/1.json")
            wins = wins_resp.json().get("MRData", {}).get("total", "0")

            # 3. Championships
            champ_count = CHAMPIONSHIPS.get(constructor_id, 0)
            if champ_count == 0:
                try:
                    champs_resp = await client.get(f"{JOLPICA_BASE_URL}/constructors/{constructor_id}/constructorStandings/1.json")
                    champs = champs_resp.json().get("MRData", {}).get("StandingsTable", {}).get("StandingsLists", [])
                    champ_count = len(champs)
                except:
                    pass

            return {
                "info": info,
                "wins": wins,
                "championships": champ_count
            }
    except Exception as e:
        print(f"Error in get_constructor_stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/circuit/{circuit_id}")
async def get_circuit_details(circuit_id: str, season: int = 2026, round: int = 1):
    """
    Fetches detailed info about a circuit and historical data for a specific round.
    """
    try:
        async with httpx.AsyncClient() as client:
            # 1. Circuit Info
            circ_resp = await client.get(f"{JOLPICA_BASE_URL}/circuits/{circuit_id}.json")
            circuit = circ_resp.json().get("MRData", {}).get("CircuitTable", {}).get("Circuits", [{}])[0]

            # 2. Historical Results (Previous Year)
            prev_results = []
            try:
                res_resp = await client.get(f"{JOLPICA_BASE_URL}/{season-1}/circuits/{circuit_id}/results.json")
                prev_results = res_resp.json().get("MRData", {}).get("RaceTable", {}).get("Races", [{}])[0].get("Results", [])
            except:
                pass

            # 3. Elevation Profile & Corner Count (Mocked based on ID for visual impact)
            # In a real app, this would be from a database or geo-API
            corners = 19
            elevation_max = 40
            if "monaco" in circuit_id: corners, elevation_max = 19, 42
            elif "spa" in circuit_id: corners, elevation_max = 20, 102
            elif "monza" in circuit_id: corners, elevation_max = 11, 12
            elif "silverstone" in circuit_id: corners, elevation_max = 18, 11
            
            return {
                "circuit": circuit,
                "prev_results": prev_results[:10],
                "stats": {
                    "corners": corners,
                    "elevation_gain": elevation_max,
                    "laps": 78 if "monaco" in circuit_id else 53,
                    "lap_record": "1:10.166" if "monaco" in circuit_id else "1:21.046"
                },
                "upgrades": [
                    {"team": "Mercedes", "item": "Front Wing Endplate", "impact": "High"},
                    {"team": "Red Bull", "item": "Floor Edge", "impact": "Medium"},
                    {"team": "Ferrari", "item": "Rear Brake Duct", "impact": "Low"}
                ]
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
