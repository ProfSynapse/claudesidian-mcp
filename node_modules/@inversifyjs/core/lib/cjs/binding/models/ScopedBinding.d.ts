import { Either } from '@inversifyjs/common';
import { BaseBinding } from './BaseBinding';
import { BindingActivation } from './BindingActivation';
import { BindingDeactivation } from './BindingDeactivation';
import { BindingScope } from './BindingScope';
import { BindingType } from './BindingType';
export interface ScopedBinding<TType extends BindingType, TScope extends BindingScope, TActivated> extends BaseBinding<TType, TActivated> {
    readonly cache: Either<undefined, TActivated | Promise<TActivated>>;
    readonly onActivation: Either<undefined, BindingActivation<TActivated>>;
    readonly onDeactivation: Either<undefined, BindingDeactivation<TActivated>>;
    readonly scope: TScope;
}
//# sourceMappingURL=ScopedBinding.d.ts.map