import asyncio
import os
import sys

import httpx
import pytest
import respx

sys.path.insert(0, os.path.dirname(__file__))

from livetiming.client import CLIENT_HEADERS, LiveTimingClient, NEGOTIATE_URL
from livetiming.state import LiveSessionState


async def _noop_on_patch(patch):
    pass


@pytest.mark.respx(base_url=NEGOTIATE_URL)
async def test_negotiate_returns_the_connection_token():
    with respx.mock:
        respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200, headers={"set-cookie": "sess=abc"}))
        respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
            return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
        )
        client = LiveTimingClient(LiveSessionState(), _noop_on_patch)
        token, cookie_header = await client._negotiate()
        assert token == "tok-123"
        assert cookie_header == "sess=abc"


def test_apply_topic_is_fail_soft_on_a_bad_payload():
    client = LiveTimingClient(LiveSessionState(), _noop_on_patch)
    # RaceControlMessages' "Messages" list-index branch calls int(key) on
    # every delta key once a prior snapshot has made the target a list —
    # seed that, then send a non-numeric key to reproduce a real
    # decode-time failure (ValueError inside merge_delta).
    client._apply_topic("RaceControlMessages", {"Messages": [{"Message": "GREEN"}]})
    patch = client._apply_topic("RaceControlMessages", {"Messages": {"not-a-number": {}}})
    assert patch == {}


class _FakeConnection:
    """Stands in for the object `async with ws_connect(...) as ws` binds —
    an async iterator of text frames with an async `send`."""

    def __init__(self, frames):
        self._frames = list(frames)
        self.sent = []

    async def send(self, message):
        self.sent.append(message)

    def __aiter__(self):
        return self

    async def __anext__(self):
        if not self._frames:
            raise StopAsyncIteration
        return self._frames.pop(0)


class _FakeConnect:
    """Stands in for `websockets.asyncio.client.connect` — records every
    call's url/kwargs and hands out fake connections in call order."""

    def __init__(self, connections):
        self._connections = list(connections)
        self.calls = []

    def __call__(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return self

    async def __aenter__(self):
        return self._connections.pop(0)

    async def __aexit__(self, *exc_info):
        return False


@pytest.mark.respx(base_url=NEGOTIATE_URL)
async def test_connect_once_sends_protocol_init_then_subscribe_with_every_topic():
    with respx.mock:
        respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200))
        respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
            return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
        )
        fake_conn = _FakeConnection(frames=[])
        fake_connect = _FakeConnect(connections=[fake_conn])
        patches = []

        async def on_patch(patch):
            patches.append(patch)

        client = LiveTimingClient(LiveSessionState(), on_patch, ws_connect_fn=fake_connect)
        await client._connect_once()

        assert fake_connect.calls[0][0] == "wss://livetiming.formula1.com/signalrcore?id=tok-123"
        assert fake_connect.calls[0][1]["additional_headers"] == CLIENT_HEADERS
        assert fake_connect.calls[0][1]["max_size"] is None
        assert fake_conn.sent[0] == '{"protocol": "json", "version": 1}\x1e'
        import json as _json
        subscribe = _json.loads(fake_conn.sent[1].rstrip("\x1e"))
        assert subscribe["target"] == "Subscribe"
        assert subscribe["arguments"] == [[
            "Heartbeat", "SessionInfo", "DriverList", "TimingData", "TimingAppData",
            "TimingStats", "TrackStatus", "RaceControlMessages", "WeatherData",
            "CarData.z", "Position.z",
        ]]
        assert any(p.get("connection_status") == "connected" for p in patches)


@pytest.mark.respx(base_url=NEGOTIATE_URL)
async def test_connect_once_forwards_the_alb_sticky_session_cookie_to_the_websocket():
    with respx.mock:
        respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200, headers={"set-cookie": "AWSALB=xyz"}))
        respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
            return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
        )
        fake_conn = _FakeConnection(frames=[])
        fake_connect = _FakeConnect(connections=[fake_conn])

        client = LiveTimingClient(LiveSessionState(), _noop_on_patch, ws_connect_fn=fake_connect)
        await client._connect_once()

        headers = fake_connect.calls[0][1]["additional_headers"]
        assert headers["Cookie"] == "AWSALB=xyz"
        assert headers["User-Agent"] == CLIENT_HEADERS["User-Agent"]


@pytest.mark.respx(base_url=NEGOTIATE_URL)
async def test_connect_once_applies_received_frames_to_state():
    with respx.mock:
        respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200))
        respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
            return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
        )
        frame = '{"type":1,"target":"feed","arguments":["TrackStatus",{"Status":"2"},"t"]}\x1e'
        fake_conn = _FakeConnection(frames=[frame])
        fake_connect = _FakeConnect(connections=[fake_conn])
        patches = []

        async def on_patch(patch):
            patches.append(patch)

        state = LiveSessionState()
        client = LiveTimingClient(state, on_patch, ws_connect_fn=fake_connect)
        await client._connect_once()

        assert state._derive_track_status() == {"Status": "2"}
        assert any(p.get("track_status") == {"Status": "2"} for p in patches)


@pytest.mark.respx(base_url=NEGOTIATE_URL)
async def test_run_reconnects_with_backoff_after_a_failed_connect_then_stops():
    with respx.mock:
        respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200))
        respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
            return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
        )

        class _FailingConnect:
            def __call__(self, url, **kwargs):
                return self

            async def __aenter__(self):
                raise ConnectionRefusedError("boom")

            async def __aexit__(self, *exc_info):
                return False

        working_frame = '{"type":1,"target":"feed","arguments":["TrackStatus",{"Status":"2"},"t"]}\x1e'
        fake_conn = _FakeConnection(frames=[working_frame])

        calls = {"n": 0}
        failing = _FailingConnect()
        working = _FakeConnect(connections=[fake_conn])

        def ws_connect_fn(url, **kwargs):
            calls["n"] += 1
            return failing if calls["n"] == 1 else working(url, **kwargs)

        statuses = []
        client = None

        async def on_patch(patch):
            statuses.append(patch)
            if patch.get("track_status") == {"Status": "2"}:
                await client.stop()

        client = LiveTimingClient(LiveSessionState(), on_patch, ws_connect_fn=ws_connect_fn)
        await client.run()

        connection_statuses = [p["connection_status"] for p in statuses if "connection_status" in p]
        assert connection_statuses == ["connecting", "disconnected", "reconnecting", "connected", "disconnected"]


@pytest.mark.respx(base_url=NEGOTIATE_URL)
async def test_run_emits_disconnected_status_before_reraising_cancelled_error():
    with respx.mock:
        respx.options(NEGOTIATE_URL).mock(return_value=httpx.Response(200))
        respx.post(NEGOTIATE_URL, params={"negotiateVersion": "1"}).mock(
            return_value=httpx.Response(200, json={"connectionToken": "tok-123"})
        )

        class _CancellingConnect:
            def __call__(self, url, **kwargs):
                return self

            async def __aenter__(self):
                raise asyncio.CancelledError()

            async def __aexit__(self, *exc_info):
                return False

        statuses = []

        async def on_patch(patch):
            if "connection_status" in patch:
                statuses.append(patch["connection_status"])

        client = LiveTimingClient(LiveSessionState(), on_patch, ws_connect_fn=_CancellingConnect())

        with pytest.raises(asyncio.CancelledError):
            await client.run()

        assert statuses == ["connecting", "disconnected"]
