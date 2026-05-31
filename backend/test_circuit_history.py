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
    assert all(1929 <= v <= CURRENT_SEASON for v in CIRCUIT_REDESIGN_YEAR.values())

def test_available_years_known_circuit():
    circuit_id = "silverstone"
    start = CIRCUIT_REDESIGN_YEAR[circuit_id]
    years = list(range(start, CURRENT_SEASON))
    assert years[0] == 2010
    assert years[-1] == CURRENT_SEASON - 1
    assert CURRENT_SEASON not in years  # only completed seasons

def test_available_years_unknown_circuit():
    circuit_id = "some_new_circuit"
    start = CIRCUIT_REDESIGN_YEAR.get(circuit_id, CURRENT_SEASON - DEFAULT_HISTORY_WINDOW)
    years = list(range(start, CURRENT_SEASON))
    assert len(years) == DEFAULT_HISTORY_WINDOW
    assert years[-1] == 2025

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_circuit_endpoint_returns_available_years():
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
        respx.get("https://api.jolpi.ca/ergast/f1/circuits/silverstone.json").mock(
            return_value=httpx.Response(200, json=mock_circuit_resp)
        )
        respx.get("https://api.jolpi.ca/ergast/f1/2024/circuits/silverstone/results.json").mock(
            return_value=httpx.Response(200, json=mock_results_resp)
        )
        response = client.get("/api/circuit/silverstone?season=2025")
    assert response.status_code == 200
    body = response.json()
    assert "available_years" in body
    assert 2025 not in body["available_years"]  # only completed seasons
    assert body["available_years"][0] == CIRCUIT_REDESIGN_YEAR["silverstone"]
