import { inject } from 'vitest';
import './setup.js';

// The app's config module reads process.env once, when
// src/config/config.module.ts is imported, so the address has to be in place
// before any spec imports the app.
const database = inject('database');
process.env.DB_HOST = database.host;
process.env.DB_PORT = String(database.port);
process.env.DB_NAME = database.name;
process.env.DB_USER = database.user;
process.env.DB_PASSWORD = database.password;
