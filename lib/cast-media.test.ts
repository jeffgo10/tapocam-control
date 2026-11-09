import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAST_CONTAINER,
  CAST_PATH,
  FFMPEG_IMAGE,
  castLaunchAction,
  castModelNeedsOverscan,
  castMosaicKey,
  castStartAt,
  castTitle,
  hlsPlaylistReady,
  hlsPlaylistUrl,
  hlsVariantName,
  mosaicDockerArgs,
  mosaicFfmpegArgs,
  mosaicFilter,
  parseCastRequest,
  resolveCastHost,
} from "./cast-media.ts";

const CAMERA_A = "11111111-1111-4111-8111-111111111111";
const CAMERA_B = "22222222-2222-4222-8222-222222222222";
const PATH_A = `cam-${CAMERA_A}`;
const PATH_B = `cam-${CAMERA_B}`;

describe("cast request", () => {
  it("keeps wall order and drops duplicates", () => {
    assert.deepEqual(parseCastRequest({ cameraIds: [CAMERA_B, CAMERA_A, CAMERA_B], beat: true }), {
      ok: true,
      value: {
        cameraIds: [CAMERA_B, CAMERA_A],
        beat: true,
        overscan: false,
        deviceName: "",
        hdmi: false,
        sender: "browser",
      },
    });
    assert.deepEqual(
      parseCastRequest({ cameraIds: [CAMERA_A], deviceName: " Office display ", hdmi: true }),
      {
        ok: true,
        value: {
          cameraIds: [CAMERA_A],
          beat: false,
          overscan: false,
          deviceName: "Office display",
          hdmi: true,
          sender: "browser",
        },
      },
    );
    assert.equal(parseCastRequest({ cameraIds: [CAMERA_A], overscan: "yes" }).ok, false);
    assert.equal(parseCastRequest({ cameraIds: [CAMERA_A], deviceName: "bad\nname" }).ok, false);
    assert.equal(parseCastRequest({ cameraIds: [CAMERA_A], sender: "tv" }).ok, false);
    assert.equal(parseCastRequest({ cameraIds: [CAMERA_A], sender: "server" }).ok, false);
    assert.equal(
      parseCastRequest({ cameraIds: [CAMERA_A], sender: "server", deviceName: "Office display" }).ok,
      true,
    );
  });

  it("rejects an empty selection and more than four cameras", () => {
    assert.equal(parseCastRequest({ cameraIds: [] }).ok, false);
    assert.equal(
      parseCastRequest({
        cameraIds: [CAMERA_A, CAMERA_B, CAMERA_A, CAMERA_B, "not-an-id"],
      }).ok,
      false,
    );
  });
});

describe("cast host", () => {
  it("prefers CAST_HOST, then an advertised LAN host, then a physical interface", () => {
    const interfaces = [
      { name: "bridge100", address: "192.168.64.1", internal: false, family: "IPv4" },
      { name: "en0", address: "192.168.86.225", internal: false, family: "IPv4" },
      { name: "lo0", address: "127.0.0.1", internal: true, family: "IPv4" },
    ];
    assert.equal(resolveCastHost({ CAST_HOST: "10.0.0.8" }, interfaces), "10.0.0.8");
    assert.equal(
      resolveCastHost({ WEBRTC_ADDITIONAL_HOSTS: "127.0.0.1, 10.1.1.5" }, interfaces),
      "10.1.1.5",
    );
    assert.equal(resolveCastHost({ WEBRTC_ADDITIONAL_HOSTS: "127.0.0.1" }, interfaces), "192.168.86.225");
  });

  it("refuses a loopback address because the display fetches the video itself", () => {
    assert.throws(
      () => resolveCastHost({ CAST_HOST: "127.0.0.1" }, []),
      /LAN address/,
    );
  });
});

describe("cast playlist", () => {
  it("waits until several media segments exist", () => {
    assert.equal(
      hlsVariantName("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nvideo1_stream.m3u8\n"),
      "video1_stream.m3u8",
    );
    assert.equal(
      hlsVariantName(
        '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-INDEPENDENT-SEGMENTS\n\n#EXT-X-STREAM-INF:BANDWIDTH=1782992,AVERAGE-BANDWIDTH=1750505,CODECS="avc1.4d401f",RESOLUTION=1280x720,FRAME-RATE=15.000\nmain_stream.m3u8?cookieCheck=1\n',
      ),
      "main_stream.m3u8?cookieCheck=1",
    );
    assert.equal(hlsVariantName("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttp://evil/x.m3u8\n"), null);
    assert.equal(hlsVariantName("#EXTM3U\n#EXTINF:2.0,\nseg.ts"), null);
    assert.equal(hlsPlaylistReady("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:3\n#EXTINF:6.0,\nseg.ts\n"), false);
    assert.equal(hlsPlaylistReady("#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:8.0,\nseg.ts\n"), false);
    assert.equal(hlsPlaylistReady("#EXTM3U\n#EXTINF:8.0,\nseg.ts\n"), false);
    assert.equal(
      hlsPlaylistReady(
        "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:2.0,\na.ts\n#EXTINF:2.0,\nb.ts\n#EXTINF:2.0,\nc.ts\n#EXTINF:2.0,\nd.ts\n",
      ),
      true,
    );
    assert.equal(hlsPlaylistReady("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nmain.m3u8"), false);
  });

  it("starts the Nest display a buffer behind the newest segment", () => {
    assert.equal(castStartAt(8), 0);
    assert.equal(castStartAt(4), 0);
    assert.equal(castStartAt(40), 32);
  });

  it("builds an HLS url the Nest display can open", () => {
    assert.equal(
      hlsPlaylistUrl("192.168.86.225", PATH_A),
      `http://192.168.86.225:8888/${PATH_A}/index.m3u8`,
    );
    assert.equal(
      hlsPlaylistUrl("192.168.86.225", CAST_PATH),
      "http://192.168.86.225:8888/cast-display/index.m3u8",
    );
  });
});

