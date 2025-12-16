---
alwaysApply: true
---

- UI Library and Tag Usage Guidelines:
  - Preferred UI Library: Strictly prohibit the use of the default HTML <button> tag. All button elements must utilize the <Button> component from the shadcn/ui library.
  - Avoid Semantic Tags: Avoid using standard HTML tags such as <h1-h6> and <p> as much as possible.
  - To control the styling for titles and paragraphs, ple   ase use the <span> tag and apply visual styling using Tailwind CSS classes (e.g., text-xl font-bold) or inline styles (e.g., style={{ fontWeight: 'bold', fontSize: '1.25rem' }}).

- Code Structure and Componentization Requirements:
  - Similarity Principle: If there are parts of the code with similar structure, function, or style (e.g., cards, list items, form field groups).
  - Extraction Threshold: Any section of code within a component that spans more than 8 lines should be considered for extraction into a separate, independent sub-component.
  - File Placement Decision (Atomicity and Reusability):
    - If the sub-component only serves its parent component and will not be reused elsewhere, keep it as a sub-component within the original file (e.g., define and return it inside the parent component's function).
    - If the sub-component has the potential to be reused in other components or pages, it must be extracted into a new, separate file.
