import os
import sys
import time

sys.path.insert(0, os.path.dirname(__file__))

from livetiming.state import merge_delta


def test_merge_delta_merges_plain_dicts():
    target = {"a": 1, "b": 2}
    delta = {"b": 3, "c": 4}
    assert merge_delta(target, delta) == {"a": 1, "b": 3, "c": 4}


def test_merge_delta_does_not_mutate_target():
    target = {"a": {"b": 1}}
    merge_delta(target, {"a": {"b": 2}})
    assert target == {"a": {"b": 1}}


def test_merge_delta_patches_list_element_by_index():
    target = [{"Value": "28.312"}, {"Value": "31.001"}]
    delta = {"1": {"Value": "30.500"}}
    result = merge_delta(target, delta)
    assert result == [{"Value": "28.312"}, {"Value": "30.500"}]
    assert target == [{"Value": "28.312"}, {"Value": "31.001"}], "target must be untouched"


def test_merge_delta_extends_list_with_none_past_current_end():
    target = [{"Message": "GREEN"}]
    delta = {"2": {"Message": "YELLOW"}}
    result = merge_delta(target, delta)
    assert result == [{"Message": "GREEN"}, None, {"Message": "YELLOW"}]


def test_merge_delta_patches_nested_index_keyed_structure():
    target = {
        "Lines": {
            "1": {
                "Sectors": [
                    {"Value": "28.312", "PersonalFastest": False},
                    {"Value": "31.001", "PersonalFastest": False},
                ]
            }
        }
    }
    delta = {"Lines": {"1": {"Sectors": {"1": {"Value": "30.500", "PersonalFastest": True}}}}}
    result = merge_delta(target, delta)
    sectors = result["Lines"]["1"]["Sectors"]
    assert sectors[0] == {"Value": "28.312", "PersonalFastest": False}, "sector 0 untouched"
    assert sectors[1] == {"Value": "30.500", "PersonalFastest": True}


def test_merge_delta_strips_kf_noise_key_at_every_depth():
    target = {"Lines": {"1": {"Position": "1"}}, "_kf": True}
    delta = {"_kf": True, "Lines": {"_kf": True, "1": {"_kf": True, "Position": "2"}}}
    result = merge_delta(target, delta)
    assert result == {"Lines": {"1": {"Position": "2"}}}


def test_merge_delta_of_none_and_snapshot_ingests_the_snapshot_verbatim_minus_kf():
    snapshot = {"Status": "1", "_kf": True, "Lines": {"1": {"Position": "1", "_kf": True}}}
    result = merge_delta(None, snapshot)
    assert result == {"Status": "1", "Lines": {"1": {"Position": "1"}}}


from livetiming.state import LiveSessionState


def test_fresh_state_is_not_live_and_snapshot_is_all_empty():
    state = LiveSessionState()
    assert state.is_live() is False
    snap = state.snapshot()
    assert snap["drivers"] == {}
    assert snap["timing"] == {}
    assert snap["connection_status"] == "disconnected"


def test_seconds_since_last_message_is_infinite_before_any_message():
    state = LiveSessionState()
    assert state.seconds_since_last_message() == float("inf")


def test_apply_merges_into_raw_and_returns_is_live_patch():
    state = LiveSessionState()
    patch = state.apply("TrackStatus", {"Status": "1", "Message": "AllClear"})
    assert patch == {"is_live": False, "track_status": {"Status": "1", "Message": "AllClear"}}


def test_apply_driver_list_projects_snake_case_with_hash_prefixed_colour():
    state = LiveSessionState()
    patch = state.apply("DriverList", {
        "1": {"RacingNumber": "1", "Tla": "VER", "FullName": "Max Verstappen",
              "TeamName": "Red Bull Racing", "TeamColour": "3671C6", "Line": 1},
    })
    assert patch["drivers"]["1"] == {
        "racing_number": "1", "tla": "VER", "full_name": "Max Verstappen",
        "team_name": "Red Bull Racing", "team_colour": "#3671C6", "line": 1,
    }


def test_apply_many_applies_every_topic_and_unions_the_patches():
    state = LiveSessionState()
    patch = state.apply_many({
        "TrackStatus": {"Status": "1"},
        "DriverList": {"1": {"Tla": "VER"}},
    })
    assert "track_status" in patch and "drivers" in patch


def test_heartbeat_touches_last_message_but_has_no_derived_key():
    state = LiveSessionState()
    patch = state.apply("Heartbeat", {})
    assert patch == {"is_live": False}
    assert state.seconds_since_last_message() < 1.0


