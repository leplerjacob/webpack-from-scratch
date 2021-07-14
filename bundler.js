const fs = require("fs");
const babylon = require("babylon");
const path = require("path");
const traverse = require("babel-traverse").default;
const babel = require("babel-core");

let ID = 0;

function createAsset(filename) {
  const content = fs.readFileSync(filename, "utf-8");

  const ast = babylon.parse(content, {
    sourceType: "module",
  });

  const dependencies = [];

  traverse(ast, {
    ImportDeclaration: ({ node }) => {
      dependencies.push(node.source.value);
    },
  });

  const id = ID++;

  const { code } = babel.transformFromAst(ast, null, {
    presets: ["env"],
  });

  return {
    id,
    filename,
    dependencies,
    code,
  };
}

// Will iterate through all dependencies and map
function createGraph(entry) {
  // Parse entry file
  const mainAsset = createAsset(entry);

  // Define array with just the entry asset (file)
  const queue = [mainAsset];

  // iterates assets (files) within queue
  for (const asset of queue) {
    // gets directory path
    const dirname = path.dirname(asset.filename);
    // object to hold child-parent relationship file
    asset.mapping = {};
    // asset includes an array called dependencies. Iterate and join to dirname
    asset.dependencies.forEach((relativePath) => {
      // absolute path includes the dirname with the filename
      const absolutePath = path.join(dirname, relativePath);
      // create child asset using createAsset parser function
      const child = createAsset(absolutePath);
      // add child id to mapping object
      asset.mapping[relativePath] = child.id;
      // push child to queue to be mapped as well
      queue.push(child);
    });
  }
  // return of queue (array) with modules and their dependent modules
  return queue;
}

// define function that takes graph and returns bundle that can be run in the browser
function bundle(graph) {
  let modules = "";

  graph.forEach((mod) => {
    // grabbing the modules giving it a key `modules` and a value that is an array
    // the array has two values:
    //    - Code of module wrapped in a function to keep local scope separate
    //    - Stringify mapping between module and it's dependencies. Example would be { './relative/path': 1 }
    // self -invoking function that takes in an object with information about every module in the graph
    modules += `${mod.id}: [
        function (require, module, exports) {
          ${mod.code}
        },
        ${JSON.stringify(mod.mapping)},
    ],`;
  });

  // Create require function

  const result = `
    (function(modules){
      function require(id) {
        const [fn, mapping] = modules[id];

        function localRequire(relativePath) {
          return require(mapping[relativePath]);
        }
        const module = { exports: {} };

        fn(localRequire, module, module.exports);
        return module.exports;
      }
      require(0);
    })({
      ${modules}
    })
  `;

  return result;
}

const graph = createGraph("./example/entry.js");
const result = bundle(graph);
console.log(result);
