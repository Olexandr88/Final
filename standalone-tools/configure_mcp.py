#!/usr/bin/env python3
"""
MCP Configuration Helper
Interactive tool to configure Model Context Protocol for Claude Desktop
"""

import sys
import json
import platform
from pathlib import Path
from typing import Dict, Any


class MCPConfigurator:
    """Helper for configuring MCP servers"""

    def __init__(self):
        self.os_name = platform.system()
        self.config_path = self._get_config_path()

    def _get_config_path(self) -> Path:
        """Get Claude Desktop config path for current OS"""
        if self.os_name == 'Darwin':  # macOS
            return Path.home() / 'Library' / 'Application Support' / 'Claude' / 'claude_desktop_config.json'
        elif self.os_name == 'Linux':
            return Path.home() / '.config' / 'Claude' / 'claude_desktop_config.json'
        elif self.os_name == 'Windows':
            return Path.home() / 'AppData' / 'Roaming' / 'Claude' / 'claude_desktop_config.json'
        else:
            raise RuntimeError(f"Unsupported operating system: {self.os_name}")

    def read_existing_config(self) -> Dict[str, Any]:
        """Read existing Claude Desktop configuration"""
        if self.config_path.exists():
            with open(self.config_path, 'r') as f:
                return json.load(f)
        return {'mcpServers': {}}

    def write_config(self, config: Dict[str, Any]):
        """Write configuration to Claude Desktop config file"""
        # Create directory if it doesn't exist
        self.config_path.parent.mkdir(parents=True, exist_ok=True)

        with open(self.config_path, 'w') as f:
            json.dump(config, f, indent=2)

        print(f"\n✓ Configuration written to: {self.config_path}")

    def generate_tools_config(self, tools_path: str) -> Dict[str, Any]:
        """Generate MCP server configuration"""
        return {
            'mcp-tools': {
                'command': 'node',
                'args': [str(Path(tools_path) / 'build' / 'index.js')]
            }
        }

    def interactive_setup(self):
        """Interactive configuration setup"""
        print("=" * 60)
        print("MCP Configuration Helper for Claude Desktop")
        print("=" * 60)
        print(f"\nDetected OS: {self.os_name}")
        print(f"Config path: {self.config_path}")
        print()

        # Check if config exists
        if self.config_path.exists():
            print("⚠ Existing configuration found!")
            response = input("Do you want to merge with existing config? (y/n): ").lower()
            if response != 'y':
                print("Aborted.")
                return
            config = self.read_existing_config()
        else:
            print("No existing configuration found. Creating new config...")
            config = {'mcpServers': {}}

        # Get MCP tools server path
        print("\nEnter the full path to mcp-tools-server directory")
        print("(or press Enter to use current directory):")
        tools_path = input("> ").strip()

        if not tools_path:
            tools_path = str(Path.cwd().parent / 'mcp-tools-server')

        tools_path = Path(tools_path).resolve()

        if not tools_path.exists():
            print(f"\n❌ Error: Path does not exist: {tools_path}")
            print("Please create the mcp-tools-server directory first.")
            return

        # Generate configuration
        mcp_config = self.generate_tools_config(str(tools_path))

        # Merge with existing config
        if 'mcpServers' not in config:
            config['mcpServers'] = {}

        config['mcpServers'].update(mcp_config)

        # Show preview
        print("\n" + "=" * 60)
        print("Configuration Preview:")
        print("=" * 60)
        print(json.dumps(config, indent=2))
        print()

        # Confirm
        response = input("Save this configuration? (y/n): ").lower()
        if response == 'y':
            self.write_config(config)
            print("\n✓ Configuration saved successfully!")
            print("\nNext steps:")
            print("1. cd to mcp-tools-server directory")
            print("2. Run: npm install")
            print("3. Run: npm run build")
            print("4. Restart Claude Desktop")
        else:
            print("Configuration not saved.")

    def validate_setup(self):
        """Validate MCP server setup"""
        print("\n" + "=" * 60)
        print("Validating MCP Setup")
        print("=" * 60)

        # Check config file exists
        if not self.config_path.exists():
            print("❌ Config file not found")
            return False

        # Read and validate config
        try:
            config = self.read_existing_config()

            if 'mcpServers' not in config:
                print("❌ No mcpServers section in config")
                return False

            if not config['mcpServers']:
                print("❌ No MCP servers configured")
                return False

            print(f"✓ Found {len(config['mcpServers'])} configured server(s)")

            for server_name, server_config in config['mcpServers'].items():
                print(f"\n  Server: {server_name}")
                print(f"  Command: {server_config.get('command')}")
                print(f"  Args: {server_config.get('args')}")

                # Check if server file exists
                if 'args' in server_config and server_config['args']:
                    server_path = Path(server_config['args'][0])
                    if server_path.exists():
                        print("  ✓ Server file exists")
                    else:
                        print(f"  ❌ Server file not found: {server_path}")

            return True

        except json.JSONDecodeError:
            print("❌ Invalid JSON in config file")
            return False
        except Exception as e:
            print(f"❌ Error: {e}")
            return False

    def show_quick_guide(self):
        """Show quick setup guide"""
        print("""
Quick Setup Guide
=================

Option 1: Interactive Setup (Recommended)
------------------------------------------
  python3 configure_mcp.py --interactive

Option 2: Manual Configuration
-------------------------------
  1. Edit the config file at:
     """ + str(self.config_path) + """

  2. Add this section:
     {
       "mcpServers": {
         "mcp-tools": {
           "command": "node",
           "args": ["/full/path/to/mcp-tools-server/build/index.js"]
         }
       }
     }

  3. Build the MCP server:
     cd mcp-tools-server
     npm install
     npm run build

  4. Restart Claude Desktop

Testing Your Setup
------------------
  python3 configure_mcp.py --validate

For standalone tools (no MCP needed):
--------------------------------------
  python3 text_tools.py hash "test" sha256
  python3 math_tools.py calc "2 + 2"
  python3 data_tools.py query '{"name":"Alice"}' name
  python3 file_tools.py stats .
""")


def main():
    """Main entry point"""
    try:
        configurator = MCPConfigurator()

        if len(sys.argv) > 1:
            if sys.argv[1] == '--interactive' or sys.argv[1] == '-i':
                configurator.interactive_setup()
            elif sys.argv[1] == '--validate' or sys.argv[1] == '-v':
                configurator.validate_setup()
            elif sys.argv[1] == '--help' or sys.argv[1] == '-h':
                configurator.show_quick_guide()
            else:
                print(f"Unknown option: {sys.argv[1]}")
                print("Use --help for usage information")
        else:
            configurator.show_quick_guide()

    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
