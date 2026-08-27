import "server-only";

/**
 * Maintenance-only port for a future authenticated, resumable rotation command.
 * Ordinary request/read paths must never implement or invoke this contract.
 */
export interface ReencryptionMaintenancePort<Checkpoint> {
  reencryptBatch(input: {
    fromVersion: number;
    toVersion: number;
    checkpoint?: Checkpoint;
    batchSize: number;
  }): Promise<{
    checkpoint?: Checkpoint;
    processed: number;
    complete: boolean;
  }>;
}
