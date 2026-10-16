import type { EntityManager } from '@mikro-orm/postgresql';
import { MikroORM } from '@mikro-orm/postgresql';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { readDatabaseUrl } from '../config';
import { createOrm } from './orm';

/** What a service injects. The ORM itself is not handed out: nothing outside this module flushes it. */
export const ENTITY_MANAGER = 'ENTITY_MANAGER';

/** The ORM instance, private to this module — it is here so that the pool can be closed on the way down. */
const MIKRO_ORM = 'MIKRO_ORM';

/**
 * Owns the connection's lifetime. The URL is read while the container is being built, so a platform
 * without a usable DATABASE_URL does not finish starting.
 *
 * Global because there is one database for the whole application and every feature module will want
 * the manager; the alternative is an `imports: [DatabaseModule]` line in each of them.
 *
 * The manager handed out is a **fork**, not the ORM's global one: MikroORM refuses to persist, load or
 * remove through the global instance, and a fork is a unit of work with an identity map of its own.
 * A service that needs to be isolated from its neighbours forks again — `em.fork()` — which is what the
 * first request that writes will have to decide, one milestone from here.
 */
@Global()
@Module({
  providers: [
    {
      provide: MIKRO_ORM,
      useFactory: () => createOrm({ databaseUrl: readDatabaseUrl(process.env.DATABASE_URL) }),
    },
    {
      provide: ENTITY_MANAGER,
      useFactory: (orm: MikroORM) => orm.em.fork(),
      inject: [MIKRO_ORM],
    },
  ],
  exports: [ENTITY_MANAGER],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(MIKRO_ORM) private readonly orm: MikroORM) {}

  /** On the way down, with no request in flight, the pool is closed rather than left to the process. */
  async onApplicationShutdown(): Promise<void> {
    await this.orm.close(true);
  }
}
