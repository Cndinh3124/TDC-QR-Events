// Chay migration: npm run migration:run (sau khi build)
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadEnv } from '../config/env';
import { buildDbOptions } from './data-source';

async function main() {
  const ds = new DataSource(buildDbOptions(loadEnv()));
  await ds.initialize();
  const done = await ds.runMigrations();
  console.log(`Da chay ${done.length} migration.`);
  await ds.destroy();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
