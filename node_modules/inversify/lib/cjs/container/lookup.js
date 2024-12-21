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
exports.Lookup = void 0;
const ERROR_MSGS = __importStar(require("../constants/error_msgs"));
const clonable_1 = require("../utils/clonable");
class Lookup {
    // dictionary used store multiple values for each key <key>
    _map;
    constructor() {
        this._map = new Map();
    }
    getMap() {
        return this._map;
    }
    // adds a new entry to _map
    add(serviceIdentifier, value) {
        this._checkNonNulish(serviceIdentifier);
        if (value === null || value === undefined) {
            throw new Error(ERROR_MSGS.NULL_ARGUMENT);
        }
        const entry = this._map.get(serviceIdentifier);
        if (entry !== undefined) {
            entry.push(value);
        }
        else {
            this._map.set(serviceIdentifier, [value]);
        }
    }
    // gets the value of a entry by its key (serviceIdentifier)
    get(serviceIdentifier) {
        this._checkNonNulish(serviceIdentifier);
        const entry = this._map.get(serviceIdentifier);
        if (entry !== undefined) {
            return entry;
        }
        else {
            throw new Error(ERROR_MSGS.KEY_NOT_FOUND);
        }
    }
    // removes a entry from _map by its key (serviceIdentifier)
    remove(serviceIdentifier) {
        this._checkNonNulish(serviceIdentifier);
        if (!this._map.delete(serviceIdentifier)) {
            throw new Error(ERROR_MSGS.KEY_NOT_FOUND);
        }
    }
    removeIntersection(lookup) {
        this.traverse((serviceIdentifier, value) => {
            const lookupActivations = lookup.hasKey(serviceIdentifier)
                ? lookup.get(serviceIdentifier)
                : undefined;
            if (lookupActivations !== undefined) {
                const filteredValues = value.filter((lookupValue) => !lookupActivations.some((moduleActivation) => lookupValue === moduleActivation));
                this._setValue(serviceIdentifier, filteredValues);
            }
        });
    }
    removeByCondition(condition) {
        const removals = [];
        this._map.forEach((entries, key) => {
            const updatedEntries = [];
            for (const entry of entries) {
                const remove = condition(entry);
                if (remove) {
                    removals.push(entry);
                }
                else {
                    updatedEntries.push(entry);
                }
            }
            this._setValue(key, updatedEntries);
        });
        return removals;
    }
    // returns true if _map contains a key (serviceIdentifier)
    hasKey(serviceIdentifier) {
        this._checkNonNulish(serviceIdentifier);
        return this._map.has(serviceIdentifier);
    }
    // returns a new Lookup instance; note: this is not a deep clone, only Lookup related data structure (dictionary) is
    // cloned, content remains the same
    clone() {
        const copy = new Lookup();
        this._map.forEach((value, key) => {
            value.forEach((b) => {
                copy.add(key, (0, clonable_1.isClonable)(b) ? b.clone() : b);
            });
        });
        return copy;
    }
    traverse(func) {
        this._map.forEach((value, key) => {
            func(key, value);
        });
    }
    _checkNonNulish(value) {
        if (value == null) {
            throw new Error(ERROR_MSGS.NULL_ARGUMENT);
        }
    }
    _setValue(serviceIdentifier, value) {
        if (value.length > 0) {
            this._map.set(serviceIdentifier, value);
        }
        else {
            this._map.delete(serviceIdentifier);
        }
    }
}
exports.Lookup = Lookup;
//# sourceMappingURL=lookup.js.map