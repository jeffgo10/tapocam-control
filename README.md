# TPLink Tapo Local WebRTC & PTZ Controller

A local, cloud-independent controller for the TP-Link Tapo C200. The browser cannot play RTSP and the camera does not send CORS headers, so this app splits the work:

- **MediaMTX** pulls the camera RTSP stream and serves it to the browser as WebRTC.
- **Next.js API routes** turn button presses into ONVIF commands on port 2020.
- **The web app** saves each camera, plays one stream or a wall of up to four, and sends pan/tilt and preset commands to the highlighted camera. It can be installed as a PWA.

## Prerequisites

- Docker and Docker Compose
- Node.js 18 or newer
- A Tapo C200 on the same network, with a local camera account created in the Tapo app under **Advanced Settings > Camera Account**

## Run it

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in Chrome. Save a camera with a name, its IP, and the camera account. **Single** watches one camera. **Wall** plays every camera you check, up to four. Pan, tilt, and presets follow the highlighted camera.

**Cast** sends the current single camera, or the whole wall, to a Google Cast device on the same Wi-Fi. Desktop Chrome opened at localhost uses Chrome's device list. The installed app is opened from this computer's LAN name, where Chrome does not offer Cast, so this computer finds the display and starts playback. After you pick a device, this computer reads the model that device advertises on the network. A Chromecast, Google TV, or smart TV gets a small margin so the camera's corner label stays on screen. A Nest Hub and other receivers use the full picture. The name you gave the device in the Google Home app does not decide the margin. While the display is playing, the browser stops its own video so each camera is only pulled once. Pan, tilt, and presets stay in the browser. This computer re-encodes the picture into short 2-second pieces. Connecting takes about 20 seconds, because the display only plays smoothly once a full window of pieces is ready, and it then runs about 8 seconds behind live. A wall is combined into one picture from each camera's smaller stream, so this computer can keep up. The first cast downloads a small ffmpeg image and uses extra CPU. Set `CAST_HOST` in `.env` if the display cannot open the stream; it must be this computer's LAN address, not `localhost`.

Camera accounts are stored in the MySQL service from Docker Compose. The database port is only published on this computer.

To use the page from a phone on the same network, set `WEBRTC_ADDITIONAL_HOSTS` in `.env` to `127.0.0.1` plus this computer's LAN address, recreate the MediaMTX container, and open `http://<that-address>:3000`.

```bash
docker compose up -d --force-recreate
```

## Start and stop

On this Mac the app can start at login. Docker Desktop is set to open when you sign in, and MySQL and MediaMTX use `restart: unless-stopped`. A login agent then runs `npm start`, which serves the last production build. After you change the app, run `npm run build` again before expecting the new version.

```bash
./scripts/start.sh
./scripts/kill.sh
```

`scripts/start.sh` loads that agent if it is not already running. `scripts/kill.sh` unloads it so launchd does not start it again, and stops a `npm start` on port 3000 when that process is this project. It stays stopped until the next login, or until you run `scripts/start.sh`. MySQL and MediaMTX keep running. Stop those with `docker compose stop`.

## Volume

Docker Compose bind-mounts `RECORDINGS_DIR` on this computer to `/recordings` in the MediaMTX container. When `RECORDINGS_DIR` is unset, that folder is `./recordings`. `mediamtx.yml` leaves `record` false and sets `recordPath` to `/recordings/%path/%Y-%m-%d/%H/%Y-%m-%d_%H-%M-%S-%f` with `recordFormat: fmp4`. `/etc/localtime` is mounted read-only, so the container clock matches this computer. Without that mount the container stays on UTC, and the time fields in `recordPath` follow UTC.

## Plugins

Plugins are installed from the Plugins panel in this app. They run inside this process. The install list is read from `PLUGIN_CATALOG` in `.env`. When that is unset, the app looks in `../tapocam-extends/plugins`.

Preset carousel steps a camera through the positions saved on it. In that plugin's settings, start or stop each camera, set the wait (60 seconds unless you change it, from 10 seconds to 60 minutes), and untick presets you want to skip. A selected preset can keep its own wait in seconds. A preset without one uses the camera wait. Until you untick any, it uses every preset.

## Ports

| Service | Port | Purpose |
| --- | --- | --- |
| Next.js | 3000 | Web UI and the proxy APIs |
| MySQL | 3306 | Saved cameras. Bound to localhost. |
| MediaMTX API | 9997 | Dynamic stream configuration. Bound to localhost. |
| MediaMTX HLS | 8888 | Video for a Nest display. Reachable on the LAN. |
| MediaMTX WebRTC | 8889 | Video in the browser |
| MediaMTX ICE | 8189/udp | WebRTC media |
| Tapo RTSP | 554 | Camera video (`/stream1`) |
| Tapo ONVIF | 2020 | Pan, tilt, and presets |

## API

`GET /api/cameras` lists saved cameras. Passwords are not included.

`POST /api/cameras` with `{ name, ip, username, password }` saves a camera.

`PATCH /api/cameras/:id` updates a camera. Omit `password` to keep the saved one.

`DELETE /api/cameras/:id` removes the camera and its MediaMTX path.

`POST /api/cameras/:id/stream` registers that camera as its own WebRTC path and returns `{ success: true, streamUrl }`.

`POST /api/cameras/:id/ptz` with `{ command }` sends an ONVIF continuous move at speed `0.5`, then a stop after 500ms. `command` is `up`, `down`, `left`, or `right`.

`POST /api/cameras/:id/presets` with `action: "list"` returns presets. `action: "goto"` with `presetToken` moves to one of them.

`POST /api/cast` with `{ cameraIds, deviceName }` prepares the cast stream for those cameras, in order, and returns `{ hlsUrl, title, overscan }`. `overscan` is true when that receiver's advertised model is a Chromecast, Google TV, or smart TV. One camera is scaled to 720p. Two to four cameras are combined into one picture. `DELETE /api/cast` stops that stream.
