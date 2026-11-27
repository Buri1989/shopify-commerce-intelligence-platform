import type { Logger as PinoLogger } from 'pino';
import {
  STORE_WALKS,
  type StoreRetrievers,
  type WalkedKind,
} from './store-walks.js';

const LOG_CONTEXT = 'walkStoreRetrievers';
const WALKED_MESSAGE = 'kind walked';

export async function walkStoreRetrievers(
  storeId: number,
  retrievers: StoreRetrievers,
  logger: Pick<PinoLogger, 'info'>,
): Promise<void> {
  for (const walk of STORE_WALKS) {
    logWalkedKinds(logger, storeId, await walk(storeId, retrievers));
  }
}

function logWalkedKinds(
  logger: Pick<PinoLogger, 'info'>,
  storeId: number,
  walkedKinds: WalkedKind[],
): void {
  walkedKinds.forEach((walkedKind) =>
    logger.info(
      { context: LOG_CONTEXT, storeId, ...walkedKind },
      WALKED_MESSAGE,
    ),
  );
}
