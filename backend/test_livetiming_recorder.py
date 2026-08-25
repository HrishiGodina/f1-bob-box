import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from livetiming.recorder import load_fixture, record_snapshot, record_topic


def test_record_topic_then_load_fixture_roundtrips(tmp_path):
    path = str(tmp_path / "sample.jsonl")
    record_topic(path, "TrackStatus", {"Status": "1"}, "2026-07-26T13:00:00.000Z")
    record_topic(path, "TrackStatus", {"Status": "2"}, "2026-07-26T13:00:05.000Z")
    records = list(load_fixture(path))
    assert records == [
        {"topic": "TrackStatus", "payload": {"Status": "1"}, "timestamp": "2026-07-26T13:00:00.000Z"},
        {"topic": "TrackStatus", "payload": {"Status": "2"}, "timestamp": "2026-07-26T13:00:05.000Z"},
    ]


def test_record_snapshot_writes_one_line_per_topic(tmp_path):
    path = str(tmp_path / "sample.jsonl")
    record_snapshot(path, {"TrackStatus": {"Status": "1"}, "WeatherData": {"AirTemp": "28.4"}})
    records = list(load_fixture(path))
    topics = {r["topic"] for r in records}
    assert topics == {"TrackStatus", "WeatherData"}
    assert all(r["timestamp"] is None for r in records)


from livetiming.state import LiveSessionState
from livetiming.recorder import replay_fixture


async def test_replay_fixture_drives_the_real_decode_and_merge_pipeline(tmp_path):
    path = str(tmp_path / "sample.jsonl")
    record_topic(path, "TrackStatus", {"Status": "1"}, "t")
    record_topic(path, "TimingData", {"Lines": {"1": {"Sectors": [{"Value": "28.312"}, {"Value": "31.001"}]}}}, "t")
    record_topic(path, "TimingData", {"Lines": {"1": {"Sectors": {"1": {"Value": "30.500"}}}}}, "t")

    state = LiveSessionState()
    patches = []

    async def on_patch(patch):
        patches.append(patch)

    await replay_fixture(path, state, on_patch)

    assert len(patches) == 3
    timing = state._derive_timing()
    assert timing["1"]["sectors"][0]["Value"] == "28.312"
    assert timing["1"]["sectors"][1]["Value"] == "30.500"


FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "live_timing_sample.jsonl")


async def test_sample_fixture_replays_end_to_end_through_real_pipeline():
    state = LiveSessionState()
    state.set_connection_status("connected")
    patches = []

    async def on_patch(patch):
        patches.append(patch)

    await replay_fixture(FIXTURE_PATH, state, on_patch)

    assert len(patches) == 12
    snap = state.snapshot()

    assert snap["drivers"]["1"]["team_colour"] == "#3671C6"
    assert snap["drivers"]["44"]["tla"] == "HAM"

    timing = snap["timing"]
    assert timing["1"]["sectors"][0]["Value"] == "28.312", "sector 0 untouched by the later delta"
    assert timing["1"]["sectors"][1]["Value"] == "30.500", "sector 1 patched by the delta line"
    assert timing["1"]["sectors"][1]["PersonalFastest"] is True
    assert timing["1"]["tyre_compound"] == "SOFT"

    tel = snap["telemetry"]
    assert tel["1"] == {"rpm": 11500, "speed": 298, "gear": 7, "throttle": 87, "brake": 0, "drs": 1}
    assert tel["44"] == {"rpm": 10800, "speed": 285, "gear": 6, "throttle": 100, "brake": 0, "drs": 0}

    pos = snap["positions"]
    assert pos["1"] == {"x": 123, "y": 456, "z": 0, "status": "OnTrack"}
    assert pos["44"] == {"x": 789, "y": 1011, "z": 0, "status": "OnTrack"}

    rc = snap["race_control"]
    assert rc[0]["Message"] == "YELLOW FLAG SECTOR 2", "newest-first"
    assert rc[1]["Message"] == "GREEN LIGHT - PIT EXIT OPEN"

    assert snap["weather"]["AirTemp"] == "28.4"
    assert snap["track_status"] == {"Status": "1", "Message": "AllClear"}
    assert snap["is_live"] is True
