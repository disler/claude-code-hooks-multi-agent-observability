#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "python-dotenv",
#     "requests",
# ]
# ///

import os
import shutil
import subprocess
import sys
import tempfile

import requests
from dotenv import load_dotenv

DEFAULT_API_URL = "https://api.minimax.io/v1/t2a_v2"
DEFAULT_MODEL = "speech-2.8-hd"
DEFAULT_VOICE_ID = "English_expressive_narrator"


def synthesize(text, api_key, api_url, model, voice_id):
    response = requests.post(
        api_url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "text": text,
            "stream": False,
            "language_boost": "auto",
            "output_format": "hex",
            "voice_setting": {
                "voice_id": voice_id,
                "speed": 1,
                "vol": 1,
                "pitch": 0,
            },
            "audio_setting": {
                "sample_rate": 32000,
                "bitrate": 128000,
                "format": "mp3",
                "channel": 1,
            },
        },
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()

    base_response = payload.get("base_resp") or {}
    if base_response.get("status_code") != 0:
        message = base_response.get("status_msg") or "unknown API error"
        raise RuntimeError(f"MiniMax rejected the request: {message}")

    data = payload.get("data") or {}
    if data.get("status") != 2 or not data.get("audio"):
        raise RuntimeError("MiniMax returned no completed audio")

    try:
        return bytes.fromhex(data["audio"])
    except ValueError as error:
        raise RuntimeError("MiniMax returned invalid audio data") from error


def play_audio(audio):
    if sys.platform == "darwin":
        candidates = [("afplay",)]
    else:
        candidates = [
            ("ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet"),
            ("mpv", "--no-video", "--really-quiet"),
            ("mpg123", "-q"),
        ]

    command = next(
        (candidate for candidate in candidates if shutil.which(candidate[0])),
        None,
    )
    if command is None:
        raise RuntimeError("No supported audio player was found")

    audio_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as audio_file:
            audio_file.write(audio)
            audio_path = audio_file.name
        subprocess.run([*command, audio_path], check=True, capture_output=True)
    finally:
        if audio_path:
            os.unlink(audio_path)


def main():
    load_dotenv()

    api_key = os.getenv("MINIMAX_API_KEY")
    if not api_key:
        print("Error: MINIMAX_API_KEY not found in environment variables")
        sys.exit(1)

    text = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Work complete!"
    api_url = os.getenv("MINIMAX_TTS_URL", DEFAULT_API_URL)
    model = os.getenv("MINIMAX_TTS_MODEL", DEFAULT_MODEL)
    voice_id = os.getenv("MINIMAX_TTS_VOICE_ID", DEFAULT_VOICE_ID)

    try:
        audio = synthesize(text, api_key, api_url, model, voice_id)
        play_audio(audio)
    except (
        requests.RequestException,
        RuntimeError,
        subprocess.SubprocessError,
    ) as error:
        print(f"Error: {error}")
        sys.exit(1)


if __name__ == "__main__":
    main()
