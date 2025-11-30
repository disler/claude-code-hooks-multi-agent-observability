#!/usr/bin/env python3
"""
TTS Provider Abstraction Layer

Provides a unified interface for different text-to-speech providers:
- macOS Say (native)
- ElevenLabs (ultra-low latency)
- OpenAI (high quality)
- pyttsx3 (offline fallback)
"""

import os
import sys
import subprocess
import asyncio
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional


class TTSProvider(ABC):
    """Base class for all TTS providers"""

    @abstractmethod
    def speak(self, text: str, volume: Optional[float] = None) -> bool:
        """
        Speak the given text.

        Args:
            text: The text to speak
            volume: Volume level (0.0 to 1.0), None to use default

        Returns:
            True if successful, False otherwise
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this TTS provider is available"""
        pass


class MacOSSayProvider(TTSProvider):
    """macOS native 'say' command TTS provider"""

    def __init__(self, voice: str = "Samantha", rate: int = 200, volume: float = 0.8):
        self.voice = voice
        self.rate = rate
        self.default_volume = volume

    def speak(self, text: str, volume: Optional[float] = None) -> bool:
        """
        Use macOS 'say' command for TTS with volume control via afplay.

        Volume is applied relative to current system volume without changing it.
        """
        if not text:
            return False

        try:
            import tempfile

            # Use volume if specified, otherwise use default
            vol = volume if volume is not None else self.default_volume

            # Generate audio to temporary file
            with tempfile.NamedTemporaryFile(suffix='.aiff', delete=False) as temp_file:
                temp_path = temp_file.name

            # Use 'say' to generate audio file
            subprocess.run(
                ["say", "-v", self.voice, "-r", str(self.rate), "-o", temp_path, text],
                capture_output=True,
                timeout=10,
                check=True
            )

            # Play with afplay at specified volume (relative to current system volume)
            # afplay volume option: 0.0 to 1.0 (percentage of current system volume)
            subprocess.run(
                ["afplay", "-v", str(vol), temp_path],
                capture_output=True,
                timeout=15,
                check=True
            )

            # Clean up temp file
            try:
                os.unlink(temp_path)
            except:
                pass

            return True
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
            # Clean up temp file on error
            try:
                if 'temp_path' in locals():
                    os.unlink(temp_path)
            except:
                pass
            return False

    def is_available(self) -> bool:
        """Check if 'say' command is available (macOS only)"""
        try:
            result = subprocess.run(
                ["which", "say"],
                capture_output=True,
                timeout=1
            )
            return result.returncode == 0
        except:
            return False


class ElevenLabsProvider(TTSProvider):
    """ElevenLabs TTS provider (reuses existing implementation)"""

    def __init__(self, voice: str = "Dan", model: str = "eleven_flash_v2_5"):
        self.voice = voice
        self.model = model
        self.api_key = os.getenv('ELEVENLABS_API_KEY')

    def speak(self, text: str, volume: Optional[float] = None) -> bool:
        """Use ElevenLabs TTS (volume control via system volume)"""
        if not text or not self.api_key:
            return False

        try:
            from elevenlabs.client import ElevenLabs
            from elevenlabs.play import play

            # Set system volume if specified
            if volume is not None:
                mac_volume = int(volume * 100)
                subprocess.run(
                    ["osascript", "-e", f"set volume output volume {mac_volume}"],
                    capture_output=True,
                    timeout=1
                )

            client = ElevenLabs(api_key=self.api_key)

            # Voice ID mapping (add more as needed)
            voice_ids = {
                "Dan": "WejK3H1m7MI9CHnIjW9K",
                # Add more voice mappings here
            }
            voice_id = voice_ids.get(self.voice, voice_ids["Dan"])

            audio = client.text_to_speech.convert(
                text=text,
                voice_id=voice_id,
                model_id=self.model,
                output_format="mp3_44100_128",
            )

            play(audio)
            return True
        except Exception:
            return False

    def is_available(self) -> bool:
        """Check if ElevenLabs is available"""
        if not self.api_key:
            return False
        try:
            import elevenlabs
            return True
        except ImportError:
            return False


class OpenAIProvider(TTSProvider):
    """OpenAI TTS provider (reuses existing implementation)"""

    def __init__(self, voice: str = "alloy", model: str = "tts-1"):
        self.voice = voice
        self.model = model
        self.api_key = os.getenv('OPENAI_API_KEY')

    def speak(self, text: str, volume: Optional[float] = None) -> bool:
        """Use OpenAI TTS (volume control via system volume)"""
        if not text or not self.api_key:
            return False

        try:
            # Set system volume if specified
            if volume is not None:
                mac_volume = int(volume * 100)
                subprocess.run(
                    ["osascript", "-e", f"set volume output volume {mac_volume}"],
                    capture_output=True,
                    timeout=1
                )

            # Run async OpenAI TTS in sync context
            asyncio.run(self._speak_async(text))
            return True
        except Exception:
            return False

    async def _speak_async(self, text: str):
        """Async OpenAI TTS implementation"""
        from openai import AsyncOpenAI
        from openai.helpers import LocalAudioPlayer

        client = AsyncOpenAI(api_key=self.api_key)

        async with client.audio.speech.with_streaming_response.create(
            model=self.model,
            voice=self.voice,
            input=text,
            response_format="mp3",
        ) as response:
            await LocalAudioPlayer().play(response)

    def is_available(self) -> bool:
        """Check if OpenAI TTS is available"""
        if not self.api_key:
            return False
        try:
            import openai
            return True
        except ImportError:
            return False


