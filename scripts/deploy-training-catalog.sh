#!/bin/bash

##
# Training Catalog Deployment Script
# Deploys Microsoft Learn Training Catalog Integration
##

set -e  # Exit on error

echo "========================================="
echo "Training Catalog Deployment"
echo "========================================="

# Check Node.js version
echo "Checking Node.js version..."
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Error: Node.js 18+ required (found: $(node --version))"
  exit 1
fi
echo "✓ Node.js version OK"

# Install dependencies if needed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo "Installing dependencies..."
  npm install
  echo "✓ Dependencies installed"
else
  echo "✓ Dependencies already installed"
fi

# Install new dependencies for training catalog
echo "Installing training catalog dependencies..."
npm install --save node-cron@^3.0.3 node-cache@^5.1.2
echo "✓ Training catalog dependencies installed"

# Create data directory
echo "Creating data directory..."
mkdir -p ./data
echo "✓ Data directory created"

# Run tests
echo "Running tests..."
npm test
echo "✓ Tests passed"

# Initialize database
echo "Initializing training catalog database..."
node -e "
  import { TrainingCatalogRepository } from './src/database/training-catalog-repository.js';
  const repo = new TrainingCatalogRepository();
  console.log('✓ Database initialized');
  repo.close();
"
echo "✓ Database schema created"

# Trigger initial FULL sync
echo "Triggering initial FULL sync (this may take a few minutes)..."
node -e "
  import { TrainingSyncService } from './src/services/training-sync-service.js';
  const sync = new TrainingSyncService();

  async function run() {
    try {
      const result = await sync.triggerManualSync('FULL');
      if (result.success) {
        console.log('✓ Initial sync completed');
        console.log('  - Items synced:', result.itemsSynced);
        console.log('  - Duration:', result.duration);
        console.log('  - Modules:', result.breakdown.modules);
        console.log('  - Paths:', result.breakdown.paths);
        console.log('  - Certifications:', result.breakdown.certifications);
        console.log('  - Exams:', result.breakdown.exams);
      } else {
        console.error('✗ Sync failed:', result.error);
        process.exit(1);
      }
    } catch (error) {
      console.error('✗ Sync error:', error.message);
      process.exit(1);
    } finally {
      sync.shutdown();
    }
  }

  run();
"

# Add training routes to main server
echo "Integrating training routes..."
if ! grep -q "training-routes" src/server.js 2>/dev/null; then
  echo "Note: Manual integration required - add the following to your Express server:"
  echo ""
  echo "  import trainingRoutes from './api/training-routes.js';"
  echo "  app.use('/api/training', trainingRoutes);"
  echo ""
fi

# Start training sync service
echo "Starting training sync service..."
npm run start:training-sync &
SYNC_PID=$!
echo "✓ Sync service started (PID: $SYNC_PID)"

# Start training assistant agent
echo "Starting training assistant agent..."
npm run start:training-agent &
AGENT_PID=$!
echo "✓ Agent started (PID: $AGENT_PID)"

echo ""
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo ""
echo "Services:"
echo "  - Training Sync Service: Running (PID: $SYNC_PID)"
echo "  - Training Assistant Agent: Running (PID: $AGENT_PID)"
echo ""
echo "API Endpoints:"
echo "  - GET  /api/training/catalog"
echo "  - GET  /api/training/catalog/:uid"
echo "  - GET  /api/training/search"
echo "  - POST /api/training/recommendations"
echo "  - POST /api/training/progress"
echo "  - POST /api/training/sync/trigger"
echo "  - GET  /api/training/sync/status"
echo "  - GET  /api/training/health"
echo ""
echo "Electron UI:"
echo "  - Open electron/training-catalog.html in the Electron app"
echo ""
echo "Next Steps:"
echo "  1. Verify services are running: ps aux | grep node"
echo "  2. Test API: curl http://localhost:3000/api/training/health"
echo "  3. Open Electron app and navigate to Training Catalog"
echo "  4. Monitor logs: tail -f logs/training.log"
echo ""
echo "To stop services:"
echo "  kill $SYNC_PID $AGENT_PID"
echo ""
