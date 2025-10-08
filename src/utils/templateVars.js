/**
 * Replace {VAR} placeholders in a template string using the provided map.
 * Unknown placeholders are left intact to avoid surprising output.
 * @param {string} template
 * @param {Record<string, unknown>} variables
 * @returns {string}
 */
export default function applyTemplateVariables(template, variables) {
    if (typeof template !== 'string' || !variables || typeof variables !== 'object') {
        return template;
    }

    return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
        if (!Object.prototype.hasOwnProperty.call(variables, key)) {
            return match;
        }

        const value = variables[key];
        return typeof value === 'string' ? value : String(value ?? '');
    });
}
