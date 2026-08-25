import base64
import json
import os
import sys
import zlib

sys.path.insert(0, os.path.dirname(__file__))

from livetiming.decode import inflate_z, split_records


def _deflate_b64(obj) -> str:
    compressor = zlib.compressobj(9, zlib.DEFLATED, -zlib.MAX_WBITS)
    raw = compressor.compress(json.dumps(obj).encode("utf-8")) + compressor.flush()
    return base64.b64encode(raw).decode("ascii")


def test_split_records_splits_on_record_separator():
    raw = '{"a":1}\x1e{"b":2}\x1e'
    assert split_records(raw) == ['{"a":1}', '{"b":2}']


def test_split_records_discards_empty_fragments():
    raw = '\x1e{"a":1}\x1e\x1e'
    assert split_records(raw) == ['{"a":1}']


def test_inflate_z_roundtrips_raw_deflate_with_negative_wbits():
    payload = _deflate_b64({"Entries": [{"Cars": {"1": {"Channels": {"0": 11000}}}}]})
    assert inflate_z(payload) == {"Entries": [{"Cars": {"1": {"Channels": {"0": 11000}}}}]}


from livetiming.decode import decode_topic_payload


def test_decode_topic_payload_inflates_dot_z_topics():
    payload = _deflate_b64({"Position": [{"Entries": {"1": {"X": 10}}}]})
    assert decode_topic_payload("Position.z", payload) == {"Position": [{"Entries": {"1": {"X": 10}}}]}


def test_decode_topic_payload_passes_through_plain_topics():
    assert decode_topic_payload("TrackStatus", {"Status": "1"}) == {"Status": "1"}


from livetiming.decode import parse_frame


def test_parse_frame_returns_one_dict_per_record():
    raw = '{"type":6}\x1e{"type":1,"target":"X"}\x1e'
    assert parse_frame(raw) == [{"type": 6}, {"type": 1, "target": "X"}]


from livetiming.decode import extract_topic_message


def test_extract_topic_message_from_invocation_record():
    record = {"type": 1, "target": "feed", "arguments": ["TrackStatus", {"Status": "2"}, "2026-07-26T13:00:00Z"]}
    msg = extract_topic_message(record)
    assert msg == ("TrackStatus", {"Status": "2"}, "2026-07-26T13:00:00Z")


def test_extract_topic_message_inflates_dot_z_topics():
    payload = _deflate_b64({"Position": [{"Entries": {}}]})
    record = {"type": 1, "target": "feed", "arguments": ["Position.z", payload, "t"]}
    msg = extract_topic_message(record)
    assert msg.data == {"Position": [{"Entries": {}}]}


def test_extract_topic_message_returns_none_for_non_invocation():
    assert extract_topic_message({"type": 3, "result": {}}) is None
    assert extract_topic_message({"type": 6}) is None


def test_extract_topic_message_returns_none_for_empty_arguments():
    assert extract_topic_message({"type": 1, "arguments": []}) is None
    assert extract_topic_message({"type": 1}) is None


from livetiming.decode import extract_snapshot


def test_extract_snapshot_decodes_every_topic_including_dot_z():
    position_payload = _deflate_b64({"Position": [{"Entries": {}}]})
    record = {
        "type": 3,
        "result": {
            "TrackStatus": {"Status": "1"},
            "Position.z": position_payload,
        },
    }
    snapshot = extract_snapshot(record)
    assert snapshot == {
        "TrackStatus": {"Status": "1"},
        "Position.z": {"Position": [{"Entries": {}}]},
    }


def test_extract_snapshot_returns_none_for_non_completion():
    assert extract_snapshot({"type": 1, "arguments": []}) is None
    assert extract_snapshot({"type": 3, "result": "not-a-dict"}) is None
