/*__@import:everything/utils/UUID__*/
/*__@import:QoL/storage__*/

State.init({
  debug: true,
});

const accountId = context.accountId;
const Children = props.Children;

let theprops = { ...props };
delete theprops.Children;

const KEYS = {
  selectedDoc: (pid) => `selectedDoc/${pid}`,
  doc: (path) => `doc/${path}`, // having path here will let us always know the structure of the doc
  docs: (pid) => `docs/${pid}`, // this should be the array of project docs
  init: (pid) => `init/${pid}`, // lets us know when the project has been initialized
};
const DOC_SEPARATOR = ".";
const DEFAULT_TEMPLATE = "/*__@appAccount__*//widget/templates.project.doc";

/**
 * 
 * I'm trying to learn what is the best way to structure our data, 
 * I think a lot of the complexity in code comes from keeping the documents structured in an object. 
 * Objects are great for storing data, but they are not great for keeping track of the structure of the data, 
 * they get messy and hard to work with. But strings paths are very predictable and easy to work with.
 * 
 * So we can just store the documents in a flat structure, similar to how the widgets are stored in SocialDB
 * and we can keep the paths in keys.
 * 
   {
       "project1": {
          "": {
              "title": "Project 1",
          },
          "doc1": {
              "title": "Document 1",
          },
          "doc1.doc2": {
              "title": "Document 1",
              "content": "Content here..."
          },
          "doc1.doc2.doc3": {
              "title": "Document 2",
              "content": "Content here..."
          }
      }
   }
 * 
 * Realistically, a project will never have more than 100 documents, so we don't need to worry about performance, 
 * and we can just use Social.keys to get all the keys and play around with them.
 * 
 */

const handleDocument = {
  /**
   * Create, or updates, or deletes document in Local Storage
   *
   * if value is an object, then create or update the document
   * if value is null, then delete the document
   *
   * @param {string} pid - project id
   * @param {string} path - path to the document
   * @param {object} value - the value to set at the path
   *
   * @returns {void} - nothing
   */
  set: (pid, path, value) => {
    store(KEYS.doc(path), value);

    // We need to keep track of the documents in the project
    let paths = retrieve(KEYS.docs(pid));
    paths = Array.isArray(paths) ? paths : [];

    // If the document is being deleted, then we need to remove it from the docs array
    if (value === null) {
      const newDocs = paths.filter((docPath) => docPath !== path);
      store(KEYS.docs(pid), newDocs);
    }

    // If the document is being created or updated, we need to make sure it's in the docs array
    if (value !== null && !paths.includes(path)) {
      store(KEYS.docs(pid), [...paths, path]);
    }

    // Open the new document
    store(KEYS.selectedDoc(pid), path);
  },

  /**
   * Wrapper for set that only updates the document keys
   *
   * @param {string} pid - project id
   * @param {string} path - path to the document
   * @param {object} value - the value to set at the path
   * @returns {void} - nothing
   *
   * @example
   * // This will update the document title, without afecting the content
   * handle["document"].update(projectId, path, { title: "New Title" });
   */
  update: (pid, path, value) => {
    const doc = retrieve(KEYS.doc(path));
    handleDocument.set(pid, path, {
      ...doc,
      ...value,
      updatedAt: new Date().toISOString(),
      _: {
        inBuffer: true,
      },
    });
  },

  /**
   * Wrapper for set that creates a new document under parent path
   * @param {string} pid - project id
   * @param {string} parentPath - optional path to the parent document
   * @param {object} value - optional value to set at the path
   */
  create: (pid, parentPath, value) => {
    if (!value) value = { title: "", content: "" };
    if (!parentPath) parentPath = "";
    const path = `${parentPath}${
      parentPath && DOC_SEPARATOR
    }${handleDocument.generateId()}`;
    handleDocument.set(pid, path, {
      ...value,
      createdAt: new Date().toISOString(),
      _: {
        inBuffer: true,
      },
    });
  },

  /**
   * Wrapper for set that deletes a document
   * @param {string} pid - project id
   * @param {string} path - path to the document
   * @returns {void} - nothing
   */
  delete: (pid, path) => handleDocument.set(pid, path, undefined),

  /**
   * Get a document from Local Storage
   * @param {string} path - path to the document
   * @returns {object} - the document
   */
  get: (path) => retrieve(KEYS.doc(path)),

  /**
   * Get project documents from Local Storage
   * @param {string} pid - project id
   * @returns {object} - the documents
   */
  getAll: (pid) => {
    let paths = retrieve(KEYS.docs(pid)) || [];
    paths = Array.isArray(paths) ? paths : [];

    let docs = {};
    paths.forEach((path) => {
      const doc = retrieve(KEYS.doc(path));
      if (doc) docs[path] = retrieve(KEYS.doc(path));
    });
    return docs;
  },

  /**
   * Get the selected document from Local Storage, if none is selected, then return the first document and open it
   * @param {string} pid - project id
   * @returns {path} - the path to the selected document
   */
  getSelected: (pid) => {
    const selected = retrieve(KEYS.selectedDoc(pid));
    if (selected) return selected;

    const docs = handleDocument.getAll(pid);
    const firstDoc = Object.keys(docs)[0];
    if (firstDoc) {
      handleDocument.open(pid, firstDoc);
      return firstDoc;
    }
  },

  // TODO
  fetch: (pid, path) => {
    const doc = Social.get(`${accountId}/document/${pid}/${path}/**`);
    return doc;
  },

  // TODO
  fetchAll: (pid) => {
    const docs = Social.get(`${accountId}/document/${pid}/**`);
    return docs;
  },

  // TODO
  fetchAllTitles: (pid, path) => {
    const docs = Social.get(`${accountId}/document/${pid}/*/title`);
    return docs;
  },

  /**
   * Set the selected document in Local Storage
   * @param {string} pid - project id
   * @param {string} path - path to the document
   */
  open: (pid, path) => store(KEYS.selectedDoc(pid), path),

  /**
   * Saves the document to SocialDB
   * @param {string} pid - project id
   * @param {string} path - path to the document
   */
  publish: (pid, path) => {
    const doc = handleDocument.get(path);
    delete doc._;

    Social.set(
      {
        document: {
          [pid]: {
            [path]: doc,
          },
        },
      },
      {
        onCommit: () => {
          handleDocument.set(pid, path, {
            ...doc,
            _: {
              inBuffer: false,
            },
          });
        },
      },
    );
  },

  /**
   * Generates a new UID
   * @returns {string} - the new UID
   */
  generateId: () => UUID.generate("xxxxxxx"),
};

