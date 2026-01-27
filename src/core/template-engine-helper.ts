import Handlebars from 'handlebars';
import { humanReadableTime } from '@/core/utils/date-utils';
import yaml from 'js-yaml';

export function registerTemplateEngineHelpers() {
    // Register global Handlebars helpers
    Handlebars.registerHelper('humanReadableTime', function (timestamp: number) {
        return timestamp ? humanReadableTime(timestamp) : 'N/A';
    });
    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });
    Handlebars.registerHelper('gt', function (a, b) {
        return a > b;
    });
    Handlebars.registerHelper('lt', function (a, b) {
        return a < b;
    });
    Handlebars.registerHelper('gte', function (a, b) {
        return a >= b;
    });
    Handlebars.registerHelper('lte', function (a, b) {
        return a <= b;
    });
    Handlebars.registerHelper('formatNodeLabel', function (label, type) {
        switch (type) {
            case 'tag':
                return `#${label}`;
            case 'category':
                return `📁${label}`;
            case 'document':
            default:
                return `[[${label}]]`;
        }
    });
    Handlebars.registerHelper('hasNodeType', function (nodes, nodeType) {
        return nodes.some((node: any) => node.nodeType === nodeType);
    });
    Handlebars.registerHelper('inc', function (value) {
        return parseInt(value) + 1;
    });
    Handlebars.registerHelper('toYaml', (jsonStr, baseIndent) => {
        try {
            const obj = JSON.parse(jsonStr);
            // dump the object to a nicely indented YAML string
            const rawYaml = yaml.dump(obj, {
                indent: 2,
                skipInvalid: true,
                // disable automatic wrapping
                lineWidth: -1,
                noRefs: true,
                // force double quotes instead of block mode
                quotingType: '"'
            }).trim();

            // prepare the indent spaces (if the template doesn't pass indentSize, default to 0)
            const spaces = ' '.repeat(typeof baseIndent === 'number' ? baseIndent : 0);

            // add the indent spaces to each line
            return rawYaml.split('\n').map(line => `${spaces}${line}`).join('\n')
        } catch {
            return jsonStr;
        }
    });
}
