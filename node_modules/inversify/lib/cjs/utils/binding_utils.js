"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFactoryDetails = exports.ensureFullyBound = exports.multiBindToService = void 0;
const ERROR_MSGS = __importStar(require("../constants/error_msgs"));
const literal_types_1 = require("../constants/literal_types");
const serialization_1 = require("../utils/serialization");
const factory_type_1 = require("./factory_type");
const multiBindToService = (container) => (service) => (...types) => {
    types.forEach((t) => {
        container.bind(t).toService(service);
    });
};
exports.multiBindToService = multiBindToService;
const ensureFullyBound = (binding) => {
    let boundValue = null;
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check
    switch (binding.type) {
        case literal_types_1.BindingTypeEnum.ConstantValue:
        case literal_types_1.BindingTypeEnum.Function:
            boundValue = binding.cache;
            break;
        case literal_types_1.BindingTypeEnum.Constructor:
        case literal_types_1.BindingTypeEnum.Instance:
            boundValue = binding.implementationType;
            break;
        case literal_types_1.BindingTypeEnum.DynamicValue:
            boundValue = binding.dynamicValue;
            break;
        case literal_types_1.BindingTypeEnum.Provider:
            boundValue = binding.provider;
            break;
        case literal_types_1.BindingTypeEnum.Factory:
            boundValue = binding.factory;
            break;
    }
    if (boundValue === null) {
        // The user probably created a binding but didn't finish it
        // e.g. container.bind<T>('Something'); missing BindingToSyntax
        const serviceIdentifierAsString = (0, serialization_1.getServiceIdentifierAsString)(binding.serviceIdentifier);
        throw new Error(`${ERROR_MSGS.INVALID_BINDING_TYPE} ${serviceIdentifierAsString}`);
    }
};
exports.ensureFullyBound = ensureFullyBound;
const getFactoryDetails = (binding) => {
    switch (binding.type) {
        case literal_types_1.BindingTypeEnum.Factory:
            return { factory: binding.factory, factoryType: factory_type_1.FactoryType.Factory };
        case literal_types_1.BindingTypeEnum.Provider:
            return { factory: binding.provider, factoryType: factory_type_1.FactoryType.Provider };
        case literal_types_1.BindingTypeEnum.DynamicValue:
            return {
                factory: binding.dynamicValue,
                factoryType: factory_type_1.FactoryType.DynamicValue,
            };
        default:
            throw new Error(`Unexpected factory type ${binding.type}`);
    }
};
exports.getFactoryDetails = getFactoryDetails;
//# sourceMappingURL=binding_utils.js.map