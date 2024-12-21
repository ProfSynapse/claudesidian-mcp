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
exports.getFunctionName = getFunctionName;
exports.getServiceIdentifierAsString = getServiceIdentifierAsString;
exports.listRegisteredBindingsForServiceIdentifier = listRegisteredBindingsForServiceIdentifier;
exports.listMetadataForTarget = listMetadataForTarget;
exports.circularDependencyToException = circularDependencyToException;
exports.getSymbolDescription = getSymbolDescription;
const ERROR_MSGS = __importStar(require("../constants/error_msgs"));
function getServiceIdentifierAsString(serviceIdentifier) {
    if (typeof serviceIdentifier === 'function') {
        return serviceIdentifier.name;
    }
    else if (typeof serviceIdentifier === 'symbol') {
        return serviceIdentifier.toString();
    }
    else {
        return serviceIdentifier;
    }
}
function listRegisteredBindingsForServiceIdentifier(container, serviceIdentifier, getBindings) {
    let registeredBindingsList = '';
    const registeredBindings = getBindings(container, serviceIdentifier);
    if (registeredBindings.length !== 0) {
        registeredBindingsList = '\nRegistered bindings:';
        registeredBindings.forEach((binding) => {
            // Use 'Object as name of constant value injections'
            let name = 'Object';
            // Use function name if available
            if (binding.implementationType !== null) {
                name = getFunctionName(binding.implementationType);
            }
            registeredBindingsList = `${registeredBindingsList}\n ${name}`;
            if (binding.constraint.metaData) {
                // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions
                registeredBindingsList = `${registeredBindingsList} - ${binding.constraint.metaData}`;
            }
        });
    }
    return registeredBindingsList;
}
function alreadyDependencyChain(request, serviceIdentifier) {
    if (request.parentRequest === null) {
        return false;
    }
    else if (request.parentRequest.serviceIdentifier === serviceIdentifier) {
        return true;
    }
    else {
        return alreadyDependencyChain(request.parentRequest, serviceIdentifier);
    }
}
function dependencyChainToString(request) {
    function _createStringArr(req, result = []) {
        const serviceIdentifier = getServiceIdentifierAsString(req.serviceIdentifier);
        result.push(serviceIdentifier);
        if (req.parentRequest !== null) {
            return _createStringArr(req.parentRequest, result);
        }
        return result;
    }
    const stringArr = _createStringArr(request);
    return stringArr.reverse().join(' --> ');
}
function circularDependencyToException(request) {
    request.childRequests.forEach((childRequest) => {
        if (alreadyDependencyChain(request, childRequest.serviceIdentifier)) {
            const services = dependencyChainToString(childRequest);
            throw new Error(`${ERROR_MSGS.CIRCULAR_DEPENDENCY} ${services}`);
        }
        else {
            circularDependencyToException(childRequest);
        }
    });
}
function listMetadataForTarget(serviceIdentifierString, target) {
    if (target.isTagged() || target.isNamed()) {
        let m = '';
        const namedTag = target.getNamedTag();
        const otherTags = target.getCustomTags();
        if (namedTag !== null) {
            m += stringifyMetadata(namedTag) + '\n';
        }
        if (otherTags !== null) {
            otherTags.forEach((tag) => {
                m += stringifyMetadata(tag) + '\n';
            });
        }
        return ` ${serviceIdentifierString}\n ${serviceIdentifierString} - ${m}`;
    }
    else {
        return ` ${serviceIdentifierString}`;
    }
}
function getFunctionName(func) {
    if (func.name != null && func.name !== '') {
        return func.name;
    }
    else {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        const name = func.toString();
        const match = name.match(/^function\s*([^\s(]+)/);
        return match === null
            ? `Anonymous function: ${name}`
            : match[1];
    }
}
function getSymbolDescription(symbol) {
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    return symbol.toString().slice(7, -1);
}
function stringifyMetadata(metadata) {
    return `{"key":"${metadata.key.toString()}","value":"${metadata.value.toString()}"}`;
}
//# sourceMappingURL=serialization.js.map