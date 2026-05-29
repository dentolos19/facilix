# CCTV Simulator

Loops local MP4 video files and publishes them as RTSP/RTMP streams
via [MediaMTX](https://github.com/bluenviron/mediamtx).

## Quick start

```bash
docker compose up --build
```

## Stream URLs

Each `.mp4` file in `public/simulation/` becomes a stream named after its
filename (without extension). For example, `public/simulation/b0.mp4`
becomes:

| Protocol | URL |
|---|---|
| **RTSP** | `rtsp://localhost:8554/b0` |
| **RTMP** | `rtmp://localhost:1935/b0` |
| **HLS**  | `http://localhost:8888/b0/index.m3u8` |

## HTTP API

The simulator exposes a control API on port `8000`:

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Simulator health and stream status |
| `GET` | `/streams` | List all streams with details |
| `POST` | `/streams/{name}/restart` | Restart a stream |
| `POST` | `/streams/{name}/stop` | Stop a stream |
| `POST` | `/streams/{name}/start` | Start a (previously stopped) stream |

## Adding videos

Place any `.mp4` file into `public/simulation/` and restart the simulator
(or start a new stream via the API). The file is automatically discovered
and streamed.

## Frontend integration

Browsers cannot play raw RTSP/RTMP. Use MediaMTX's **HLS** output instead:

```javascript
// Example with hls.js
const video = document.getElementById("video");
const hls = new Hls();
hls.loadSource("http://localhost:8888/b0/index.m3u8");
hls.attachMedia(video);
```

Or for simple development, open `http://localhost:8888/` in a browser to
see MediaMTX's built-in player page.
