# IoT Sensor Simulator

A Dockerized Python service that generates realistic IoT device telemetry for
temperature, humidity, pressure, light, motion, air quality, leak, vibration,
door contact, and battery sensors.

## Quick Start

```bash
# From the project root
docker compose build sensors
docker compose up sensors
```

The API is available at `http://localhost:8010`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/sensors` | List all sensor devices |
| `GET` | `/sensors/{device_id}` | Details for one device |
| `GET` | `/readings/latest` | Latest reading(s) for all or one device |
| `GET` | `/readings?device_id=X&limit=50` | History for one device |
| `POST` | `/sensors/{device_id}/read` | Trigger an immediate reading |
| `POST` | `/sensors/{device_id}/start` | Enable automatic readings |
| `POST` | `/sensors/{device_id}/stop` | Disable automatic readings |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SENSORS_PORT` | `8010` | HTTP listen port |
| `SENSORS_LOG_LEVEL` | `info` | Log level |
| `SENSOR_DEFAULT_INTERVAL_SECONDS` | `5` | Auto-reading interval |
| `SENSOR_HISTORY_LIMIT` | `500` | Max readings stored per sensor |
| `SENSOR_RANDOM_SEED` | _(none)_ | Fixed seed for repeatable values |
| `SENSOR_PAYLOAD_FORMAT` | `facilix` | Payload format: `facilix`, `thingsboard`, or `senml` |

## Payload Formats

### Facilix (default)

```json
{
  "deviceId": "sensor-temp-001",
  "sensorType": "temperature",
  "timestamp": "2026-05-30T12:00:00Z",
  "sequence": 42,
  "status": "ok",
  "batteryPct": 87.3,
  "signalRssiDbm": -61,
  "values": {
    "temperature": { "value": 22.5, "unit": "°C" }
  }
}
```

### ThingsBoard-style

```json
{
  "ts": 1717070000000,
  "values": { "temperature": 22.5 }
}
```

### SenML (RFC 8428)

```json
{
  "senml": [
    { "n": "temperature", "u": "°C", "v": 22.5, "t": 1717070000 },
    { "n": "battery", "u": "%", "v": 87.3, "t": 1717070000 },
    { "n": "signal", "u": "dBm", "v": -61, "t": 1717070000 }
  ]
}
```

## Default Sensor Devices

| Device ID | Type | Range | Unit |
|-----------|------|-------|------|
| `sensor-temp-001` | Temperature | 18–30 | °C |
| `sensor-humidity-001` | Humidity | 30–70 | %RH |
| `sensor-pressure-001` | Pressure | 980–1040 | hPa |
| `sensor-light-001` | Light | 0–1200 | lux |
| `sensor-motion-001` | Motion | 0/1 + occupancy | detected / people |
| `sensor-air-001` | Air Quality | 350–1200 CO₂ | ppm |
| `sensor-leak-001` | Leak | 0/1 | leak |
| `sensor-vibration-001` | Vibration | 0–25 | mm/s |
| `sensor-door-001` | Door Contact | 0/1 | open |
| `sensor-battery-001` | Battery | 0–100 | % |

## Architecture Notes

- **Stateless**: This service keeps all data in memory. Restarting it resets all readings.
- **No MQTT yet**: Readings are served over HTTP only. An MQTT gateway can be added later.
- **No database persistence**: If persistent storage is needed, the Python service
  should POST readings to a Cloudflare Worker endpoint that writes into the
  `device_logs` D1 table (the current architecture does not allow direct
  Python-to-D1 access).
