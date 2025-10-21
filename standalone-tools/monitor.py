#!/usr/bin/env python3
"""Real-time monitoring and health checks"""
import sys
import json
import time
from pathlib import Path
from datetime import datetime
import subprocess

class HealthMonitor:
    def __init__(self):
        self.metrics_dir = Path('.deployment/metrics')
        self.metrics_dir.mkdir(parents=True, exist_ok=True)
    
    def check_tool(self, tool_name, test_args):
        """Check if a tool is working"""
        start = time.perf_counter()
        try:
            result = subprocess.run(
                ['python', f'{tool_name}.py'] + test_args,
                capture_output=True,
                timeout=5,
                text=True
            )
            elapsed_ms = (time.perf_counter() - start) * 1000
            
            if result.returncode == 0:
                return {'status': 'healthy', 'response_time_ms': round(elapsed_ms, 2)}
            else:
                return {'status': 'unhealthy', 'error': result.stderr[:100]}
        except subprocess.TimeoutExpired:
            return {'status': 'timeout', 'error': 'Tool timed out'}
        except Exception as e:
            return {'status': 'error', 'error': str(e)}
    
    def run_health_check(self):
        """Run health checks on all tools"""
        checks = {
            'data_tools': ['filter', '[{"x":1}]', 'x==1'],
            'math_tools': ['calc', '2+2'],
            'file_tools': ['list', '.', 'name'],
            'text_tools': ['regex_match', 'test', 'test'],
        }
        
        results = {}
        healthy_count = 0
        
        for tool, args in checks.items():
            result = self.check_tool(tool, args)
            results[tool] = result
            if result['status'] == 'healthy':
                healthy_count += 1
        
        # Summary
        timestamp = datetime.now().isoformat()
        summary = {
            'timestamp': timestamp,
            'total_services': len(checks),
            'healthy_services': healthy_count,
            'services': results
        }
        
        # Save metrics
        metrics_file = self.metrics_dir / f'health-{datetime.now().strftime("%Y%m%d")}.json'
        with open(metrics_file, 'a') as f:
            f.write(json.dumps(summary) + '\n')
        
        return summary
    
    def display_health(self, summary):
        """Display health check results"""
        print(f"\n{'='*60}")
        print(f"Health Check - {summary['timestamp']}")
        print(f"{'='*60}")
        print(f"Status: {summary['healthy_services']}/{summary['total_services']} services healthy\n")
        
        for service, result in summary['services'].items():
            status_icon = '✓' if result['status'] == 'healthy' else '✗'
            print(f"  {status_icon} {service}: {result['status']}", end='')
            if result['status'] == 'healthy':
                print(f" ({result['response_time_ms']}ms)")
            else:
                print(f" - {result.get('error', 'unknown error')}")
        
        print(f"{'='*60}\n")

if __name__ == '__main__':
    monitor = HealthMonitor()
    once = '--once' in sys.argv
    
    if once:
        summary = monitor.run_health_check()
        monitor.display_health(summary)
    else:
        print('Starting continuous monitoring (Ctrl+C to stop)...')
        try:
            while True:
                summary = monitor.run_health_check()
                monitor.display_health(summary)
                time.sleep(60)
        except KeyboardInterrupt:
            print('\nMonitoring stopped.')