const handleProject = {
  getAll: () => {
    return Social.get(`${accountId}/thing/project/**`);
  },
  get: (pid) => {
    return Social.get(`${accountId}/thing/project/${pid}/**`);
  },
  create: (project) => {
    const pid = UUID.generate();
    const tags = {};
    project.tags.forEach((tag) => {
      tags[tag] = "";
    });
    Social.set({
      thing: {
        project: {
          [pid]: {
            data: {
              title: project.title || "Untitled",
              logo: project.logo || "",
              tags: tags,
            },
            template: {
              src: project.template || DEFAULT_TEMPLATE,
            },
            type: {
              src: "/*__@appAccount__*//type/project",
            },
          },
        },
      },
    });
  },
  delete: (pid) => {
    Social.set({
      thing: {
        project: {
          [pid]: null,
        },
      },
    });
  },
  update: (pid, project) => {
    Social.set({
      thing: {
        project: {
          [pid]: project,
        },
      },
    });
  },

  /**
   * Fetches project documents from SocialDB and stores them in Local Storage,
   * it does not override the local documents if updatedAt is more recent,
   *
   * @note I'm not sure if it's okay to store all documents in Local Storage, it may be too much data for big projects,
   * I think it's better to use fetchTitle and fetch to get the document when user opens it, and then store it in Local Storage
   * if edited.
   *
   * @param {string} pid - project id
   * @returns {void} - nothing
   */
  init: (pid, force) => {
    if (!pid) return;
    if (!force) {
      const lastInit = retrieve(KEYS.init(pid));
      // if the project has already been initialized in the past 24 hours, then don't do it again
      if (lastInit && new Date(lastInit) > new Date(Date.now() - 86400000))
        return;
    }

    const docs = handleDocument.fetchAll(pid);
    if (docs === null) return;

    Object.keys(docs || {}).forEach((path) => {
      const doc = docs[path];
      const localDoc = handleDocument.get(path);
      if (!localDoc || new Date(doc.updatedAt) > new Date(localDoc.updatedAt)) {
        handleDocument.set(pid, path, doc);
      }
    });

    store(KEYS.init(pid), new Date().toISOString());
    console.log("Project initialized");
  },
};

