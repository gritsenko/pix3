// Decorator to inject value from hash-based query string
export function fromQuery(paramName: string) {
    return function (target: any, propertyKey: string) {
        const getter = function () {
            const hash = window.location.hash;
            if (hash) {
                const queryIndex = hash.indexOf('?');
                if (queryIndex !== -1) {
                    const query = hash.substring(queryIndex + 1);
                    const params = new URLSearchParams(query);
                    return params.get(paramName);
                }
            }
            return null;
        };
        Object.defineProperty(target, propertyKey, {
            get: getter,
            enumerable: true,
            configurable: true
        });
    };
}
