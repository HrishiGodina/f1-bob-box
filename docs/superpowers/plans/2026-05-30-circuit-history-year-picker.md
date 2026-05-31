# Circuit Historical Results Year Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact year picker to the `CircuitDetailsModal` results card so users can browse race results for any season since the circuit's last major redesign.

**Architecture:** Backend gains a `season` query param and a `CIRCUIT_REDESIGN_YEAR` map that determines how far back history goes; it returns `available_years` in the response. Frontend adds three new state vars to `CircuitDetailsModal` — `selectedYear`, `yearResults`, `yearLoading` — and renders a pill-style year selector that fires a targeted re-fetch on change.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript/Tailwind (frontend), axios (HTTP client), existing Jolpica-F1 API.

---

## Files

| Action | File | Change |
|--------|------|--------|
| Modify | `backend/main.py` | Add `CIRCUIT_REDESIGN_YEAR` dict, `season` param, `available_years` in response |
| Modify | `frontend/src/App.tsx` | Add year picker state + UI inside `CircuitDetailsModal` |
| Create | `backend/test_circuit_history.py` | pytest tests for the backend changes |

---

## Task 1: Add `CIRCUIT_REDESIGN_YEAR` and `available_years` to backend

**Files:**
- Modify: `backend/main.py`
- Create: `backend/test_circuit_history.py`

- [ ] **Step 1: Write the failing test**

Create `backend/test_circuit_history.py`:

```python
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from main import CIRCUIT_REDESIGN_YEAR, DEFAULT_HISTORY_WINDOW

CURRENT_SEASON = 2026

def test_redesign_year_map_has_known_circuits():
    assert "silverstone" in CIRCUIT_REDESIGN_YEAR
    assert "monaco" in CIRCUIT_REDESIGN_YEAR
    assert "bahrain" in CIRCUIT_REDESIGN_YEAR
    assert CIRCUIT_REDESIGN_YEAR["silverstone"] == 2010
    assert CIRCUIT_REDESIGN_YEAR["jeddah"] == 2021

def test_available_years_known_circuit():
    circuit_id = "silverstone"
    start = CIRCUIT_REDESIGN_YEAR[circuit_id]
    years = list(range(start, CURRENT_SEASON))
    assert years[0] == 2010
    assert years[-1] == 2025
    assert CURRENT_SEASON not in years  # only completed seasons

def test_available_years_unknown_circuit():
    circuit_id = "some_new_circuit"
    start = CIRCUIT_REDESIGN_YEAR.get(circuit_id, CURRENT_SEASON - DEFAULT_HISTORY_WINDOW)
    years = list(range(start, CURRENT_SEASON))
    assert len(years) == DEFAULT_HISTORY_WINDOW
    assert years[-1] == 2025
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && source venv/bin/activate && pip install pytest -q && pytest test_circuit_history.py::test_redesign_year_map_has_known_circuits -v
```

Expected: `ImportError` or `AttributeError` — `CIRCUIT_REDESIGN_YEAR` does not exist yet.

- [ ] **Step 3: Add the constants to `backend/main.py`**

After the line `JOLPICA_BASE_URL = ...` (around line 23), insert:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && source venv/bin/activate && pytest test_circuit_history.py -v
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_circuit_history.py
git commit -m "feat: add CIRCUIT_REDESIGN_YEAR map and tests"
```

---

## Task 2: Add `season` param and `available_years` to the circuit endpoint

**Files:**
- Modify: `backend/main.py:329-373` (the `get_circuit_details` function)
- Modify: `backend/test_circuit_history.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/test_circuit_history.py`:

```python
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_circuit_endpoint_returns_available_years(respx_mock=None):
    """Integration smoke test — hits the real endpoint shape with mocked upstream."""
    import respx, httpx
    circuit_id = "silverstone"
    mock_circuit_resp = {
        "MRData": {"CircuitTable": {"Circuits": [{"circuitId": "silverstone", "circuitName": "Silverstone"}]}}
    }
    mock_results_resp = {
        "MRData": {"RaceTable": {"Races": [{"Results": [
            {"position": "1", "Driver": {"driverId": "hamilton", "familyName": "Hamilton"}, "Constructor": {"name": "Mercedes"}}
        ]}]}}
    }
    with respx.mock:
        respx.get(f"https://api.jolpi.ca/ergast/f1/circuits/silverstone.json").mock(
            return_value=httpx.Response(200, json=mock_circuit_resp)
        )
        respx.get(f"https://api.jolpi.ca/ergast/f1/2024/circuits/silverstone/results.json").mock(
            return_value=httpx.Response(200, json=mock_results_resp)
        )
        response = client.get(f"/api/circuit/silverstone?season=2025")
    assert response.status_code == 200
    body = response.json()
    assert "available_years" in body
    assert 2025 not in body["available_years"]  # only completed seasons (season-1 = 2024 is last)
    assert body["available_years"][0] == CIRCUIT_REDESIGN_YEAR["silverstone"]
