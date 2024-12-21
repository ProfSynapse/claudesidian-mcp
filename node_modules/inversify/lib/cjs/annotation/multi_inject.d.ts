import { LazyServiceIdentifier } from '@inversifyjs/common';
import { interfaces } from '../interfaces/interfaces';
import { DecoratorTarget } from './decorator_utils';
declare const multiInject: <T = unknown>(serviceIdentifier: interfaces.ServiceIdentifier<T> | LazyServiceIdentifier<T>) => (target: DecoratorTarget, targetKey?: string | symbol, indexOrPropertyDescriptor?: number | TypedPropertyDescriptor<T>) => void;
export { multiInject };
//# sourceMappingURL=multi_inject.d.ts.map