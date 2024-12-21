import { ClassElementMetadata } from './ClassElementMetadata';
import { ClassMetadataLifecycle } from './ClassMetadataLifecycle';
export interface ClassMetadata {
    constructorArguments: ClassElementMetadata[];
    lifecycle: ClassMetadataLifecycle;
    properties: Map<string | symbol, ClassElementMetadata>;
}
//# sourceMappingURL=ClassMetadata.d.ts.map