class Pyttsx3Provider(TTSProvider):
    """pyttsx3 offline TTS provider (reuses existing implementation)"""

    def __init__(self, rate: int = 180, volume: float = 0.8):
        self.rate = rate
        self.default_volume = volume

    def speak(self, text: str, volume: Optional[float] = None) -> bool:
        """Use pyttsx3 for offline TTS"""
        if not text:
            return False

        try:
            import pyttsx3

            engine = pyttsx3.init()
            engine.setProperty('rate', self.rate)

            # Use specified volume or default
            vol = volume if volume is not None else self.default_volume
            engine.setProperty('volume', vol)

            engine.say(text)
            engine.runAndWait()
            return True
        except Exception:
            return False

    def is_available(self) -> bool:
        """Check if pyttsx3 is available"""
        try:
            import pyttsx3
            return True
        except ImportError:
            return False


class TTSProviderFactory:
    """Factory for creating TTS providers"""

    @staticmethod
    def create_provider(provider_name: str, config: dict) -> Optional[TTSProvider]:
        """
        Create a TTS provider based on name and config.

        Args:
            provider_name: Name of the provider (say, elevenlabs, openai, pyttsx3)
            config: Configuration dictionary

        Returns:
            TTSProvider instance or None if provider not found
        """
        provider_name = provider_name.lower()

        if provider_name == "say":
            settings = config.get("say_settings", {})
            return MacOSSayProvider(
                voice=settings.get("voice", "Samantha"),
                rate=settings.get("rate", 200),
                volume=settings.get("volume", 0.8)
            )

        elif provider_name == "elevenlabs":
            settings = config.get("elevenlabs_settings", {})
            return ElevenLabsProvider(
                voice=settings.get("voice", "Dan"),
                model=settings.get("model", "eleven_flash_v2_5")
            )

        elif provider_name == "openai":
            settings = config.get("openai_settings", {})
            return OpenAIProvider(
                voice=settings.get("voice", "alloy"),
                model=settings.get("model", "tts-1")
            )

        elif provider_name == "pyttsx3":
            settings = config.get("pyttsx3_settings", {})
            return Pyttsx3Provider(
                rate=settings.get("rate", 180),
                volume=settings.get("volume", 0.8)
            )

        return None

    @staticmethod
    def get_best_available_provider(config: dict) -> Optional[TTSProvider]:
        """
        Get the best available TTS provider based on priority.

        Priority order:
        1. Configured provider (if available)
        2. ElevenLabs (if API key exists)
        3. macOS Say (if on macOS)
        4. OpenAI (if API key exists)
        5. pyttsx3 (offline fallback)

        Returns:
            The best available TTSProvider or None
        """
        # Try configured provider first
        configured_provider = config.get("tts_provider", "say")
        provider = TTSProviderFactory.create_provider(configured_provider, config)
        if provider and provider.is_available():
            return provider

        # Fallback to priority order
        for provider_name in ["elevenlabs", "say", "openai", "pyttsx3"]:
            provider = TTSProviderFactory.create_provider(provider_name, config)
            if provider and provider.is_available():
                return provider

        return None


def play_sound_effect(sound_name: str, volume: Optional[float] = None) -> bool:
    """
    Play a macOS system sound effect at specified volume.

    Volume is relative to current system volume (0.0-1.0), not absolute.
    This means if system volume is at 50% and you specify 0.5, the sound
    plays at 25% of maximum (50% of 50%).

    Args:
        sound_name: Name of the sound (e.g., "Glass", "Hero", "Ping")
        volume: Volume level (0.0 to 1.0), None to use current system volume (1.0)

    Returns:
        True if successful, False otherwise
    """
    if not sound_name:
        return False

    try:
        sound_path = f"/System/Library/Sounds/{sound_name}.aiff"

        # Use afplay with -v option for volume (relative to current system volume)
        if volume is not None:
            subprocess.run(
                ["afplay", "-v", str(volume), sound_path],
                capture_output=True,
                timeout=2,
                check=True
            )
        else:
            # No volume specified, play at current system volume
            subprocess.run(
                ["afplay", sound_path],
                capture_output=True,
                timeout=2,
                check=True
            )
        return True
    except:
        return False


def send_os_notification(
    title: str,
    message: str,
    notification_type: str = "banner",
    sound: Optional[str] = None
) -> bool:
    """
    Send a macOS system notification.

    Args:
        title: Notification title
        message: Notification message
        notification_type: Type of notification
                          - "banner": Non-intrusive notification (Notification Center)
                          - "alert": Modal alert dialog (blocks until dismissed)
                          - "dialog": Dialog with OK button (blocks until dismissed)
        sound: Optional sound name to play with notification

    Returns:
        True if successful, False otherwise
    """
    if not title or not message:
        return False

    try:
        # Escape quotes in title and message for AppleScript
        escaped_title = title.replace('"', '\\"').replace('\n', ' ')
        escaped_message = message.replace('"', '\\"').replace('\n', ' ')

        if notification_type == "alert":
            # Modal alert that requires user action (persistent)
            script = f'display alert "{escaped_title}" message "{escaped_message}"'
        elif notification_type == "dialog":
            # Dialog with OK button (persistent)
            script = f'display dialog "{escaped_message}" with title "{escaped_title}" buttons {{"OK"}} default button "OK"'
        else:
            # Default: banner notification (Notification Center)
            if sound:
                script = f'display notification "{escaped_message}" with title "{escaped_title}" sound name "{sound}"'
            else:
                script = f'display notification "{escaped_message}" with title "{escaped_title}"'

        subprocess.run(
            ["osascript", "-e", script],
            capture_output=True,
            timeout=5,
            check=True
        )
        return True
    except:
        return False
