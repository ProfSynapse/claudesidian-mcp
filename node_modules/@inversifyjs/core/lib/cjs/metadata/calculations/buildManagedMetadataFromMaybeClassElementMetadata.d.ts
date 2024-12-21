import { LazyServiceIdentifier, ServiceIdentifier } from '@inversifyjs/common';
import { ClassElementMetadata } from '../models/ClassElementMetadata';
import { ClassElementMetadataKind } from '../models/ClassElementMetadataKind';
import { MaybeClassElementMetadata } from '../models/MaybeClassElementMetadata';
export declare const buildManagedMetadataFromMaybeClassElementMetadata: (kind: ClassElementMetadataKind.multipleInjection | ClassElementMetadataKind.singleInjection, serviceIdentifier: ServiceIdentifier | LazyServiceIdentifier) => (metadata: MaybeClassElementMetadata | undefined) => ClassElementMetadata;
//# sourceMappingURL=buildManagedMetadataFromMaybeClassElementMetadata.d.ts.map