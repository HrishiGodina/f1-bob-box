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
