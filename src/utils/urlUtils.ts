export function normalizeUrl(url: string): string {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
    }
    
    try {
        const urlObj = new URL(url);
        return urlObj.toString();
    } catch (e) {
        throw new Error(`Invalid URL: ${url}`);
    }
}

export function isValidUrl(url: string): boolean {
    try {
        new URL(url.startsWith('http') ? url : 'https://' + url);
        return true;
    } catch (e) {
        return false;
    }
}
