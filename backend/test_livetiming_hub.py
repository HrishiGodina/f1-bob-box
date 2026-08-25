import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from livetiming.hub import Broadcaster


class _FakeClient:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.received = []

    async def send_text(self, message):
        if self.fail:
            raise RuntimeError("connection closed")
        self.received.append(message)


async def test_broadcast_delivers_to_all_registered_clients():
    hub = Broadcaster()
    a, b = _FakeClient(), _FakeClient()
    await hub.register(a)
    await hub.register(b)

    await hub.broadcast({"is_live": True})

    assert a.received == ['{"is_live": true}']
    assert b.received == ['{"is_live": true}']


async def test_broadcast_isolates_a_dead_client_and_evicts_it():
    hub = Broadcaster()
    good, bad = _FakeClient(), _FakeClient(fail=True)
    await hub.register(good)
    await hub.register(bad)

    await hub.broadcast({"is_live": True})  # bad raises; good must still get it

    assert good.received == ['{"is_live": true}']
    await hub.broadcast({"is_live": False})  # bad was evicted, so no second raise
    assert good.received == ['{"is_live": true}', '{"is_live": false}']


async def test_unregister_stops_delivery():
    hub = Broadcaster()
    client = _FakeClient()
    await hub.register(client)
    await hub.unregister(client)

    await hub.broadcast({"is_live": True})

    assert client.received == []


async def test_broadcast_is_a_no_op_with_no_clients_or_empty_patch():
    hub = Broadcaster()
    await hub.broadcast({"is_live": True})  # no clients registered — must not raise

    client = _FakeClient()
    await hub.register(client)
    await hub.broadcast({})  # empty patch — must not send anything
    assert client.received == []
