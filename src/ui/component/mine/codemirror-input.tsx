import * as React from 'react';
import { cn } from '@/ui/react/lib/utils';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, placeholder as cmPlaceholder, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { tagPlugin } from '@/ui/component/mine/tagPlugin';

export interface CodeMirrorInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'children' | 'value' | 'onChange'> {
  /** The input value */
  value: string;
  /** Change handler */
  onChange: (value: string) => void;
  /** Additional CSS classes for the container */
  containerClassName?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Whether to enable search tag highlighting (@web@, @number@) */
  enableSearchTags?: boolean;
  /** Whether this is a single line input (affects height styling) */
  singleLine?: boolean;
}

const CodeMirrorInputComponent = React.forwardRef<{ focus: () => void }, CodeMirrorInputProps>(
  ({
    value,
    onChange,
    containerClassName,
    placeholder,
    enableSearchTags = false,
    singleLine = false,
    className,
    ...inputProps
  }, ref) => {
    const editorRef = React.useRef<any>(null);
    const handleChange = React.useCallback((val: string) => {
      onChange(val);
    }, [onChange]);

    const focus = React.useCallback(() => {
      if (editorRef.current?.view) {
        editorRef.current.view.focus();
      }
    }, []);

    const select = React.useCallback(() => {
      if (editorRef.current?.view) {
        const view = editorRef.current.view;
        view.dispatch({
          selection: { anchor: 0, head: view.state.doc.length }
        });
      }
    }, []);

    // Expose focus and selectAll methods
    React.useImperativeHandle(ref, () => ({
      focus,
      select
    }), [focus, select]);

    // Create extensions based on props
    const extensions = React.useMemo(() => {
      const exts = [
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ spellcheck: 'false' }),
        // High priority keymap to prevent Tab key from inserting tabs
        Prec.high(keymap.of([
          {
            key: 'Tab',
            run: () => {
              // Prevent default Tab behavior (inserting tab character)
              return true;
            }
          },
          {
            key: 'Shift-Tab',
            run: () => {
              // Prevent default Shift+Tab behavior as well
              return true;
            }
          }
        ])),
      ];

      // Add placeholder if provided
      if (placeholder) {
        exts.push(cmPlaceholder(placeholder));
      }

      // Add tag highlighting if enabled
      if (enableSearchTags) {
        exts.push(tagPlugin);
      }

      return exts;
    }, [placeholder, enableSearchTags]);

    return (
      <div className={cn('pktw-relative', containerClassName)}>
        <CodeMirror
          ref={editorRef}
          value={value}
          onChange={handleChange}
          extensions={extensions}
          className={cn(
            'cm-editor pktw-codemirror-custom',
            // Apply similar styling to match input appearance
            'pktw-bg-transparent pktw-border-0 pktw-outline-none',
            'focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0',
            // Single line specific styling
            singleLine && 'cm-editor-single-line',
            className
          )}
          theme="none" // Use custom CSS theming
          basicSetup={{
            lineNumbers: false,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
            indentOnInput: false,
            bracketMatching: false,
            closeBrackets: false,
            autocompletion: false,
            rectangularSelection: false,
            crosshairCursor: false,
            highlightSelectionMatches: false,
            searchKeymap: false,
            historyKeymap: false,
            foldKeymap: false,
            completionKeymap: false,
            lintKeymap: false,
          }}
          onCreateEditor={(view, state) => {
            // Auto focus when editor is created and ready
            requestAnimationFrame(() => {
              view.focus();
            });
          }}
          {...(() => {
            const { height, width, ...rest } = inputProps;
            return rest;
          })()}
        />
      </div>
    );
  }
);

CodeMirrorInputComponent.displayName = 'CodeMirrorInput';

export const CodeMirrorInput = CodeMirrorInputComponent;