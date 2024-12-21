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
exports.resolveInstance = resolveInstance;
const error_msgs_1 = require("../constants/error_msgs");
const literal_types_1 = require("../constants/literal_types");
const METADATA_KEY = __importStar(require("../constants/metadata_keys"));
const async_1 = require("../utils/async");
function _resolveRequests(childRequests, resolveRequest) {
    return childRequests.reduce((resolvedRequests, childRequest) => {
        const injection = resolveRequest(childRequest);
        const targetType = childRequest.target.type;
        if (targetType === literal_types_1.TargetTypeEnum.ConstructorArgument) {
            resolvedRequests.constructorInjections.push(injection);
        }
        else {
            resolvedRequests.propertyRequests.push(childRequest);
            resolvedRequests.propertyInjections.push(injection);
        }
        if (!resolvedRequests.isAsync) {
            resolvedRequests.isAsync = (0, async_1.isPromiseOrContainsPromise)(injection);
        }
        return resolvedRequests;
    }, {
        constructorInjections: [],
        isAsync: false,
        propertyInjections: [],
        propertyRequests: [],
    });
}
function _createInstance(constr, childRequests, resolveRequest) {
    let result;
    if (childRequests.length > 0) {
        const resolved = _resolveRequests(childRequests, resolveRequest);
        const createInstanceWithInjectionsArg = {
            ...resolved,
            constr,
        };
        if (resolved.isAsync) {
            result = createInstanceWithInjectionsAsync(createInstanceWithInjectionsArg);
        }
        else {
            result = createInstanceWithInjections(createInstanceWithInjectionsArg);
        }
    }
    else {
        result = new constr();
    }
    return result;
}
function createInstanceWithInjections(args) {
    const instance = new args.constr(...args.constructorInjections);
    args.propertyRequests.forEach((r, index) => {
        const property = r.target.identifier;
        const injection = args.propertyInjections[index];
        if (!r.target.isOptional() || injection !== undefined) {
            instance[property] = injection;
        }
    });
    return instance;
}
async function createInstanceWithInjectionsAsync(args) {
    const constructorInjections = await possiblyWaitInjections(args.constructorInjections);
    const propertyInjections = await possiblyWaitInjections(args.propertyInjections);
    return createInstanceWithInjections({
        ...args,
        constructorInjections,
        propertyInjections,
    });
}
async function possiblyWaitInjections(possiblePromiseinjections) {
    const injections = [];
    for (const injection of possiblePromiseinjections) {
        if (Array.isArray(injection)) {
            injections.push(Promise.all(injection));
        }
        else {
            injections.push(injection);
        }
    }
    return Promise.all(injections);
}
function _getInstanceAfterPostConstruct(constr, result) {
    const postConstructResult = _postConstruct(constr, result);
    if ((0, async_1.isPromise)(postConstructResult)) {
        return postConstructResult.then(() => result);
    }
    else {
        return result;
    }
}
function _postConstruct(constr, instance) {
    if (Reflect.hasMetadata(METADATA_KEY.POST_CONSTRUCT, constr)) {
        const data = Reflect.getMetadata(METADATA_KEY.POST_CONSTRUCT, constr);
        try {
            return instance[data.value]?.();
        }
        catch (e) {
            if (e instanceof Error) {
                throw new Error((0, error_msgs_1.POST_CONSTRUCT_ERROR)(constr.name, e.message));
            }
        }
    }
}
function _validateInstanceResolution(binding, constr) {
    if (binding.scope !== literal_types_1.BindingScopeEnum.Singleton) {
        _throwIfHandlingDeactivation(binding, constr);
    }
}
function _throwIfHandlingDeactivation(binding, constr) {
    const scopeErrorMessage = `Class cannot be instantiated in ${binding.scope === literal_types_1.BindingScopeEnum.Request ? 'request' : 'transient'} scope.`;
    if (typeof binding.onDeactivation === 'function') {
        throw new Error((0, error_msgs_1.ON_DEACTIVATION_ERROR)(constr.name, scopeErrorMessage));
    }
    if (Reflect.hasMetadata(METADATA_KEY.PRE_DESTROY, constr)) {
        throw new Error((0, error_msgs_1.PRE_DESTROY_ERROR)(constr.name, scopeErrorMessage));
    }
}
function resolveInstance(binding, constr, childRequests, resolveRequest) {
    _validateInstanceResolution(binding, constr);
    const result = _createInstance(constr, childRequests, resolveRequest);
    if ((0, async_1.isPromise)(result)) {
        return result.then((resolvedResult) => _getInstanceAfterPostConstruct(constr, resolvedResult));
    }
    else {
        return _getInstanceAfterPostConstruct(constr, result);
    }
}
//# sourceMappingURL=instantiation.js.map