/**
 * Initialize
 */
props.project && handleProject.init(props.project);

const handleUtils = {
  /**
   * Unflatten the documents object
   * @param {object} inputObject - the object to unflatten
   * @returns {object} - the unflattened object
   * @example
   * 
const input = {
  702250: { title: "", content: "" },
  "702250.3cbbb3": { title: "", content: "" },
  "702250.3cbbb3.acuont": { title: "", content: "" },
  "702250.89thao": { title: "", content: "" },
};

const output = {
  702250: {
    title: "",
    content: "",
    children: {
      "3cbbb3": {
        title: "",
        content: "",
        children: {
          acuont: { title: "", content: "" },
        },
      },
      "89thao": {
        title: "",
        content: "",
      },
    },
  },
};
    */
  unflattenDocuments: (inputObject) => {
    const result = {};

    Object.keys(inputObject).forEach((key) => {
      const keys = key.split(".");
      let currentLevel = result;

      keys.forEach((k, i) => {
        if (i === keys.length - 1) {
          // last key
          currentLevel[k] = inputObject[key];
        } else {
          currentLevel[k] = currentLevel[k] || {};
          currentLevel[k].children = currentLevel[k].children || {};
          currentLevel = currentLevel[k].children;
        }
      });
    });

    return result;
  },
};

const handle = {
  document: handleDocument,
  project: handleProject,
  utils: handleUtils,
  other: { DOC_SEPARATOR },
};

if (Storage.privateGet("debug")) {
  const selectedDoc = handle["document"].getSelected(props.project);
  const doc = handle["document"].get(selectedDoc);
  const projectData = handle["project"].get(props.project);

  return (
    <>
      <Children handle={handle} {...theprops} />
      <hr />
      <Widget
        src="/*__@replace:nui__*//widget/Input.Select"
        props={{
          label: "Debug",
          value: `${!!Storage.privateGet("debug")}`,
          onChange: (v) => {
            Storage.privateSet("debug", v === "true");
          },
          options: [
            {
              title: "Enabled",
              value: true,
            },
            {
              title: "Disabled",
              value: false,
            },
          ],
        }}
      />
      <hr />
      <p>Selected Project: {props.project}</p>
      Content:
      <p style={{ maxHeight: 300, overflow: "auto" }}>
        <Markdown text={"```json " + JSON.stringify(projectData, null, 2)} />
      </p>
      <hr />
      <p>Selected Doc: {selectedDoc}</p>
      Local Doc:
      <p style={{ maxHeight: 300, overflow: "auto" }}>
        <Markdown text={"```json " + JSON.stringify(doc, null, 2)} />
      </p>
      <hr />
      All Local Docs:
      <p style={{ maxHeight: 300, overflow: "auto" }}>
        <Markdown
          text={
            "```json " +
            JSON.stringify(handle["document"].getAll(props.project), null, 2)
          }
        />
      </p>
      <hr />
      Fetched
      <p style={{ maxHeight: 300, overflow: "auto" }}>
        <Markdown
          text={
            "```json " +
            JSON.stringify(
              handle["document"].fetch(props.project, selectedDoc),
              null,
              2,
            )
          }
        />
      </p>
      <hr />
      Fetch All Titles
      <p style={{ maxHeight: 300, overflow: "auto" }}>
        <Markdown
          text={
            "```json " +
            JSON.stringify(
              handle["document"].fetchAllTitles(props.project),
              null,
              2,
            )
          }
        />
      </p>
      <hr />
      Fetch All
      <p style={{ maxHeight: 300, overflow: "auto" }}>
        <Markdown
          text={
            "```json " +
            JSON.stringify(handle["document"].fetchAll(props.project), null, 2)
          }
        />
      </p>
    </>
  );
}

return (
  <>
    <Children handle={handle} {...theprops} />
    <hr />
    <Widget
      src="/*__@replace:nui__*//widget/Input.Select"
      props={{
        label: "Debug",
        value: `${!!Storage.privateGet("debug")}`,
        onChange: (v) => {
          Storage.privateSet("debug", v === "true");
        },
        options: [
          {
            title: "Enabled",
            value: true,
          },
          {
            title: "Disabled",
            value: false,
          },
        ],
      }}
    />
    <hr />
  </>
);
