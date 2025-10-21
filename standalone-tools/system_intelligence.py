#!/usr/bin/env python3
"""
System Intelligence Dashboard
Analyzes your development environment using all secure tools
"""
import sys
import json
import subprocess
from pathlib import Path
from datetime import datetime
from collections import defaultdict

class SystemIntelligence:
    def __init__(self, scan_dir='.', file_pattern=r'\.py$'):
        self.scan_dir = Path(scan_dir)
        self.file_pattern = file_pattern  # Allow custom file patterns
        self.tools_dir = Path(__file__).parent  # Tools directory
        self.report = {
            'timestamp': datetime.now().isoformat(),
            'scan_directory': str(self.scan_dir.absolute()),
            'file_pattern': file_pattern,
            'findings': {}
        }

    def run_tool(self, tool, *args):
        """Run a standalone tool and return parsed JSON result"""
        try:
            tool_path = self.tools_dir / f'{tool}.py'
            result = subprocess.run(
                ['python', str(tool_path)] + list(args),
                capture_output=True,
                text=True,
                timeout=30
            )
            return json.loads(result.stdout) if result.stdout else {}
        except Exception as e:
            return {'error': str(e)}

    def analyze_codebase(self):
        """Use file_tools to analyze codebase structure"""
        print('[*] Analyzing codebase structure...')

        # Find all source files (deep search)
        py_files = self.run_tool('file_tools', 'search', str(self.scan_dir), self.file_pattern, '10')

        if 'results' in py_files:
            self.report['findings']['python_files'] = {
                'count': py_files.get('count', 0),
                'files': [r['path'] for r in py_files.get('results', [])][:10]  # Top 10
            }
            print(f"  Found {py_files.get('count', 0)} Python files")

        # Calculate total lines of code
        total_lines = 0
        file_sizes = []

        for file_path in self.report['findings'].get('python_files', {}).get('files', []):
            stats_result = self.run_tool('file_tools', 'stats', file_path)
            if 'result' in stats_result and 'size' in stats_result['result']:
                file_size = stats_result['result']['size']
                file_sizes.append(file_size)
                # Estimate lines (avg 50 bytes per line)
                total_lines += file_size // 50

        self.report['findings']['codebase_stats'] = {
            'estimated_lines': total_lines,
            'total_files': len(file_sizes),
            'avg_file_size': sum(file_sizes) // len(file_sizes) if file_sizes else 0
        }
        print(f"  Estimated ~{total_lines:,} lines of code")

    def analyze_code_quality(self):
        """Analyze file organization and naming patterns"""
        print('[*] Analyzing file organization...')

        # Analyze file naming patterns - adapt to file type
        is_js = r'\.js$' in self.file_pattern
        patterns = {
            'test_files': r'test.*\.(js|py)$',
            'config_files': r'(config|settings|constants).*\.(js|py)$',
            'client_files': r'.*client\.(js|py)$' if is_js else r'.*_client\.py$',
            'agent_files': r'.*agent.*\.(js|py)$',
            'fixed_files': r'.*FIXED\.py$',
            'secure_files': r'.*SECURE\.py$',
        }

        file_types = {}

        for pattern_name, pattern in patterns.items():
            result = self.run_tool('file_tools', 'search', str(self.scan_dir), pattern, '10')
            if 'count' in result and result.get('count', 0) > 0:
                file_types[pattern_name] = {
                    'count': result.get('count', 0),
                    'files': [r.get('name', '') for r in result.get('results', [])][:5]
                }

        self.report['findings']['file_organization'] = file_types

        total_categorized = sum(v.get('count', 0) for v in file_types.values())
        print(f"  Categorized {total_categorized} files by type")

    def find_security_issues(self):
        """Check for security-related file patterns"""
        print('[*] Checking security-related files...')

        # Look for security-related files
        security_files = {
            'deployment_files': r'deploy.*\.py$',
            'validator_files': r'(validat|sanitiz).*\.py$',
            'error_handlers': r'error.*\.py$',
            'security_modules': r'security.*\.py$',
        }

        security_inventory = {}

        for file_type, pattern in security_files.items():
            result = self.run_tool('file_tools', 'search', str(self.scan_dir), pattern, '10')
            if 'count' in result and result.get('count', 0) > 0:
                security_inventory[file_type] = {
                    'count': result.get('count', 0),
                    'files': [r.get('name', '') for r in result.get('results', [])]
                }

        self.report['findings']['security_inventory'] = security_inventory

        total_sec_files = sum(v.get('count', 0) for v in security_inventory.values())
        print(f"  Found {total_sec_files} security-related files")

    def find_duplicates(self):
        """Analyze file duplication and versioning"""
        print('[*] Analyzing file versioning...')

        # Look for versioned/duplicate files
        all_files = self.run_tool('file_tools', 'search', str(self.scan_dir), self.file_pattern, '10')

        if 'results' in all_files:
            files = [r.get('name', '') for r in all_files.get('results', [])]

            # Find base names (without FIXED, SECURE, etc.)
            base_names = {}
            for filename in files:
                # Remove common suffixes
                base = filename.replace('_FIXED', '').replace('_SECURE', '').replace('_OLD', '')
                if base != filename:  # This is a versioned file
                    if base not in base_names:
                        base_names[base] = []
                    base_names[base].append(filename)

            versioned_files = {k: v for k, v in base_names.items() if len(v) > 0}

            self.report['findings']['versioning_analysis'] = {
                'total_files': len(files),
                'versioned_file_groups': len(versioned_files),
                'versioned_files': list(versioned_files.keys())[:5]
            }
            print(f"  Found {len(versioned_files)} file groups with multiple versions")

    def calculate_project_stats(self):
        """Calculate overall project statistics"""
        print('[*] Calculating project statistics...')

        # Use math_tools to calculate statistics
        if 'codebase_stats' in self.report['findings']:
            stats = self.report['findings']['codebase_stats']

            # Calculate code density score (0-100)
            files = stats.get('total_files', 1)
            lines = stats.get('estimated_lines', 0)
            avg_size = stats.get('avg_file_size', 0)

            # Simple scoring: reward modular code (more files, moderate size)
            modularity_score = min(files * 5, 50)  # Max 50 points
            size_score = 50 - abs(avg_size - 3000) / 100  # Ideal: ~3KB files

            total_score = (modularity_score + max(0, size_score)) / 100 * 100

            self.report['findings']['project_health_score'] = round(total_score, 1)
            print(f"  Project health score: {round(total_score, 1)}/100")

    def generate_recommendations(self):
        """Generate actionable recommendations"""
        print('[*] Generating recommendations...')

        recommendations = []

        # Versioning recommendations
        if 'versioning_analysis' in self.report['findings']:
            ver_count = self.report['findings']['versioning_analysis'].get('versioned_file_groups', 0)
            if ver_count > 3:
                recommendations.append({
                    'priority': 'MEDIUM',
                    'category': 'Code Organization',
                    'issue': 'Multiple File Versions',
                    'action': f"Found {ver_count} files with multiple versions (FIXED, SECURE) - consolidate or use version control",
                    'impact': 'Reduced confusion and better version tracking'
                })

        # Modularity recommendations
        if 'codebase_stats' in self.report['findings']:
            avg_size = self.report['findings']['codebase_stats'].get('avg_file_size', 0)
            total_files = self.report['findings']['codebase_stats'].get('total_files', 0)

            if avg_size > 5000:
                recommendations.append({
                    'priority': 'LOW',
                    'category': 'Refactoring',
                    'issue': 'Large File Sizes',
                    'action': f"Average file size is {avg_size:,} bytes - consider breaking into smaller modules",
                    'impact': 'Improved maintainability and testability'
                })

            if total_files < 5:
                recommendations.append({
                    'priority': 'MEDIUM',
                    'category': 'Project Structure',
                    'issue': 'Limited Module Count',
                    'action': f"Only {total_files} core modules - consider better code organization",
                    'impact': 'Improved modularity and separation of concerns'
                })

        # Security inventory recommendations
        if 'security_inventory' in self.report['findings']:
            total_sec = sum(v.get('count', 0) for v in self.report['findings']['security_inventory'].values())
            if total_sec == 0:
                recommendations.append({
                    'priority': 'MEDIUM',
                    'category': 'Security',
                    'issue': 'No Security Modules',
                    'action': 'Consider adding validators, error handlers, and security utilities',
                    'impact': 'Improved application security posture'
                })

        self.report['recommendations'] = sorted(recommendations, key=lambda x: {'CRITICAL': 0, 'MEDIUM': 1, 'LOW': 2}[x['priority']])
        print(f"  Generated {len(recommendations)} recommendations")

    def generate_report(self):
        """Generate final formatted report"""
        print('\n' + '='*70)
        print('SYSTEM INTELLIGENCE REPORT')
        print('='*70)
        print(f"Scan Directory: {self.report['scan_directory']}")
        print(f"Timestamp: {self.report['timestamp']}")
        print(f"Project Health Score: {self.report['findings'].get('project_health_score', 'N/A')}/100")
        print('='*70)

        # Codebase Overview
        if 'codebase_stats' in self.report['findings']:
            print('\n[CODEBASE OVERVIEW]')
            stats = self.report['findings']['codebase_stats']
            print(f"  Total Files: {stats.get('total_files', 0)}")
            print(f"  Estimated Lines: ~{stats.get('estimated_lines', 0):,}")
            print(f"  Avg File Size: {stats.get('avg_file_size', 0):,} bytes")

        # File Organization
        if 'file_organization' in self.report['findings'] and self.report['findings']['file_organization']:
            print('\n[FILE ORGANIZATION]')
            for file_type, data in self.report['findings']['file_organization'].items():
                print(f"  - {file_type.replace('_', ' ').title()}: {data['count']}")
                if data.get('files'):
                    print(f"    Examples: {', '.join(data['files'][:3])}")

        # Security Inventory
        if 'security_inventory' in self.report['findings'] and self.report['findings']['security_inventory']:
            print('\n[SECURITY INVENTORY]')
            for file_type, data in self.report['findings']['security_inventory'].items():
                print(f"  - {file_type.replace('_', ' ').title()}: {data['count']}")
                if data.get('files'):
                    print(f"    Files: {', '.join(data['files'])}")

        # Versioning Analysis
        if 'versioning_analysis' in self.report['findings']:
            ver_data = self.report['findings']['versioning_analysis']
            print('\n[VERSIONING ANALYSIS]')
            print(f"  Total Files: {ver_data.get('total_files', 0)}")
            print(f"  Versioned File Groups: {ver_data.get('versioned_file_groups', 0)}")
            if ver_data.get('versioned_files'):
                print(f"  Example Versions: {', '.join(ver_data['versioned_files'][:3])}")

        # Recommendations
        if self.report.get('recommendations'):
            print('\n[RECOMMENDATIONS]')
            for idx, rec in enumerate(self.report['recommendations'], 1):
                priority_icon = {'CRITICAL': '[!!!]', 'MEDIUM': '[!!]', 'LOW': '[!]'}[rec['priority']]
                print(f"\n  {idx}. {priority_icon} {rec['category']}: {rec['issue']}")
                print(f"     Action: {rec['action']}")
                print(f"     Impact: {rec['impact']}")

        print('\n' + '='*70)
        print('END OF REPORT')
        print('='*70)

        # Save JSON report
        report_file = Path('system_intelligence_report.json')
        with open(report_file, 'w') as f:
            json.dump(self.report, f, indent=2)
        print(f"\nDetailed JSON report saved to: {report_file.absolute()}")

        return self.report

    def run_full_analysis(self):
        """Run complete system intelligence analysis"""
        print('\n[SYSTEM INTELLIGENCE DASHBOARD]')
        print('Initializing comprehensive analysis...\n')

        self.analyze_codebase()
        self.calculate_project_stats()
        self.analyze_code_quality()
        self.find_security_issues()
        self.find_duplicates()
        self.generate_recommendations()

        return self.generate_report()

def main():
    if len(sys.argv) > 1:
        scan_dir = sys.argv[1]
    else:
        scan_dir = '.'

    # Auto-detect file pattern based on directory
    file_pattern = r'\.py$'  # Default to Python
    if len(sys.argv) > 2:
        file_pattern = sys.argv[2]
    else:
        # Auto-detect based on directory contents
        scan_path = Path(scan_dir)
        if (scan_path / 'package.json').exists() or (scan_path / 'node_modules').exists():
            file_pattern = r'\.js$'
            print(f"Detected Node.js project - scanning JavaScript files")
        else:
            print(f"Scanning Python files")

    print(f"Starting System Intelligence scan of: {scan_dir}")
    print(f"File pattern: {file_pattern}\n")

    intelligence = SystemIntelligence(scan_dir, file_pattern)
    intelligence.run_full_analysis()

if __name__ == '__main__':
    main()
