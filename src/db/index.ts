import { drizzle } from 'drizzle-orm/bun-sql';
import { SQL } from 'bun';
import { env } from '../config/env.js';
import * as schema from './schema.js';

const client = new SQL(env.DATABASE_URL);
export const db = drizzle({ client, schema });