def test_timing_projection_combines_all_three_timing_topics():
    state = LiveSessionState()
    state.apply("TimingData", {"Lines": {"1": {
        "Position": "1", "GapToLeader": "",
        "IntervalToPositionAhead": {"Value": "", "Catching": False},
        "Sectors": [{"Value": "28.312", "PersonalFastest": False, "OverallFastest": False}],
        "NumberOfPitStops": 0, "InPit": False, "Retired": False,
    }}})
    state.apply("TimingAppData", {"Lines": {"1": {"Stints": [{"Compound": "SOFT", "New": True, "TotalLaps": 5}]}}})
    state.apply("TimingStats", {"Lines": {"1": {"PersonalBestLapTime": {"Value": "1:18.223"}}}})

    timing = state._derive_timing()
    assert timing["1"]["position"] == "1"
    assert timing["1"]["tyre_compound"] == "SOFT"
    assert timing["1"]["personal_best_lap"] == {"Value": "1:18.223"}


def test_timing_projection_applies_index_keyed_sector_delta():
    state = LiveSessionState()
    state.apply("TimingData", {"Lines": {"1": {
        "Sectors": [
            {"Value": "28.312", "PersonalFastest": False, "OverallFastest": False},
            {"Value": "31.001", "PersonalFastest": False, "OverallFastest": False},
        ],
    }}})
    state.apply("TimingData", {"Lines": {"1": {"Sectors": {"1": {"Value": "30.500", "PersonalFastest": True}}}}})

    sectors = state._derive_timing()["1"]["sectors"]
    assert sectors[0]["Value"] == "28.312", "sector 0 must be untouched by the sector-1 patch"
    assert sectors[1] == {"Value": "30.500", "PersonalFastest": True, "OverallFastest": False}


def test_positions_projection_reads_the_latest_frame():
    state = LiveSessionState()
    state.apply("Position.z", {"Position": [{"Timestamp": "t", "Entries": {
        "1": {"Status": "OnTrack", "X": 10, "Y": 20, "Z": 0},
    }}]})
    assert state._derive_positions() == {"1": {"x": 10, "y": 20, "z": 0, "status": "OnTrack"}}


def test_telemetry_projection_decodes_car_data_channels():
    state = LiveSessionState()
    state.apply("CarData.z", {"Entries": [{"Utc": "t", "Cars": {
        "1": {"Channels": {"0": 11000, "2": 300, "3": 8, "4": 100, "5": 0, "45": 1}},
    }}]})
    assert state._derive_telemetry() == {
        "1": {"rpm": 11000, "speed": 300, "gear": 8, "throttle": 100, "brake": 0, "drs": 1},
    }


def test_race_control_projection_is_newest_first():
    state = LiveSessionState()
    state.apply("RaceControlMessages", {"Messages": [{"Message": "GREEN LIGHT"}]})
    state.apply("RaceControlMessages", {"Messages": {"1": {"Message": "YELLOW"}}})
    rc = state._derive_race_control()
    assert rc[0]["Message"] == "YELLOW"
    assert rc[1]["Message"] == "GREEN LIGHT"


def test_race_control_projection_is_bounded_to_race_control_max():
    state = LiveSessionState()
    many = {str(i): {"Message": str(i)} for i in range(150)}
    state.apply("RaceControlMessages", {"Messages": many})
    assert len(state._derive_race_control()) == LiveSessionState.RACE_CONTROL_MAX


def test_is_live_requires_connected_status():
    state = LiveSessionState()
    state.apply("Heartbeat", {})
    assert state.is_live() is False, "never live while disconnected, regardless of message freshness"
    state.set_connection_status("connected")
    assert state.is_live() is True


def test_is_live_false_when_session_status_is_finalised_or_ends():
    state = LiveSessionState()
    state.set_connection_status("connected")
    state.apply("Heartbeat", {})
    assert state.is_live() is True
    state.apply("SessionInfo", {"SessionStatus": "Finalised"})
    assert state.is_live() is False


def test_is_live_false_after_120_seconds_of_silence():
    state = LiveSessionState()
    state.set_connection_status("connected")
    state.apply("Heartbeat", {})
    assert state.is_live() is True
    state._last_message_at = time.monotonic() - 200
    assert state.is_live() is False


def test_set_connection_status_patch_always_includes_is_live():
    state = LiveSessionState()
    patch = state.set_connection_status("connecting")
    assert patch == {"connection_status": "connecting", "is_live": False}
