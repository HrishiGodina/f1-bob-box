import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from fastapi.testclient import TestClient

from main import app

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "live_timing_sample.jsonl")


def test_ws_live_sends_initial_snapshot_on_connect():
    with TestClient(app) as client:  # runs lifespan; LIVETIMING_AUTOSTART=0 via conftest.py
        with client.websocket_connect("/ws/live") as ws:
            snapshot = ws.receive_json()
            assert snapshot == {
                "connection_status": "disconnected", "is_live": False,
                "session_info": {}, "drivers": {}, "timing": {}, "positions": {},
                "telemetry": {}, "track_status": {}, "race_control": [], "weather": {},
            }


def test_status_reports_not_live_with_no_connection():
    with TestClient(app) as client:
        response = client.get("/api/status")
        assert response.status_code == 200
        assert response.json() == {"is_live": False}


def test_status_has_no_leftover_mock_or_session_fields():
    with TestClient(app) as client:
        response = client.get("/api/status")
        body = response.json()
        assert set(body.keys()) == {"is_live"}


def test_deleted_routes_are_gone():
    with TestClient(app) as client:
        assert client.get("/api/live-data", params={"session_key": 1}).status_code == 404
        assert client.get("/api/location", params={"session_key": 1}).status_code == 404


def test_livetiming_replay_flows_end_to_end_into_ws_live_and_status(monkeypatch):
    # conftest.py forces LIVETIMING_AUTOSTART=0 globally so importing main.py
    # never starts a real network connection during unrelated test runs
    # (e.g. test_circuit_history.py). This test explicitly re-enables it and
    # points it at the fixture — monkeypatch reverts both after the test.
    monkeypatch.setenv("LIVETIMING_AUTOSTART", "1")
    monkeypatch.setenv("LIVETIMING_REPLAY", FIXTURE_PATH)

    with TestClient(app) as client:
        with client.websocket_connect("/ws/live") as ws:
            merged = {}
            # One full replay lap is 12 fixture patches + 1 connection-status
            # patch; whether our connect-time snapshot already reflects a
            # completed lap (racy — see Task 6 header) or arrives interleaved
            # with broadcasts, this bound is generous enough either way and
            # still finite, so a wiring bug fails fast instead of hanging.
            for _ in range(13):
                merged.update(ws.receive_json())
                if merged.get("race_control") and "44" in merged.get("drivers", {}):
                    break

        assert merged["is_live"] is True
        assert merged["drivers"]["1"]["tla"] == "VER"
        assert merged["drivers"]["44"]["tla"] == "HAM"
        assert merged["timing"]["1"]["position"] == "1"
        # the fixture's second TimingData line is an index-keyed sector
        # delta (Task 2's merge_delta) — sector index 1 must show the patch,
        # not the original snapshot value.
        assert merged["timing"]["1"]["sectors"][1]["PersonalFastest"] is True
        assert merged["telemetry"]["1"]["speed"] == 298
        assert merged["positions"]["44"]["x"] == 789
        # race control newest-first (Task 3's _derive_race_control)
        assert merged["race_control"][0]["Message"] == "YELLOW FLAG SECTOR 2"
        assert merged["race_control"][1]["Message"] == "GREEN LIGHT - PIT EXIT OPEN"

        status_response = client.get("/api/status")
        assert status_response.json() == {"is_live": True}
