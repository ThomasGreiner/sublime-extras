#!/usr/bin/env node

"use strict";

if (process.argv.length < 3) {
  console.log(`Usage: ${process.argv[1]} [--debug] <input-file>`);
  process.exit();
}

const isDebugMode = (process.argv.indexOf("--debug") > -1);
const inputFile = process.argv[process.argv.length - 1];
require("fs").readFile(inputFile, "utf-8", (err, content) => {
  if (err) {
    console.error(`Cannot open file: ${inputFile}`);
    return;
  }
  dumpPLIST(loadYAML(content));
});

function debug(indent, key, value) {
  if (!isDebugMode)
    return;
  
  if (typeof indent == "undefined") {
    console.log("---");
  } else if (typeof key == "undefined") {
    console.log(`${indent}: push obj()`);
  } else if (typeof value == "undefined") {
    console.log(`${indent}: push var(${key})`);
  } else {
    console.log(`${indent}: set ${key}=${JSON.stringify(value)}`);
  }
}

class Node {
  toJSON() {
    return this._value;
  }
  
  toPLIST() {
    return `<string>${this._value}</string>`;
  }
}

class StringNode extends Node {
  constructor(value) {
    super();
    super._value = value || "";
  }
}

class ObjectNode extends Node {
  push(value) {
    if (!this._value) {
      super._value = [];
    }
    
    if (this._value instanceof Array) {
     this._value.push(value);
    } else {
      throw new Error("Cannot push to ObjectNode initialized as Object");
    }
  }
  
  set(key, value) {
    if (!this._value) {
      super._value = Object.create(null);
    }
    
    if (!(this.value instanceof Array)) {
      this._value[key] = value;
    } else {
      throw new Error("Cannot set key on ObjectNode initialized as Array");
    }
  }
  
  toPLIST() {
    let plist = [];
    if (this._value instanceof Array) {
      plist.push("<array>");
      for (let value of this._value) {
        plist.push(value.toPLIST());
      }
      plist.push("</array>");
    } else {
      plist.push("<dict>");
      for (let key in this._value) {
        plist.push(`<key>${key}</key>`);
        plist.push(this._value[key].toPLIST());
      }
      plist.push("</dict>");
    }
    return plist.join("\n");
  }
}

const variables = Object.create(null);
class VariableNode extends Node {
  constructor(id) {
    super();
    if (!(id in variables)) {
      variables[id] = Object.create(null);
    }
    super._value = variables[id];
  }
}

const reMap = /^["']?([a-zA-Z0-9_]+)["']?\s*:\s*(.*)$/;
const reSet = /^\s*\-[^\-]/;
const reMapValue = /^\{(.*)\}$/;
const reSetValue = /^\[(.*)\]$/;
const reVarValue = /^[&\*](.*)$/;

function getValueNode(str) {
  let node = null;
  if (reMapValue.test(str)) {
    node = new ObjectNode();
    // TODO: Improve object parsing
    let values = reMapValue.exec(str)[1].split(/\s*,\s*/);
    for (let value of values) {
      let pair = value.split(/\s*:\s*/, 2);
      node.set(pair[0], getValueNode(pair[1]));
    }
  } else if (reSetValue.test(str)) {
    node = new ObjectNode();
    // TODO: Improve array parsing
    let values = reSetValue.exec(str)[1].split(/\s*,\s*/);
    for (let value of values) {
      node.push(getValueNode(value));
    }
  } else if (reVarValue.test(str)) {
    let name = reVarValue.exec(str)[1];
    node = new VariableNode(name);
  } else if (str) {
    str = str.replace(/^["']|["']$/g, "");
    node = new StringNode(str);
  }
  return node;
}

function loadYAML(str) {
  let root = new ObjectNode();
  let stack = {"-1": root};
  
  // TODO: Allow array items to be specified on same indentation level
  function getParentNode(indent) {
    for (let i = indent - 1; i > -2; i--) {
      if (stack[i]) {
        return stack[i];
      }
    }
    
    throw new Error(`No node set below indent level ${indent}`);
  }
  
  let lines = str.split("\n");
  let previousIndent = 0;
  for (let line of lines) {
    let indent = /^\s*/.exec(line)[0].length;
    if (indent < previousIndent) {
      for (let i = indent + 1; i <= previousIndent; i++) {
        delete stack[i];
      }
    }
    
    line = line.trim();
    if (reSet.test(line)) {
      let trimmedLine = line.replace(/^\-\s+/, "");
      if (reVarValue.test(trimmedLine)) {
        let key = reVarValue.exec(trimmedLine)[1];
        debug(indent, key);
        let node = new VariableNode(key);
        getParentNode(indent).push(node);
        continue;
      } else {
        debug(indent);
        let node = new ObjectNode();
        getParentNode(indent).push(node);
        stack[indent] = node;
        
        indent += /^\-\s+/.exec(line)[0].length;
        line = line.replace(/^\s*\-/, "").trim();
      }
    }
    if (reMap.test(line)) {
      let key = reMap.exec(line)[1];
      let value = getValueNode(reMap.exec(line)[2]) || new ObjectNode();
      debug(indent, key, value);
      getParentNode(indent).set(key, value);
      stack[indent] = value;
    } else {
      debug();
    }
    
    previousIndent = indent;
  }
  
  return root;
}

function dumpPLIST(node) {
  if (isDebugMode)
    return;
  
  let plist = `
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
${node.toPLIST()}
</plist>
  `.trim();
  console.log(plist);
}
