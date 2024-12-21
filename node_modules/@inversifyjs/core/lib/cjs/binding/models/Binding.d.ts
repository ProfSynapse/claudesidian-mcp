import { ConstantValueBinding } from './ConstantValueBinding';
import { DynamicValueBinding } from './DynamicValueBinding';
import { FactoryBinding } from './FactoryBinding';
import { InstanceBinding } from './InstanceBinding';
import { ProviderBinding } from './ProviderBinding';
import { ServiceRedirectionBinding } from './ServiceRedirectionBinding';
export type Binding<TActivated> = ConstantValueBinding<TActivated> | DynamicValueBinding<TActivated> | FactoryBinding<TActivated> | InstanceBinding<TActivated> | ProviderBinding<TActivated> | ServiceRedirectionBinding<TActivated>;
//# sourceMappingURL=Binding.d.ts.map