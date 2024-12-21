import { LazyServiceIdentifier } from '@inversifyjs/common';
import { interfaces } from '../interfaces/interfaces';
import { DecoratorTarget } from './decorator_utils';
declare const inject: <T = unknown>(serviceIdentifier: interfaces.ServiceIdentifier<T> | LazyServiceIdentifier<T>) => (target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
export { inject };
//# sourceMappingURL=inject.d.ts.map