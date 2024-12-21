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
exports.resolve = resolve;
const ERROR_MSGS = __importStar(require("../constants/error_msgs"));
const literal_types_1 = require("../constants/literal_types");
const planner_1 = require("../planning/planner");
const scope_1 = require("../scope/scope");
const async_1 = require("../utils/async");
const binding_utils_1 = require("../utils/binding_utils");
const exceptions_1 = require("../utils/exceptions");
const instantiation_1 = require("./instantiation");
// eslint-disable-next-line @typescript-eslint/naming-convention
const _resolveRequest = (requestScope) => (request) => {
    request.parentContext.setCurrentRequest(request);
    const bindings = request.bindings;
    const childRequests = request.childRequests;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
    const targetIsAnArray = request.target && request.target.isArray();
    const targetParentIsNotAnArray = !request.parentRequest ||
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
        !request.parentRequest.target ||
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/strict-boolean-expressions
        !request.target ||
        !request.parentRequest.target.matchesArray(request.target.serviceIdentifier);
    if (targetIsAnArray && targetParentIsNotAnArray) {
        // Create an array instead of creating an instance
        return childRequests.map((childRequest) => {
            const resolveRequest = _resolveRequest(requestScope);
            return resolveRequest(childRequest);
        });
    }
    else {
        if (request.target.isOptional() && bindings.length === 0) {
            return undefined;
        }
        const binding = bindings[0];
        return _resolveBinding(requestScope, request, binding);
    }
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _resolveFactoryFromBinding = (binding, context) => {
    const factoryDetails = (0, binding_utils_1.getFactoryDetails)(binding);
    return (0, exceptions_1.tryAndThrowErrorIfStackOverflow)(() => factoryDetails.factory.bind(binding)(context), () => new Error(ERROR_MSGS.CIRCULAR_DEPENDENCY_IN_FACTORY(factoryDetails.factoryType, context.currentRequest.serviceIdentifier.toString())));
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _getResolvedFromBinding = (requestScope, request, binding) => {
    let result;
    const childRequests = request.childRequests;
    (0, binding_utils_1.ensureFullyBound)(binding);
    switch (binding.type) {
        case literal_types_1.BindingTypeEnum.ConstantValue:
        case literal_types_1.BindingTypeEnum.Function:
            result = binding.cache;
            break;
        case literal_types_1.BindingTypeEnum.Constructor:
            result = binding.implementationType;
            break;
        case literal_types_1.BindingTypeEnum.Instance:
            result = (0, instantiation_1.resolveInstance)(binding, binding.implementationType, childRequests, _resolveRequest(requestScope));
            break;
        default:
            result = _resolveFactoryFromBinding(binding, request.parentContext);
    }
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _resolveInScope = (requestScope, binding, resolveFromBinding) => {
    let result = (0, scope_1.tryGetFromScope)(requestScope, binding);
    if (result !== null) {
        return result;
    }
    result = resolveFromBinding();
    (0, scope_1.saveToScope)(requestScope, binding, result);
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _resolveBinding = (requestScope, request, binding) => {
    return _resolveInScope(requestScope, binding, () => {
        let result = _getResolvedFromBinding(requestScope, request, binding);
        if ((0, async_1.isPromise)(result)) {
            result = result.then((resolved) => _onActivation(request, binding, resolved));
        }
        else {
            result = _onActivation(request, binding, result);
        }
        return result;
    });
};
function _onActivation(request, binding, resolved) {
    let result = _bindingActivation(request.parentContext, binding, resolved);
    const containersIterator = _getContainersIterator(request.parentContext.container);
    let container;
    let containersIteratorResult = containersIterator.next();
    do {
        container = containersIteratorResult.value;
        const context = request.parentContext;
        const serviceIdentifier = request.serviceIdentifier;
        const activationsIterator = _getContainerActivationsForService(container, serviceIdentifier);
        if ((0, async_1.isPromise)(result)) {
            result = _activateContainerAsync(activationsIterator, context, result);
        }
        else {
            result = _activateContainer(activationsIterator, context, result);
        }
        containersIteratorResult = containersIterator.next();
        // make sure if we are currently on the container that owns the binding, not to keep looping down to child containers
    } while (containersIteratorResult.done !== true &&
        !(0, planner_1.getBindingDictionary)(container).hasKey(request.serviceIdentifier));
    return result;
}
// eslint-disable-next-line @typescript-eslint/naming-convention
const _bindingActivation = (context, binding, previousResult) => {
    let result;
    // use activation handler if available
    if (typeof binding.onActivation === 'function') {
        result = binding.onActivation(context, previousResult);
    }
    else {
        result = previousResult;
    }
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _activateContainer = (activationsIterator, context, result) => {
    let activation = activationsIterator.next();
    while (activation.done !== true) {
        result = activation.value(context, result);
        if ((0, async_1.isPromise)(result)) {
            return _activateContainerAsync(activationsIterator, context, result);
        }
        activation = activationsIterator.next();
    }
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _activateContainerAsync = async (activationsIterator, context, resultPromise) => {
    let result = await resultPromise;
    let activation = activationsIterator.next();
    while (activation.done !== true) {
        result = await activation.value(context, result);
        activation = activationsIterator.next();
    }
    return result;
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _getContainerActivationsForService = (container, serviceIdentifier) => {
    // smell accessing _activations, but similar pattern is done in planner.getBindingDictionary()
    const activations = container._activations;
    return activations.hasKey(serviceIdentifier)
        ? activations.get(serviceIdentifier).values()
        : [].values();
};
// eslint-disable-next-line @typescript-eslint/naming-convention
const _getContainersIterator = (container) => {
    const containersStack = [container];
    let parent = container.parent;
    while (parent !== null) {
        containersStack.push(parent);
        parent = parent.parent;
    }
    const getNextContainer = () => {
        const nextContainer = containersStack.pop();
        if (nextContainer !== undefined) {
            return { done: false, value: nextContainer };
        }
        else {
            return { done: true, value: undefined };
        }
    };
    const containersIterator = {
        next: getNextContainer,
    };
    return containersIterator;
};
function resolve(context) {
    const resolveRequestFunction = _resolveRequest(context.plan.rootRequest.requestScope);
    return resolveRequestFunction(context.plan.rootRequest);
}
//# sourceMappingURL=resolver.js.map