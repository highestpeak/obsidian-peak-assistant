import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, keymap } from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import { parseTagsFromText } from "./tagParser";

const contextTagDeco = Decoration.mark({
	class: "cm-context-tag"
});

const promptTagDeco = Decoration.mark({
	class: "cm-prompt-tag"
});

const bracketTagDeco = Decoration.mark({
	class: "cm-context-tag"
});

const tagPlugin = ViewPlugin.fromClass(class {
	decorations: DecorationSet;

	constructor(view: EditorView) {
		this.decorations = this.buildDeco(view);
	}

	update(update: ViewUpdate) {
		if (update.docChanged || update.viewportChanged) {
			this.decorations = this.buildDeco(update.view);
		}
	}

	buildDeco(view: EditorView) {
		const builder = new RangeSetBuilder<Decoration>();

		for (let { from, to } of view.visibleRanges) {
			const text = view.state.doc.sliceString(from, to);

			// Use shared parsing logic (already filtered and sorted)
			const parsedTags = parseTagsFromText(text);

			// Convert to decoration format and adjust positions
			for (const tag of parsedTags) {
				builder.add(
					from + tag.start,
					from + tag.end,
					tag.type === 'context' ? contextTagDeco : promptTagDeco
				);
			}
		}

		return builder.finish();
	}
}, {
	decorations: v => v.decorations
});


export { tagPlugin };