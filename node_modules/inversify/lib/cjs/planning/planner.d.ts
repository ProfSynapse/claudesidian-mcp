import { interfaces } from '../interfaces/interfaces';
export declare function getBindingDictionary(cntnr: interfaces.Container): interfaces.Lookup<interfaces.Binding<unknown>>;
export interface PlanMetadata {
    isMultiInject: boolean;
    isOptional?: boolean;
    customTag?: {
        key: string | number | symbol;
        value?: unknown;
    };
}
export declare function plan(metadataReader: interfaces.MetadataReader, container: interfaces.Container, targetType: interfaces.TargetType, serviceIdentifier: interfaces.ServiceIdentifier, metadata: PlanMetadata, avoidConstraints?: boolean): interfaces.Context;
export declare function createMockRequest(container: interfaces.Container, serviceIdentifier: interfaces.ServiceIdentifier, metadata: PlanMetadata): interfaces.Request;
//# sourceMappingURL=planner.d.ts.map