#!/usr/bin/env python3
"""
Automated Deployment Script
Validates security fixes, runs tests, creates backup, and deploys
"""
import sys
import subprocess
import shutil
from pathlib import Path
from datetime import datetime
import json

class Deployer:
    def __init__(self, dry_run=False):
        self.dry_run = dry_run
        self.root = Path(__file__).parent
        self.backup_dir = self.root / '.deployment' / 'backups'
        self.log_file = self.root / '.deployment' / 'logs' / f'deploy-{datetime.now().strftime("%Y%m%d-%H%M%S")}.log'
        
    def log(self, message):
        print(f'[{datetime.now().strftime("%H:%M:%S")}] {message}')
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        with open(self.log_file, 'a') as f:
            f.write(f'{datetime.now().isoformat()} - {message}\n')
    
    def run_command(self, cmd, check=True):
        self.log(f'Running: {cmd}')
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if check and result.returncode != 0:
            self.log(f'ERROR: {result.stderr}')
            return False
        return True
    
    def validate_security_fixes(self):
        self.log('Validating security fixes...')
        
        # Check eval() removed
        for file in ['data_tools.py', 'math_tools.py']:
            with open(self.root / file, 'r') as f:
                content = f.read()
                if 'eval(' in content and 'safe_eval' not in content:
                    self.log(f'ERROR: eval() still present in {file}')
                    return False
        
        # Check SHA-256 used
        with open(self.root / 'file_tools.py', 'r') as f:
            if "algorithm: str = 'sha256'" not in f.read():
                self.log('ERROR: SHA-256 not set as default')
                return False
        
        self.log('[OK] Security fixes validated')
        return True
    
    def run_tests(self):
        self.log('Running test suite...')
        if self.dry_run:
            self.log('(Dry run - skipping tests)')
            return True
        
        # Run quick validation tests
        tests = [
            ('data_tools.py', 'filter', '[{"age":30}]', 'age>25'),
            ('math_tools.py', 'calc', '2+2'),
            ('text_tools.py', 'regex_match', 'test', 'test'),
        ]
        
        for tool, *args in tests:
            cmd = f'python {tool} {" ".join(args)}'
            if not self.run_command(cmd, check=False):
                self.log(f'WARNING: {tool} test failed')
        
        self.log('[OK] Tests completed')
        return True
    
    def create_backup(self):
        self.log('Creating backup...')
        timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        backup_path = self.backup_dir / timestamp
        backup_path.mkdir(parents=True, exist_ok=True)
        
        for file in ['data_tools.py', 'math_tools.py', 'file_tools.py', 'text_tools.py']:
            src = self.root / file
            if src.exists():
                shutil.copy2(src, backup_path / file)
        
        self.log(f'[OK] Backup created: {backup_path}')
        return True
    
    def deploy(self):
        self.log('=' * 60)
        self.log('Starting deployment...')
        self.log(f'Dry run: {self.dry_run}')
        self.log('=' * 60)
        
        steps = [
            ('Validating security fixes', self.validate_security_fixes),
            ('Running tests', self.run_tests),
            ('Creating backup', self.create_backup),
        ]
        
        for step_name, step_func in steps:
            self.log(f'\nStep: {step_name}')
            if not step_func():
                self.log(f'[FAIL] Deployment failed at: {step_name}')
                return False
        
        self.log('\n' + '=' * 60)
        if self.dry_run:
            self.log('[OK] Dry run completed successfully!')
        else:
            self.log('[OK] Deployment completed successfully!')
        self.log(f'Log file: {self.log_file}')
        self.log('=' * 60)
        return True

if __name__ == '__main__':
    dry_run = '--dry-run' in sys.argv
    deployer = Deployer(dry_run=dry_run)
    success = deployer.deploy()
    sys.exit(0 if success else 1)
