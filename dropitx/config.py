"""Configuration management for DropItX CLI."""

import json
import os
from pathlib import Path
from typing import Optional

# Default API base URL
DEFAULT_API_URL = "https://api.dropitx.site"

# Default frontend base URL (for share links: {frontend_url}/s/{slug})
DEFAULT_FRONTEND_URL = "https://dropitx.site"

# Config file location
CONFIG_DIR = Path.home() / ".dropitx"
CONFIG_FILE = CONFIG_DIR / "config.json"


def get_config_path() -> Path:
    """Get the path to the config file."""
    return CONFIG_FILE


def ensure_config_dir() -> None:
    """Create config directory if it doesn't exist."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def load_config() -> dict:
    """Load configuration from file."""
    if not CONFIG_FILE.exists():
        return {}
    
    try:
        with open(CONFIG_FILE, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}


def save_config(config: dict) -> None:
    """Save configuration to file."""
    ensure_config_dir()
    with open(CONFIG_FILE, "w") as f:
        json.dump(config, f, indent=2)


def get_api_key() -> Optional[str]:
    """Get API key from config or environment."""
    # Check environment variable first
    env_key = os.environ.get("DROPITX_API_KEY")
    if env_key:
        return env_key
    
    # Check config file
    config = load_config()
    return config.get("api_key")


def set_api_key(api_key: str) -> None:
    """Set API key in config."""
    config = load_config()
    config["api_key"] = api_key
    save_config(config)


def get_api_url() -> str:
    """Get API base URL from config or environment."""
    # Check environment variable first
    env_url = os.environ.get("DROPITX_API_URL")
    if env_url:
        return env_url.rstrip("/")
    
    # Check config file
    config = load_config()
    url = config.get("api_url", DEFAULT_API_URL)
    return url.rstrip("/")


def get_frontend_url() -> str:
    """Get frontend base URL from config or environment (used for share links)."""
    # Check environment variable first
    env_url = os.environ.get("DROPITX_FRONTEND_URL")
    if env_url:
        return env_url.rstrip("/")

    # Check config file
    config = load_config()
    url = config.get("frontend_url", DEFAULT_FRONTEND_URL)
    return url.rstrip("/")