```

- [ ] **Step 2: Install respx and run test to verify it fails**

```bash
cd backend && source venv/bin/activate && pip install respx pytest-asyncio -q && pytest test_circuit_history.py::test_circuit_endpoint_returns_available_years -v
```

Expected: FAIL — `available_years` key not in response.

- [ ] **Step 3: Update `get_circuit_details` in `backend/main.py`**

Replace the function signature and body (lines 329–373) with:

```python
@app.get("/api/circuit/{circuit_id}")
async def get_circuit_details(circuit_id: str, season: int = 2026):
    """
    Fetches detailed info about a circuit and historical data for the given season.
    Pass season=2026 to get 2025 results (season-1). Returns available_years list.
    """
    try:
        current_season = 2026
        async with httpx.AsyncClient() as client:
            # 1. Circuit Info
            circ_resp = await client.get(f"{JOLPICA_BASE_URL}/circuits/{circuit_id}.json")
            circuit = circ_resp.json().get("MRData", {}).get("CircuitTable", {}).get("Circuits", [{}])[0]

            # 2. Historical Results for requested season (fetch season-1 results)
            results_season = season - 1
            prev_results = []
            try:
                res_resp = await client.get(f"{JOLPICA_BASE_URL}/{results_season}/circuits/{circuit_id}/results.json")
                prev_results = res_resp.json().get("MRData", {}).get("RaceTable", {}).get("Races", [{}])[0].get("Results", [])
            except:
                pass

            # 3. Available years (redesign year → last completed season)
            start_year = CIRCUIT_REDESIGN_YEAR.get(circuit_id, current_season - DEFAULT_HISTORY_WINDOW)
            available_years = list(range(start_year, current_season))  # excludes current_season

            # 4. Stats (mocked per circuit)
            corners = 19
            elevation_max = 40
            if "monaco" in circuit_id: corners, elevation_max = 19, 42
            elif "spa" in circuit_id: corners, elevation_max = 20, 102
            elif "monza" in circuit_id: corners, elevation_max = 11, 12
            elif "silverstone" in circuit_id: corners, elevation_max = 18, 11

            return {
                "circuit": circuit,
                "prev_results": prev_results[:10],
                "available_years": available_years,
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
```

- [ ] **Step 4: Run all backend tests**

```bash
cd backend && source venv/bin/activate && pytest test_circuit_history.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/test_circuit_history.py
git commit -m "feat: circuit endpoint accepts season param, returns available_years"
```

---

## Task 3: Add year picker state and UI to `CircuitDetailsModal`

**Files:**
- Modify: `frontend/src/App.tsx` — `CircuitDetailsModal` component (lines 324–409)

No frontend test runner is configured — verify manually in the browser after this task.

- [ ] **Step 1: Add three state vars inside `CircuitDetailsModal`**

In `frontend/src/App.tsx`, find `CircuitDetailsModal` (line 324). After the existing state declarations:

```tsx
const [data, setData] = useState<any>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState(false);
```

Add:

```tsx
const [selectedYear, setSelectedYear] = useState<number | null>(null);
const [yearResults, setYearResults] = useState<any[]>([]);
const [yearLoading, setYearLoading] = useState(false);
```

- [ ] **Step 2: Seed `selectedYear` and `yearResults` from the initial fetch**

Replace the `.then(res => setData(res.data))` line in the `useEffect` with:

```tsx
.then(res => {
  setData(res.data);
  const years: number[] = res.data.available_years || [];
  if (years.length > 0) {
    const latest = years[years.length - 1];
    setSelectedYear(latest);
    setYearResults(res.data.prev_results || []);
  }
})
```

- [ ] **Step 3: Add a `useEffect` to re-fetch on year change**

After the existing `useEffect` (after line 338), add:

```tsx
useEffect(() => {
  if (!isOpen || !circuit?.circuitId || selectedYear === null) return;
  if (!data) return; // initial load not done yet
  const initialYear = data.available_years?.[data.available_years.length - 1];
  if (selectedYear === initialYear) return; // already seeded from initial fetch
  setYearLoading(true);
  axios.get(`${API_BASE}/circuit/${circuit.circuitId}?season=${selectedYear + 1}`)
    .then(res => setYearResults(res.data.prev_results || []))
    .catch(() => setYearResults([]))
    .finally(() => setYearLoading(false));
}, [selectedYear]);
```

- [ ] **Step 4: Replace the hardcoded heading with the year picker**

Find this block inside the JSX (around line 384–398):

```tsx
<div className="mkbhd-card p-10 bg-mkbhd-red/5 border-mkbhd-red/20">
   <h4 className="text-xs font-black uppercase tracking-[0.4em] text-mkbhd-red mb-8">{prevYear} Race Results</h4>
   <div className="space-y-6">
      {data.prev_results.slice(0, 5).map((r: any) => (
        <div key={r.Driver?.driverId || r.position} className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0">
           <div className="flex items-center gap-4">
              <span className="text-xl font-black italic text-white/20">P{r.position}</span>
              <div className="font-black uppercase italic text-sm">{r.Driver?.familyName}</div>
           </div>
           <div className="text-[10px] font-bold text-mkbhd-gray">{r.Constructor?.name}</div>
        </div>
      ))}
      {!data.prev_results?.length && <div className="text-mkbhd-gray italic text-sm">No results available</div>}
   </div>
</div>
```

Replace it with:

```tsx
<div className="mkbhd-card p-10 bg-mkbhd-red/5 border-mkbhd-red/20">
  <div className="flex items-center justify-between mb-8">
    <h4 className="text-xs font-black uppercase tracking-[0.4em] text-mkbhd-red">Race Results</h4>
    {data.available_years?.length > 0 && (
      <select
        value={selectedYear ?? ''}
        onChange={e => setSelectedYear(Number(e.target.value))}
        className="bg-white/10 text-white text-[10px] font-black uppercase tracking-widest border border-white/10 rounded-lg px-3 py-1.5 cursor-pointer focus:outline-none focus:border-mkbhd-red"
      >
        {[...data.available_years].reverse().map((y: number) => (
          <option key={y} value={y} className="bg-mkbhd-studio text-white">{y}</option>
        ))}
      </select>
    )}
  </div>
  <div className="space-y-6">
    {yearLoading ? (
      <div className="text-mkbhd-red animate-pulse font-black italic text-sm">LOADING...</div>
    ) : yearResults.length > 0 ? (
      yearResults.slice(0, 5).map((r: any) => (
        <div key={r.Driver?.driverId || r.position} className="flex items-center justify-between border-b border-white/5 pb-4 last:border-0">
          <div className="flex items-center gap-4">
            <span className="text-xl font-black italic text-white/20">P{r.position}</span>
            <div className="font-black uppercase italic text-sm">{r.Driver?.familyName}</div>
          </div>
          <div className="text-[10px] font-bold text-mkbhd-gray">{r.Constructor?.name}</div>
        </div>
      ))
    ) : (
      <div className="text-mkbhd-gray italic text-sm">
        {data.available_years?.length === 0 ? 'No historical data' : 'NO DATA'}
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 5: Remove the now-unused `prevYear` variable**

Find and delete this line in `CircuitDetailsModal` (around line 340):

```tsx
const prevYear = new Date().getFullYear() - 1;
```

- [ ] **Step 6: Build check**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: build completes with no TypeScript errors.

- [ ] **Step 7: Manual browser verification**

Start the app:
```bash
./run-dashboard.sh
```

Open `http://localhost:5173`. Click any completed race in "This Season". In the modal's right column:
- Confirm year picker dropdown appears with years in descending order
- Confirm the most recent year is selected by default with results showing
- Change to an older year — results list should update (brief LOADING... flash)
- Change to a year with no data — should show "NO DATA"
- Confirm the rest of the modal (stats, elevation, upgrades) does not flicker or reload on year change
- Close and reopen a different circuit — confirm year picker resets to most recent year

- [ ] **Step 8: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: year picker in CircuitDetailsModal for historical race results"
```
