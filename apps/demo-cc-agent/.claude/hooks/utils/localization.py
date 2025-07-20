import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Determine the language from environment variables, default to 'en'
LANGUAGE = os.getenv("LANGUAGE", "en").strip('"')

# Construct the path to the locales directory
# Assuming this script is in .claude/hooks/utils, locales is at .claude/hooks/locales
LOCALES_PATH = Path(__file__).parent.parent / "locales"

# Load the language file
try:
    with open(LOCALES_PATH / f"{LANGUAGE}.json", "r", encoding="utf-8") as f:
        translations = json.load(f)
except FileNotFoundError:
    # Fallback to English if the specified language file is not found
    try:
        with open(LOCALES_PATH / "en.json", "r", encoding="utf-8") as f:
            translations = json.load(f)
    except FileNotFoundError:
        # If English is also missing, use an empty dictionary
        translations = {}

def t(key: str, **kwargs) -> str:
    """
    Retrieves a translated string for the given key and formats it with provided arguments.
    """
    template = translations.get(key, key)
    if isinstance(template, list):
        return template
    return template.format(**kwargs)

def get_language() -> str:
    """
    Returns the current language code.
    """
    return LANGUAGE
