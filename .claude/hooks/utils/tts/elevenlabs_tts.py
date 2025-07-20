#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "elevenlabs",
#     "python-dotenv",
# ]
# ///

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from ..localization import t, get_language

def main():
    """
    ElevenLabs Turbo v2.5 TTS Script
    
    Uses ElevenLabs' Turbo v2.5 model for fast, high-quality text-to-speech.
    Accepts optional text prompt as command-line argument.
    
    Usage:
    - ./eleven_turbo_tts.py                    # Uses default text
    - ./eleven_turbo_tts.py \"Your custom text\" # Uses provided text
    
    Features:
    - Fast generation (optimized for real-time use)
    - High-quality voice synthesis
    - Stable production model
    - Cost-effective for high-volume usage
    """
    
    # Load environment variables
    load_dotenv()
    
    # Get API key from environment
    api_key = os.getenv('ELEVENLABS_API_KEY')
    if not api_key:
        print(t("elevenlabs_error_api_key"))
        print(t("elevenlabs_api_key_prompt"))
        sys.exit(1)
    
    try:
        from elevenlabs.client import ElevenLabs
        from elevenlabs import play
        
        # Initialize client
        elevenlabs = ElevenLabs(api_key=api_key)
        
        print("🎙️  ElevenLabs Turbo v2.5 TTS")
        print("=" * 40)
        
        # Get text from command line argument or use default
        if len(sys.argv) > 1:
            text = " ".join(sys.argv[1:])  # Join all arguments as text
        else:
            text = t("elevenlabs_default_text")
        
        print(f"🎯 Text: {text}")
        print(t("elevenlabs_generating"))
        
        try:
            lang = get_language().upper()
            default_voice_id = os.getenv("ELEVENLABS_VOICE_ID_EN", "WejK3H1m7MI9CHnIjW9K")
            voice_id = os.getenv(f"ELEVENLABS_VOICE_ID_{lang}", default_voice_id)

            # Generate and play audio directly
            audio = elevenlabs.text_to_speech.convert(
                text=text,
                voice_id=voice_id,  # Specified voice
                model_id="eleven_turbo_v2_5",
                output_format="mp3_44100_128",
            )
            
            play(audio)
            print(t("playback_complete"))
            
        except Exception as e:
            print(t("unexpected_error", e=e))
        
        
    except ImportError:
        print(t("elevenlabs_error_package"))
        print(t("uv_install_prompt"))
        sys.exit(1)
    except Exception as e:
        print(t("unexpected_error", e=e))
        sys.exit(1)

if __name__ == "__main__":
    main()
