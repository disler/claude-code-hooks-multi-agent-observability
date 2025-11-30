#!/usr/bin/env python3
"""
Plugin Manager for Claude Code Hooks

Discovers, loads, and executes plugins for hook events.
Plugins are auto-discovered from the plugins/ directory.

Plugin Structure:
  plugins/
    my_plugin/
      plugin.json          # Plugin metadata
      src/
        plugin.py          # Entry point with handle_hook(hook_type, input_data)
      config/              # Plugin configuration files

Plugin Metadata (plugin.json):
{
  "name": "my_plugin",
  "version": "1.0.0",
  "description": "My awesome plugin",
  "enabled": true,
  "hooks": ["PostToolUse", "Stop"],
  "entry_point": "src.plugin:handle_hook"
}

Usage in hooks:
  from plugin_manager import execute_plugins
  execute_plugins("PostToolUse", input_data)
"""

from pathlib import Path
from typing import Dict, List, Any, Optional
import json
import importlib.util
import sys
import os


class Plugin:
    """Represents a single plugin"""

    def __init__(self, name: str, metadata: Dict[str, Any], handler: callable):
        self.name = name
        self.metadata = metadata
        self.handler = handler

    @property
    def enabled(self) -> bool:
        """Check if plugin is enabled"""
        return self.metadata.get("enabled", True)

    @property
    def supported_hooks(self) -> List[str]:
        """Get list of hooks this plugin supports"""
        return self.metadata.get("hooks", [])

    @property
    def version(self) -> str:
        """Get plugin version"""
        return self.metadata.get("version", "unknown")

    def supports_hook(self, hook_type: str) -> bool:
        """Check if plugin supports a specific hook type"""
        # If no hooks specified, plugin handles all hooks
        if not self.supported_hooks:
            return True
        return hook_type in self.supported_hooks

    def execute(self, hook_type: str, input_data: Dict[str, Any]) -> None:
        """Execute plugin handler"""
        if not self.enabled:
            return

        if not self.supports_hook(hook_type):
            return

        try:
            self.handler(hook_type, input_data)
        except Exception as e:
            # Never let plugin errors crash the hook
            print(f"Plugin '{self.name}' error: {e}", file=sys.stderr)


