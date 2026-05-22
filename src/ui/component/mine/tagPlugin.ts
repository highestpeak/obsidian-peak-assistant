import { Decoration, DecorationSet, EditorView } from "@codemirror/view";
import { RangeSetBuilder, StateField } from "@codemirror/state";
import { parseTagsFromText } from "../mine/tagParser";

const contextTagDeco = Decoration.mark({
	class: "cm-context-tag"
});

const promptTagDeco = Decoration.mark({
	class: "cm-prompt-tag"
});

const bracketTagDeco = Decoration.mark({
	class: "cm-context-tag"
});

const searchTagDeco = Decoration.mark({
	class: "cm-search-tag"
});

function buildTagDecorations(docText: string): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	for (const tag of parseTagsFromText(docText)) {
		let deco;
		switch (tag.type) {
			case 'context':
				deco = contextTagDeco;
				break;
			case 'prompt':
				deco = promptTagDeco;
				break;
			case 'search':
				deco = searchTagDeco;
				break;
			default:
				deco = contextTagDeco;
		}
		builder.add(tag.start, tag.end, deco);
	}
	return builder.finish();
}

const tagPlugin = StateField.define<DecorationSet>({
	create(state) {
		return buildTagDecorations(state.doc.toString());
	},
	update(decorations, transaction) {
		if (!transaction.docChanged) return decorations.map(transaction.changes);
		return buildTagDecorations(transaction.state.doc.toString());
	},
	provide: field => EditorView.decorations.from(field),
});


export { tagPlugin };
