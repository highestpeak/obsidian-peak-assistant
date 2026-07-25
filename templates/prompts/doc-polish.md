{{#if (eq scope "selection")}}Polish this selected text from "{{title}}":{{else}}Polish this document "{{title}}":{{/if}}

{{{content}}}
{{#if instruction}}

Apply this targeted instruction to the revision:
{{instruction}}
{{/if}}
