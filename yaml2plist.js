#!/usr/bin/env node

if (process.argv.length < 3) {
  console.log(`Usage: ${process.argv[1]} [--debug] <input-file>`);
  process.exit();
}

var isDebugMode = (process.argv.indexOf("--debug") > -1);
var inputFile = process.argv[process.argv.length - 1];
require("fs").readFile(inputFile, "utf-8", function(err, content) {
  if (err) {
    console.error("Cannot open file: %s", inputFile);
    return;
  }
  dumpPLIST(loadYAML(content));
});

function Node(value) {
  this._value = value;
}
Node.prototype = {
  _value: null,
  
  toJSON: function() {
    return this._value;
  },
  toPLIST: function() {
    return "<string>" + this._value + "</string>";
  }
};

function StringNode(value) {
  Node.call(this, value || "");
}
StringNode.prototype = Object.create(Node.prototype);

function ObjectNode() {}
ObjectNode.prototype = Object.create(Node.prototype);
ObjectNode.prototype.push = function(value) {
  if (!this._value) {
    Node.call(this, []);
  }
  
  if (this._value instanceof Array) {
   this._value.push(value);
  } else {
    throw new Error("Cannot push to ObjectNode initialized as Object");
  }
}
ObjectNode.prototype.set = function(key, value) {
  if (!this._value) {
    Node.call(this, Object.create(null));
  }
  
  if (!(this.value instanceof Array)) {
    this._value[key] = value;
  } else {
    throw new Error("Cannot set key on ObjectNode initialized as Array");
  }
}
ObjectNode.prototype.toPLIST = function() {
  var plist = [];
  if (this._value instanceof Array) {
    plist.push("<array>");
    for (var value of this._value) {
      plist.push(value.toPLIST());
    }
    plist.push("</array>");
  } else {
    plist.push("<dict>");
    for (var key in this._value) {
      plist.push("<key>" + key + "</key>");
      plist.push(this._value[key].toPLIST());
    }
    plist.push("</dict>");
  }
  return plist.join("\n");
}

function VariableNode(id) {
  if (!(id in VariableNode.prototype._variables)) {
    VariableNode.prototype._variables[id] = Object.create(null);
  }
  Node.call(this, VariableNode.prototype._variables[id]);
}
VariableNode.prototype = Object.create(ObjectNode.prototype);
VariableNode.prototype._variables = Object.create(null);

var reMap = /^["']?([a-zA-Z0-9_]+)["']?\s*:\s*(.*)$/;
var reSet = /^\s*\-[^\-]/;
var reMapValue = /^\{(.*)\}$/;
var reSetValue = /^\[(.*)\]$/;
var reVarValue = /^[&\*](.*)$/;

function getValueNode(str) {
  var node = null;
  if (reMapValue.test(str)) {
    node = new ObjectNode();
    // TODO: Improve object parsing
    var values = reMapValue.exec(str)[1].split(/\s*,\s*/);
    for (var value of values) {
      var pair = value.split(/\s*:\s*/, 2);
      node.set(pair[0], getValueNode(pair[1]));
    }
  } else if (reSetValue.test(str)) {
    node = new ObjectNode();
    // TODO: Improve array parsing
    var values = reSetValue.exec(str)[1].split(/\s*,\s*/);
    for (var value of values) {
      node.push(getValueNode(value));
    }
  } else if (reVarValue.test(str)) {
    var name = reVarValue.exec(str)[1];
    node = new VariableNode(name);
  } else if (str) {
    str = str.replace(/^["']|["']$/g, "");
    node = new StringNode(str);
  }
  return node;
}

function loadYAML(str) {
  var root = new ObjectNode();
  var stack = {"-1": root};
  
  // TODO: Allow array items to be specified on same indentation level
  function getParentNode(indent) {
    for (var i = indent - 1; i > -2; i--) {
      if (stack[i]) {
        return stack[i];
      }
    }
    
    throw new Error(`No node set below indent level ${indent}`);
  }
  
  var lines = str.split("\n");
  var previousIndent = 0;
  for (var line of lines) {
    var indent = /^\s*/.exec(line)[0].length;
    if (indent < previousIndent) {
      for (var i = indent + 1; i <= previousIndent; i++) {
        delete stack[i];
      }
    }
    
    line = line.trim();
    if (reSet.test(line)) {
      var trimmedLine = line.replace(/^\-\s+/, "");
      if (reVarValue.test(trimmedLine)) {
        var key = reVarValue.exec(trimmedLine)[1];
        isDebugMode && console.log("%d: %s var(%s)", indent, "push", key);
        var node = new VariableNode(key);
        getParentNode(indent).push(node);
        continue;
      } else {
        isDebugMode && console.log("%d: %s obj()", indent, "push");
        var node = new ObjectNode();
        getParentNode(indent).push(node);
        stack[indent] = node;
        
        indent += /^\-\s+/.exec(line)[0].length;
        line = line.replace(/^\s*\-/, "").trim();
      }
    }
    if (reMap.test(line)) {
      var key = reMap.exec(line)[1];
      var value = getValueNode(reMap.exec(line)[2]) || new ObjectNode();
      isDebugMode && console.log("%d: %s %s=%s", indent, "set", key, JSON.stringify(value));
      getParentNode(indent).set(key, value);
      stack[indent] = value;
    } else {
      isDebugMode && console.log("---");
    }
    
    previousIndent = indent;
  }
  
  return root;
}

function dumpPLIST(node) {
  var plist = [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    node.toPLIST(),
    "</plist>"
  ];
  !isDebugMode && console.log(plist.join("\n"));
}
