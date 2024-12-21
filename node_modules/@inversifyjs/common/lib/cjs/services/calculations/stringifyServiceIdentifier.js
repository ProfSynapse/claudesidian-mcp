"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stringifyServiceIdentifier = stringifyServiceIdentifier;
function stringifyServiceIdentifier(serviceIdentifier) {
    switch (typeof serviceIdentifier) {
        case 'string':
        case 'symbol':
            return serviceIdentifier.toString();
        case 'function':
            return serviceIdentifier.name;
        default:
            throw new Error(`Unexpected ${typeof serviceIdentifier} service id type`);
    }
}
//# sourceMappingURL=stringifyServiceIdentifier.js.map