class PluginManager:
    """Manages hook plugins"""

    def __init__(self, plugins_dir: Optional[Path] = None):
        """
        Initialize plugin manager

        Args:
            plugins_dir: Directory containing plugins (default: ./plugins)
        """
        self.plugins_dir = plugins_dir or Path(__file__).parent / "plugins"
        self.plugins: Dict[str, Plugin] = {}
        self._discover_plugins()

    def _discover_plugins(self) -> None:
        """Discover all valid plugins in plugins directory"""
        if not self.plugins_dir.exists():
            return

        for plugin_dir in self.plugins_dir.iterdir():
            if not plugin_dir.is_dir():
                continue

            # Skip hidden directories and __pycache__
            if plugin_dir.name.startswith('.') or plugin_dir.name == '__pycache__':
                continue

            # Check for plugin.json metadata
            metadata_file = plugin_dir / "plugin.json"
            if not metadata_file.exists():
                continue

            try:
                # Load plugin
                plugin = self._load_plugin(plugin_dir, metadata_file)
                if plugin:
                    self.plugins[plugin.name] = plugin
            except Exception as e:
                # Silently skip broken plugins
                print(f"Warning: Failed to load plugin '{plugin_dir.name}': {e}",
                      file=sys.stderr)

    def _load_plugin(self, plugin_dir: Path, metadata_file: Path) -> Optional[Plugin]:
        """
        Load a single plugin

        Args:
            plugin_dir: Plugin directory path
            metadata_file: Path to plugin.json

        Returns:
            Plugin instance or None if invalid
        """
        # Load metadata
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)

        # Validate required fields
        required_fields = ['name', 'version', 'entry_point']
        if not all(field in metadata for field in required_fields):
            print(f"Warning: Plugin '{plugin_dir.name}' missing required metadata fields",
                  file=sys.stderr)
            return None

        # Parse entry point (format: "module.path:function_name")
        entry_point = metadata['entry_point']
        if ':' not in entry_point:
            print(f"Warning: Plugin '{metadata['name']}' has invalid entry_point format",
                  file=sys.stderr)
            return None

        module_path, handler_name = entry_point.split(':', 1)

        # Build path to module file
        module_file = plugin_dir / f"{module_path.replace('.', '/')}.py"
        if not module_file.exists():
            print(f"Warning: Plugin '{metadata['name']}' entry point not found: {module_file}",
                  file=sys.stderr)
            return None

        # Import plugin module
        spec = importlib.util.spec_from_file_location(
            f"claude_plugin_{metadata['name']}",
            module_file
        )
        if not spec or not spec.loader:
            return None

        module = importlib.util.module_from_spec(spec)

        # Add plugin directory to sys.path for plugin imports
        plugin_dir_str = str(plugin_dir)
        if plugin_dir_str not in sys.path:
            sys.path.insert(0, plugin_dir_str)

        # Execute module
        spec.loader.exec_module(module)

        # Get handler function
        handler = getattr(module, handler_name, None)
        if not callable(handler):
            print(f"Warning: Plugin '{metadata['name']}' handler '{handler_name}' not found or not callable",
                  file=sys.stderr)
            return None

        return Plugin(metadata['name'], metadata, handler)

    def execute_hook(self, hook_type: str, input_data: Dict[str, Any]) -> None:
        """
        Execute all plugins registered for this hook type

        Args:
            hook_type: Hook event type (e.g., "PostToolUse", "Stop")
            input_data: Hook input data
        """
        # Get priority from metadata (default 50)
        plugins_with_priority = [
            (plugin, plugin.metadata.get('priority', 50))
            for plugin in self.plugins.values()
        ]

        # Sort by priority (lower number = higher priority)
        plugins_with_priority.sort(key=lambda x: x[1])

        # Execute plugins in priority order
        for plugin, _ in plugins_with_priority:
            plugin.execute(hook_type, input_data)

    def get_plugins(self) -> List[Plugin]:
        """Get list of all loaded plugins"""
        return list(self.plugins.values())

    def get_plugin(self, name: str) -> Optional[Plugin]:
        """Get a specific plugin by name"""
        return self.plugins.get(name)


# Singleton instance
_manager: Optional[PluginManager] = None


def get_manager() -> PluginManager:
    """Get or create the singleton plugin manager instance"""
    global _manager
    if _manager is None:
        _manager = PluginManager()
    return _manager


def execute_plugins(hook_type: str, input_data: Dict[str, Any]) -> None:
    """
    Convenience function for hooks to call.
    Discovers and executes all plugins for the given hook type.

    Args:
        hook_type: Hook event type (e.g., "PostToolUse", "Stop")
        input_data: Hook input data dictionary

    Example:
        from plugin_manager import execute_plugins
        execute_plugins("PostToolUse", input_data)
    """
    try:
        manager = get_manager()
        manager.execute_hook(hook_type, input_data)
    except Exception as e:
        # Never crash the hook
        print(f"Plugin manager error: {e}", file=sys.stderr)


# CLI for testing/debugging
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Plugin Manager CLI")
    parser.add_argument("--list", action="store_true", help="List all discovered plugins")
    parser.add_argument("--test", metavar="HOOK_TYPE", help="Test plugins for a specific hook type")

    args = parser.parse_args()

    manager = get_manager()

    if args.list:
        print("Discovered Plugins:")
        print("-" * 60)
        for plugin in manager.get_plugins():
            status = "✓ enabled" if plugin.enabled else "✗ disabled"
            print(f"{plugin.name} v{plugin.version} ({status})")
            if plugin.supported_hooks:
                print(f"  Hooks: {', '.join(plugin.supported_hooks)}")
            else:
                print(f"  Hooks: all")
            print()

    elif args.test:
        hook_type = args.test
        test_data = {
            "source_app": "TestManager",
            "session_id": "test-session-12345678",
            "tool_name": "TestTool"
        }
        print(f"Testing plugins for hook: {hook_type}")
        print(f"Test data: {test_data}")
        print("-" * 60)
        execute_plugins(hook_type, test_data)
        print("Done")

    else:
        parser.print_help()
