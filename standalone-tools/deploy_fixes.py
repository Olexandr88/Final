#!/usr/bin/env python3
"""
Deployment Script for Fixed Python Standalone Tools
Automates backup, deployment, validation, and rollback of security fixes
"""

import os
import sys
import json
import shutil
import hashlib
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Tuple, Any


class DeploymentManager:
    """Manages deployment of fixed Python tools"""

    def __init__(self, base_dir: str = None):
        self.base_dir = Path(base_dir) if base_dir else Path(__file__).parent
        self.backup_dir = self.base_dir / '.backups'
        self.deployment_log = self.base_dir / 'deployment.log'
        self.tools = ['text_tools.py', 'data_tools.py', 'file_tools.py', 'math_tools.py']
        self.deployment_id = datetime.now().strftime('%Y%m%d_%H%M%S')

    def log(self, message: str, level: str = 'INFO'):
        """Log deployment activity"""
        timestamp = datetime.now().isoformat()
        log_entry = f"[{timestamp}] [{level}] {message}"
        print(log_entry)

        with open(self.deployment_log, 'a') as f:
            f.write(log_entry + '\n')

    def calculate_checksum(self, file_path: Path) -> str:
        """Calculate SHA-256 checksum of file"""
        sha256 = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                sha256.update(chunk)
        return sha256.hexdigest()

    def create_backup(self) -> Tuple[bool, str]:
        """Create backup of existing tools"""
        self.log('Creating backup of existing tools...')

        try:
            # Create backup directory with deployment ID
            backup_path = self.backup_dir / self.deployment_id
            backup_path.mkdir(parents=True, exist_ok=True)

            # Backup metadata
            metadata = {
                'deployment_id': self.deployment_id,
                'timestamp': datetime.now().isoformat(),
                'files': []
            }

            # Backup each tool
            for tool in self.tools:
                source = self.base_dir / tool
                if source.exists():
                    dest = backup_path / tool
                    shutil.copy2(source, dest)

                    checksum = self.calculate_checksum(source)
                    metadata['files'].append({
                        'name': tool,
                        'size': source.stat().st_size,
                        'checksum': checksum,
                        'modified': datetime.fromtimestamp(source.stat().st_mtime).isoformat()
                    })
                    self.log(f'  ✓ Backed up {tool} (SHA-256: {checksum[:16]}...)')
                else:
                    self.log(f'  ⚠ File not found: {tool}', 'WARNING')

            # Save metadata
            metadata_file = backup_path / 'metadata.json'
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)

            self.log(f'✓ Backup completed: {backup_path}')
            return True, str(backup_path)

        except Exception as e:
            self.log(f'✗ Backup failed: {e}', 'ERROR')
            return False, str(e)

    def verify_fixes_available(self) -> Tuple[bool, List[str]]:
        """Check if fixed versions are available"""
        self.log('Verifying fixed versions...')

        fixed_dir = self.base_dir / 'fixed'
        if not fixed_dir.exists():
            self.log('✗ Fixed directory not found', 'ERROR')
            return False, ['Fixed directory not found']

        missing = []
        for tool in self.tools:
            fixed_file = fixed_dir / tool
            if not fixed_file.exists():
                missing.append(tool)
                self.log(f'  ✗ Missing: {tool}', 'WARNING')
            else:
                self.log(f'  ✓ Found: {tool}')

        if missing:
            return False, missing

        self.log('✓ All fixed versions available')
        return True, []

    def deploy_fixes(self) -> Tuple[bool, List[str]]:
        """Deploy fixed versions"""
        self.log('Deploying fixed versions...')

        try:
            fixed_dir = self.base_dir / 'fixed'
            deployed = []

            for tool in self.tools:
                source = fixed_dir / tool
                dest = self.base_dir / tool

                if source.exists():
                    # Copy fixed version
                    shutil.copy2(source, dest)

                    # Verify deployment
                    checksum = self.calculate_checksum(dest)
                    deployed.append({
                        'name': tool,
                        'checksum': checksum
                    })

                    self.log(f'  ✓ Deployed {tool} (SHA-256: {checksum[:16]}...)')
                else:
                    self.log(f'  ✗ Source not found: {tool}', 'WARNING')

            self.log(f'✓ Deployment completed ({len(deployed)}/{len(self.tools)} files)')
            return True, deployed

        except Exception as e:
            self.log(f'✗ Deployment failed: {e}', 'ERROR')
            return False, [str(e)]

    def run_validation(self) -> Tuple[bool, Dict[str, Any]]:
        """Run validation tests on deployed tools"""
        self.log('Running validation tests...')

        # Check if validation script exists
        validator = self.base_dir / 'validate_all.py'
        if not validator.exists():
            self.log('  ⚠ Validation script not found, skipping...', 'WARNING')
            return True, {'status': 'skipped', 'reason': 'validator not found'}

        try:
            # Run validation script
            result = subprocess.run(
                [sys.executable, str(validator)],
                cwd=str(self.base_dir),
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode == 0:
                self.log('✓ Validation passed')
                return True, {
                    'status': 'passed',
                    'stdout': result.stdout,
                    'stderr': result.stderr
                }
            else:
                self.log(f'✗ Validation failed (exit code: {result.returncode})', 'ERROR')
                self.log(f'  STDERR: {result.stderr}', 'ERROR')
                return False, {
                    'status': 'failed',
                    'exit_code': result.returncode,
                    'stdout': result.stdout,
                    'stderr': result.stderr
                }

        except subprocess.TimeoutExpired:
            self.log('✗ Validation timeout', 'ERROR')
            return False, {'status': 'timeout'}

        except Exception as e:
            self.log(f'✗ Validation error: {e}', 'ERROR')
            return False, {'status': 'error', 'message': str(e)}

    def rollback(self, backup_path: str) -> bool:
        """Rollback to previous version"""
        self.log(f'Rolling back to backup: {backup_path}')

        try:
            backup_dir = Path(backup_path)
            if not backup_dir.exists():
                self.log(f'✗ Backup not found: {backup_path}', 'ERROR')
                return False

            # Restore each file
            for tool in self.tools:
                source = backup_dir / tool
                dest = self.base_dir / tool

                if source.exists():
                    shutil.copy2(source, dest)
                    self.log(f'  ✓ Restored {tool}')
                else:
                    self.log(f'  ⚠ Backup file not found: {tool}', 'WARNING')

            self.log('✓ Rollback completed')
            return True

        except Exception as e:
            self.log(f'✗ Rollback failed: {e}', 'ERROR')
            return False

    def list_backups(self) -> List[Dict[str, Any]]:
        """List all available backups"""
        if not self.backup_dir.exists():
            return []

        backups = []
        for backup_path in sorted(self.backup_dir.iterdir(), reverse=True):
            if backup_path.is_dir():
                metadata_file = backup_path / 'metadata.json'
                if metadata_file.exists():
                    with open(metadata_file) as f:
                        metadata = json.load(f)
                    backups.append({
                        'path': str(backup_path),
                        'id': backup_path.name,
                        'timestamp': metadata.get('timestamp'),
                        'files': len(metadata.get('files', []))
                    })

        return backups

    def deploy(self, skip_validation: bool = False) -> bool:
        """Full deployment workflow"""
        self.log('=' * 60)
        self.log(f'Starting deployment: {self.deployment_id}')
        self.log('=' * 60)

        # Step 1: Verify fixed versions exist
        fixes_ok, missing = self.verify_fixes_available()
        if not fixes_ok:
            self.log(f'✗ Deployment aborted: Missing files: {missing}', 'ERROR')
            return False

        # Step 2: Create backup
        backup_ok, backup_path = self.create_backup()
        if not backup_ok:
            self.log('✗ Deployment aborted: Backup failed', 'ERROR')
            return False

        # Step 3: Deploy fixed versions
        deploy_ok, deployed = self.deploy_fixes()
        if not deploy_ok:
            self.log('✗ Deployment failed, attempting rollback...', 'ERROR')
            self.rollback(backup_path)
            return False

        # Step 4: Run validation
        if not skip_validation:
            valid_ok, validation_result = self.run_validation()
            if not valid_ok:
                self.log('✗ Validation failed, rolling back...', 'ERROR')
                self.rollback(backup_path)
                return False

        self.log('=' * 60)
        self.log('✓ DEPLOYMENT SUCCESSFUL')
        self.log(f'  Backup location: {backup_path}')
        self.log(f'  Files deployed: {len(deployed)}')
        self.log('=' * 60)

        return True


def main():
    """CLI interface"""
    import argparse

    parser = argparse.ArgumentParser(
        description='Deploy fixed Python standalone tools',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  ./deploy_fixes.py deploy              Deploy with validation
  ./deploy_fixes.py deploy --skip-validation  Deploy without validation
  ./deploy_fixes.py rollback 20251020_143000  Rollback to specific backup
  ./deploy_fixes.py list-backups        List available backups
  ./deploy_fixes.py verify              Verify fixes are available
        """
    )

    parser.add_argument(
        'command',
        choices=['deploy', 'rollback', 'list-backups', 'verify'],
        help='Command to execute'
    )
    parser.add_argument(
        'backup_id',
        nargs='?',
        help='Backup ID for rollback command'
    )
    parser.add_argument(
        '--skip-validation',
        action='store_true',
        help='Skip validation tests'
    )
    parser.add_argument(
        '--base-dir',
        help='Base directory (default: current directory)'
    )

    args = parser.parse_args()

    # Initialize deployment manager
    manager = DeploymentManager(args.base_dir)

    # Execute command
    if args.command == 'deploy':
        success = manager.deploy(skip_validation=args.skip_validation)
        sys.exit(0 if success else 1)

    elif args.command == 'rollback':
        if not args.backup_id:
            print('Error: backup_id required for rollback')
            sys.exit(1)

        backup_path = manager.backup_dir / args.backup_id
        success = manager.rollback(str(backup_path))
        sys.exit(0 if success else 1)

    elif args.command == 'list-backups':
        backups = manager.list_backups()
        if not backups:
            print('No backups found')
        else:
            print(f'Available backups ({len(backups)}):')
            print()
            for backup in backups:
                print(f"  ID: {backup['id']}")
                print(f"  Time: {backup['timestamp']}")
                print(f"  Files: {backup['files']}")
                print(f"  Path: {backup['path']}")
                print()

    elif args.command == 'verify':
        fixes_ok, missing = manager.verify_fixes_available()
        if fixes_ok:
            print('✓ All fixed versions available')
            sys.exit(0)
        else:
            print(f'✗ Missing files: {missing}')
            sys.exit(1)


if __name__ == '__main__':
    main()
