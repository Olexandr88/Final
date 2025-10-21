
      import SessionCoordinator from '../src/session-coordinator.js';
      import fs from 'fs';

      const coordinator = new SessionCoordinator();
      coordinator.initialize();

      async function work() {
        const testFile = process.argv[2];
        const workerId = process.argv[3];

        for (let i = 0; i < 3; i++) {
          await coordinator.safeWrite(testFile, async () => {
            const content = fs.readFileSync(testFile, 'utf8');
            const count = parseInt(content.trim()) || 0;
            fs.writeFileSync(testFile, (count + 1) + '\n');
            console.log(`Worker ${workerId}: incremented to ${count + 1}`);
          });
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        coordinator.cleanup();
      }

      work().catch(console.error);
    