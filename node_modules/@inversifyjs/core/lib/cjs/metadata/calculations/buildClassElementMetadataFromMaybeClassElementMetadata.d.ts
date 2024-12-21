import { ClassElementMetadata } from '../models/ClassElementMetadata';
import { MaybeClassElementMetadata } from '../models/MaybeClassElementMetadata';
import { MaybeManagedClassElementMetadata } from '../models/MaybeManagedClassElementMetadata';
export declare function buildClassElementMetadataFromMaybeClassElementMetadata<TParams extends unknown[]>(buildDefaultMetadata: (...params: TParams) => ClassElementMetadata, buildMetadataFromMaybeManagedMetadata: (metadata: MaybeManagedClassElementMetadata, ...params: TParams) => ClassElementMetadata): (...params: TParams) => (metadata: MaybeClassElementMetadata | undefined) => ClassElementMetadata;
//# sourceMappingURL=buildClassElementMetadataFromMaybeClassElementMetadata.d.ts.map