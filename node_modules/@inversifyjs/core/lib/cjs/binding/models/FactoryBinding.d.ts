import { bindingScopeValues } from './BindingScope';
import { bindingTypeValues } from './BindingType';
import { Factory } from './Factory';
import { ScopedBinding } from './ScopedBinding';
export interface FactoryBinding<TActivated> extends ScopedBinding<typeof bindingTypeValues.Factory, typeof bindingScopeValues.Singleton, TActivated> {
    readonly factory: () => Factory<TActivated>;
}
//# sourceMappingURL=FactoryBinding.d.ts.map