describe("cast wall", () => {
  it("names one camera or joins the wall", () => {
    assert.equal(castTitle(["Door"]), "Door");
    assert.equal(castTitle(["Door", "Yard"]), "Door · Yard");
  });

  it("places one frame or two, three, and four tiles", () => {
    assert.match(mosaicFilter(1), /1280:720/);
    assert.match(mosaicFilter(2), /hstack=inputs=2\[mosaic\]/);
    assert.match(mosaicFilter(3), /pad=1280:360:0:0:black\[bot\]/);
    assert.match(mosaicFilter(4), /layout=0_0\|640_0\|0_360\|640_360/);
    assert.throws(() => mosaicFilter(5), /1 to 4/);
  });

  it("insets a Chromecast picture and leaves other receivers full frame", () => {
    assert.equal(castModelNeedsOverscan("Chromecast"), true);
    assert.equal(castModelNeedsOverscan("Google Nest Hub"), false);
    for (const count of [1, 2, 3, 4]) {
      const inset = mosaicFilter(count, true);
      assert.match(inset, /scale=1216:684/);
      assert.match(inset, /pad=1280:720:\(ow-iw\)\/2:\(oh-ih\)\/2:black/);
      assert.match(inset, /\[v\]$/);
      const full = mosaicFilter(count, false);
      assert.doesNotMatch(full, /scale=1216:684/);
      assert.match(full, /\[v\]$/);
    }
    assert.match(mosaicFilter(1, false), /scale=1280:720/);
    assert.equal(castMosaicKey([PATH_A], true), `overscan:${PATH_A}`);
    assert.equal(castMosaicKey([PATH_A], false), `full:${PATH_A}`);
    assert.equal(castLaunchAction("full:cam", true, "full:cam", true), "refresh");
    assert.equal(castLaunchAction("overscan:cam", true, "full:cam", true), "ignore");
    assert.equal(castLaunchAction(null, false, "full:cam", true), "ignore");
    assert.equal(castLaunchAction("full:cam", false, "full:cam", true), "start");
    assert.equal(castLaunchAction("full:cam", true, "overscan:cam", false), "start");
    const chromecast = mosaicFfmpegArgs([PATH_A], "rtsp://mediamtx:8554", true);
    assert.ok(chromecast.some((arg) => arg.includes("scale=1216:684")));
    const nest = mosaicFfmpegArgs([PATH_A], "rtsp://mediamtx:8554", false);
    assert.equal(nest.some((arg) => arg.includes("scale=1216:684")), false);
  });

  it("encodes two-second segments on the camera clock", () => {
    const one = mosaicFfmpegArgs([PATH_A], "rtsp://mediamtx:8554");
    assert.equal(one.at(-1), "rtsp://mediamtx:8554/cast-display");
    assert.ok(one.some((arg) => arg.includes("anullsrc=channel_layout=stereo:sample_rate=48000,asetpts=PTS-STARTPTS[a]")));
    assert.equal(one.includes("-an"), false);
    assert.ok(one.includes("1000k"));
    assert.ok(one.includes("2000k"));
    assert.equal(one.includes("-use_wallclock_as_timestamps"), false);
    assert.equal(one[one.indexOf("-g") + 1], "30");
    assert.equal(one[one.indexOf("-map") + 1], "[v]");
    assert.equal(one[one.indexOf("-map", one.indexOf("-map") + 1) + 1], "[a]");
    const wall = mosaicFfmpegArgs([PATH_A, PATH_B], "rtsp://mediamtx:8554");
    assert.ok(wall.includes("1400k"));
    assert.ok(wall.includes("2800k"));
    assert.ok(wall.includes("ultrafast"));
  });

  it("passes camera paths to ffmpeg as arguments", () => {
    const ffmpeg = mosaicFfmpegArgs([PATH_A, PATH_B], "rtsp://mediamtx:8554");
    assert.ok(ffmpeg.includes(`rtsp://mediamtx:8554/${PATH_A}`));
    assert.ok(ffmpeg.includes(`rtsp://mediamtx:8554/${PATH_B}`));
    assert.equal(ffmpeg.at(-1), "rtsp://mediamtx:8554/cast-display");
    const docker = mosaicDockerArgs(ffmpeg, {
      image: FFMPEG_IMAGE,
      network: "container:tapocam-mediamtx",
      container: CAST_CONTAINER,
    });
    assert.deepEqual(docker.slice(0, 8), [
      "run",
      "--rm",
      "--init",
      "--name",
      CAST_CONTAINER,
      "--network",
      "container:tapocam-mediamtx",
      FFMPEG_IMAGE,
    ]);
  });
});
