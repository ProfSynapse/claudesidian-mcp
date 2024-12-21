import { LazyServiceIdentifier } from '@inversifyjs/common';
import { interfaces } from '../interfaces/interfaces';
import { DecoratorTarget } from './decorator_utils';
export declare function injectBase(metadataKey: string): <T = unknown>(serviceIdentifier: interfaces.ServiceIdentifier<T> | LazyServiceIdentifier<T>) => (target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
//# sourceMappingURL=inject_base.d.ts.map