let editorResourcesPromise = null;
export function primeEditorResources() {
  if (!editorResourcesPromise) {
    editorResourcesPromise = Promise.all([import("@uiw/react-codemirror"), import("@codemirror/lang-markdown"), import("@codemirror/view"), import("@codemirror/commands")]).catch(err => {
      editorResourcesPromise = null;
      throw err;
    });
  }
  return editorResourcesPromise;
}
