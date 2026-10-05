import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import appConfig from './config/app.config.js';
import authConfig from './config/auth.config.js';
import databaseConfig from './config/database.config.js';
import { validateEnvironment } from './config/environment.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}`,
        '.env',
      ],
      load: [appConfig, authConfig, databaseConfig],
      validate: validateEnvironment,
    }),
    DatabaseModule,
    AuthModule,
    HealthModule,
  ],
})
export class AppModule {}
