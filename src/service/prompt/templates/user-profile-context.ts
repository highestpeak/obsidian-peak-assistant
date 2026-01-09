/**
 * User profile context template for building user profile messages.
 */
export const template = `# User Profile

{{#each contextEntries}}
{{category}}: {{texts}}
{{/each}}`;

export const expectsJson = false;
