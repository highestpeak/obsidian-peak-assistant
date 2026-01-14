import Handlebars from 'handlebars';
import { humanReadableTime } from '@/core/utils/date-utils';

export function registerTemplateEngineHelpers() {
    // Register global Handlebars helpers
    Handlebars.registerHelper('humanReadableTime', function (timestamp: number) {
        return timestamp ? humanReadableTime(timestamp) : 'N/A';
    });
    Handlebars.registerHelper('eq', function (a, b) {
        return a === b;
    });
}
