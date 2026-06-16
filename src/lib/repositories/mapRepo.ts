/**
 * Map repository — placeholder for online map module.
 * Registers a no-op sync handler so the engine doesn't fail on queued map items.
 */

import { registerSyncHandler } from '../sync/syncEngine'

registerSyncHandler('map', async () => {
  // Online map sync not yet implemented
})
