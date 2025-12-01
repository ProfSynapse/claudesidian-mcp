import type { App, Plugin } from 'obsidian';
import { getAllPluginIds } from '../constants/branding';

export function getNexusPlugin<T extends Plugin = Plugin>(app: App): T | null {
    for (const id of getAllPluginIds()) {
        const plugin = app.plugins.getPlugin(id);
        if (plugin) {
            return plugin as T;
        }
    }

    return null;
}

export function getNexusPluginFromRegistry<T = Plugin>(
    registry: Record<string, T>
): T | null {
    if (!registry) {
        return null;
    }

    for (const id of getAllPluginIds()) {
        const plugin = registry[id];
        if (plugin) {
            return plugin;
        }
    }

    return null;
}
