import asyncio
import importlib
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
cctv = importlib.import_module("cctv")
monitoring = importlib.import_module("monitoring")
sensors = importlib.import_module("sensors")


class MonitoringTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_capture_waits_before_retry(self):
        capture = AsyncMock(return_value=(None, 0, 0, 0, "bad stream"))
        sleep = AsyncMock(side_effect=asyncio.CancelledError)
        post = AsyncMock()
        with (
            patch.object(cctv, "capture_segment", capture),
            patch.object(cctv, "post_event", post),
            patch.object(cctv.asyncio, "sleep", sleep),
            self.assertRaises(asyncio.CancelledError),
        ):
            await cctv._segment_loop("camera", "Camera", "rtsp://stream", 30)
        capture.assert_awaited_once()
        post.assert_awaited_once()
        sleep.assert_awaited_once_with(5)

    async def test_cancelled_capture_terminates_its_process(self):
        started = asyncio.Event()
        calls = 0

        async def communicate():
            nonlocal calls
            calls += 1
            if calls == 1:
                started.set()
                await asyncio.Event().wait()
            return b"", b""

        proc = SimpleNamespace(
            returncode=None, communicate=AsyncMock(side_effect=communicate)
        )
        proc.kill = Mock(side_effect=lambda: setattr(proc, "returncode", -9))
        with patch.object(
            cctv.asyncio, "create_subprocess_exec", AsyncMock(return_value=proc)
        ):
            task = asyncio.create_task(cctv.capture_segment("rtsp://stream"))
            await started.wait()
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        proc.kill.assert_called_once()
        self.assertEqual(calls, 2)

    async def test_heartbeat_reports_elapsed_time(self):
        clock = SimpleNamespace(monotonic=Mock(return_value=220.9))
        sleep = AsyncMock(side_effect=[None, asyncio.CancelledError])
        post = AsyncMock()
        with (
            patch.object(monitoring, "STARTED_AT", 100.0),
            patch.object(monitoring, "time", clock),
            patch.object(monitoring.asyncio, "sleep", sleep),
            patch.object(monitoring, "post_event", post),
            self.assertRaises(asyncio.CancelledError),
        ):
            await monitoring.heartbeat_loop("facility")
        post.assert_awaited_once_with(
            "facility", "monitoring:heartbeat", "info", "Container heartbeat", {"uptimeSec": 120}
        )

    async def test_sensor_readings_do_not_default_to_zero(self):
        client = SimpleNamespace(
            get=AsyncMock(return_value=httpx.Response(200, json={}))
        )
        with patch.object(sensors, "get_http_client", return_value=client):
            self.assertEqual(
                await sensors.read_sensor("http-pull", "", "http://sensor"),
                (None, "missing_value", {}),
            )
            client.get.return_value = httpx.Response(200, json={"value": 0})
            value, status, _ = await sensors.read_sensor(
                "http-pull", "", "http://sensor"
            )
            self.assertEqual((value, status), (0, "ok"))
            client.get.return_value = httpx.Response(200, json={"value": "NaN"})
            self.assertEqual(
                await sensors.read_sensor("http-pull", "", "http://sensor"),
                (None, "invalid_value", {}),
            )


if __name__ == "__main__":
    unittest.main()
