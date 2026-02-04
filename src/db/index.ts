import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { env } from '../config/env.js';
import * as schema from './schema.js';

const client = new SQL(env.DATABASE_URL);
export const db = drizzle({ client, schema });
