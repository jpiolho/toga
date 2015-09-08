import fs = require("fs");

interface CompilerOptions {
    input?: string;
    output?: string;

    programBits?: number;
    dataBits?: number;
}

var options: CompilerOptions = {};

// Read process arguments
for (var i = 0; i < process.argv.length; i++) {
    var arg = process.argv[i];
    if (arg[0] == "-") {
        var option = arg.substring(1);

        switch (option) {
            case "i":
            case "input":
                options.input = process.argv[++i];
                break;
            case "o":
            case "output":
                options.output = process.argv[++i];
                break;
            case "pb":
                options.programBits = parseInt(process.argv[++i]);
                break;
            case "db":
                options.dataBits = parseInt(process.argv[++i]);
                break;
        }
    }
}

// Validate process arguments
if (!options.input) {
    console.error("Missing -input flag");
    process.exit(-1);
}

if (!options.output) {
    console.error("Missing -output flag");
    process.exit(-1);
}

if (!options.dataBits)
    options.dataBits = 16;

if (!options.programBits)
    options.programBits = 16;


var offsetSTACK = (1 << options.dataBits) - 1;


fs.readFile(options.input, "utf-8",function (err, data) {
    if (err) {
        if (err.code == "ENOENT") {
            console.error("The input files does not exist");
            process.exit(-1);
        }
        else {
            console.error("An error occured.\n> " + err.message);
            process.exit(-1);
        }
    }

    var startTime = Date.now();
    var compiled = compileCode(data);

    var elapsedTime = Date.now() - startTime;

    var sizePerInstruction = (options.dataBits / 8) + (options.dataBits / 8);
    var bufferSize = Math.floor(compiled.length * sizePerInstruction);

    console.log("Code successfully compiled in " + elapsedTime + "ms. " + compiled.length + " ops, " + (compiled.length * (options.dataBits + options.programBits)) + " bits (" + bufferSize + " bytes)\n");


    

    var buffer = new Buffer(bufferSize);
    for (var i = 0,offset=0; i < compiled.length; i++) {
        buffer.writeUInt16BE(compiled[i].a, offset);
        offset += 2;
        buffer.writeUInt16BE(compiled[i].b, offset);
        offset += 2;
    }

    fs.writeFile(options.output, buffer, function (err, data) {
        if (err) {
            console.error("An error occured.\n> " + err.message);
        }
    });
});


function F(a, b) {
    return { a: a, b: b };
}



function compileCode(code) {
    var compiled = [];
    var idx = 0;

    var labels = [];
    var defines = [];

    var buffer = "";
    var state = 0;
    var argstate = 0;

    var statementn = 1;
    var linen = 1;

    var linking = [];

    var uniquegoto = 0;


    var stack = 0;

    var AddLinking = function (label, offset, linen) {
        linking.push({
            label: label,
            offset: offset,
            line: linen
        });
    }

    var CompileError = function (msg) {
        console.log("Line " + linen + " - Statement " + statementn + ": " + msg);
    }

    var ReserveStack = function (amount) {
        var offset = offsetSTACK - stack;
        stack += amount;
        return offset;
    }

    var FreeStack = function (amount) {
        stack -= amount;
    }

    var Func = function (name, arg0?, arg1?, arg2?, arg3?, arg4?) {

        var args = [];
        if (arg0 != undefined) args.push(arg0);
        if (arg1 != undefined) args.push(arg1);
        if (arg2 != undefined) args.push(arg2);
        if (arg3 != undefined) args.push(arg3);
        if (arg4 != undefined) args.push(arg4);

        return {
            function: name,
            arguments: args
        };
    }

    var CheckArgumentCount = function (data, funcName, amount) {
        if (data.arguments.length != amount) {
            CompileError(funcName + " expected " + amount + " arguments but got " + data.arguments.length);
            return false;
        }
        return true;
    }

    var GetLabelOffset = function (label) {
        for (var i = 0; i < labels.length; i++) {
            if (labels[i].label == label) {
                return labels[i].offset;
            }
        }
        return -1;
    }

    var UniqueLabel = function () {
        return "_" + (uniquegoto++);
    }

    var CompileFunction = function (data) {

        switch (data.function) {
            case "TOGA":
                if (!CheckArgumentCount(data, "TOGA", 2)) return false;

                compiled.push(F(data.arguments[0], data.arguments[1]));
                break;
            case "CLEAR":
                if (!CheckArgumentCount(data, "CLEAR", 1)) return false;

                compiled.push(F(data.arguments[0], compiled.length));
                break;
            case "SET":
                if (!CheckArgumentCount(data, "SET", 1)) return false;

                var endoffset = compiled.length + 2;
                compiled.push(F(data.arguments[0], endoffset));
                compiled.push(F(data.arguments[0], endoffset));
                break;
            case "TOGGLE":
                if (!CheckArgumentCount(data, "TOGGLE", 1)) return false;

                compiled.push(F(data.arguments[0], compiled.length + 1));
                break;
            case "COPY":
                if (!CheckArgumentCount(data, "COPY", 2)) return false;

                var lblLabel = UniqueLabel();
                var lblEnd = UniqueLabel();

                CompileFunction({
                    function: "CGOTO",
                    arguments: [data.arguments[0], lblLabel]
                });
                CompileFunction({
                    function: "CLEAR",
                    arguments: [data.arguments[1]]
                });
                CompileFunction({
                    function: "GOTO",
                    arguments: [lblEnd]
                });
                CompileLabel(lblLabel);
                CompileFunction({
                    function: "SET",
                    arguments: [data.arguments[1]]
                });
                CompileLabel(lblEnd);

                break;
            case "SETBYTE":
                if (!CheckArgumentCount(data, "SETBYTE", 2)) return false;

                var offset = data.arguments[0];
                var n = data.arguments[1].toString(2);

                while (n.length < 8) {
                    n = "0" + n;
                }

                for (var i = 0; i < 8 && i < n.length; i++) {
                    if (n[i] == '0')
                        CompileFunction({
                            function: "CLEAR",
                            arguments: [offset + i]
                        });
                    else if (n[i] == '1')
                        CompileFunction({
                            function: "SET",
                            arguments: [offset + i]
                        });

                }

                break;
            case "TRIGGER":
                if (!CheckArgumentCount(data, "TRIGGER", 1)) return false;

                CompileFunction({
                    function: "SET",
                    arguments: [data.arguments[0]]
                });
                CompileFunction({
                    function: "CLEAR",
                    arguments: [data.arguments[0]]
                });

                break;
            case "CGOTO":
                if (!CheckArgumentCount(data, "CGOTO", 2)) return false;

                compiled.push(F(data.arguments[0], compiled.length + 1));
                compiled.push(F(data.arguments[0], offset));

                AddLinking(data.arguments[1], compiled.length - 1, statementn);

                break;
            case "GOTO":
                if (!CheckArgumentCount(data, "GOTO", 1)) return false;

                var stk = ReserveStack(1);
                compiled.push(F(stk, offset));
                compiled.push(F(stk, offset));
                FreeStack(1);

                AddLinking(data.arguments[0], compiled.length - 2, statementn);
                AddLinking(data.arguments[0], compiled.length - 1, statementn);

                break;
            case "HALFADD":
                if (!CheckArgumentCount(data, "HALFADD", 4)) return false;

                var bita = data.arguments[0];
                var bitb = data.arguments[1];
                var outputs = data.arguments[2];
                var outputc = data.arguments[3];

                var lblNoSet = UniqueLabel();
                var lblOneSet = UniqueLabel();
                var lblPart1 = UniqueLabel();
                var lblEnd = UniqueLabel();
                var lblBothSet = UniqueLabel();

                CompileFunction(Func("CGOTO", bita, lblPart1));
                CompileFunction(Func("CGOTO", bitb, lblOneSet));

                CompileFunction(Func("CLEAR", outputc));
                CompileFunction(Func("CLEAR", outputs));
                CompileFunction(Func("GOTO", lblEnd));


                CompileLabel(lblOneSet);
                CompileFunction(Func("SET", outputs));
                CompileFunction(Func("CLEAR", outputc));
                CompileFunction(Func("GOTO", lblEnd));

                CompileLabel(lblPart1);
                CompileFunction(Func("CGOTO", bitb, lblBothSet));
                CompileFunction(Func("GOTO", lblOneSet));

                CompileLabel(lblBothSet);
                CompileFunction(Func("SET", outputc));
                CompileFunction(Func("CLEAR", outputs));

                CompileLabel(lblEnd);

                break;
            case "FULLADD":
                if (!CheckArgumentCount(data, "FULLADD", 5)) return false;

                var ina = data.arguments[0];
                var inb = data.arguments[1];
                var inc = data.arguments[2];
                var outs = data.arguments[3];
                var outc = data.arguments[4];

                var stk = ReserveStack(4);

                var lblCarry = UniqueLabel();
                var lblEnd = UniqueLabel();

                CompileFunction(Func("HALFADD", ina, inb, stk, stk - 1));
                CompileFunction(Func("HALFADD", stk, inc, stk - 2, stk - 3));
                CompileFunction(Func("CGOTO", stk - 1, lblCarry));
                CompileFunction(Func("CGOTO", stk - 3, lblCarry));
                CompileFunction(Func("CLEAR", outc));
                CompileFunction(Func("GOTO", lblEnd));

                CompileLabel(lblCarry);
                CompileFunction(Func("SET", outc));
                CompileLabel(lblEnd);
                CompileFunction(Func("COPY", stk - 2, outs));

                FreeStack(4);

                break;
            case "ADDBYTE":

                if (!CheckArgumentCount(data, "ADDBYTE", 3)) return false;

                var ina = data.arguments[0];
                var inb = data.arguments[1];
                var outa = data.arguments[2];

                var stk = ReserveStack(1);
                CompileFunction(Func("HALFADD", ina + 7, inb + 7, outa + 7, stk));

                for (var i = 1; i < 8; i++) {
                    CompileFunction(Func("FULLADD", ina + 7 - i, inb + 7 - i, stk, outa + 7 - i, stk));
                }
                FreeStack(1);

                break;
            case "COPYBYTE":
                if (!CheckArgumentCount(data, "COPYBYTE", 2)) return false;

                var ina = data.arguments[0];
                var outa = data.arguments[1];

                for (var i = 0; i < 8; i++) {
                    CompileFunction(Func("COPY", ina + i, outa + i));
                }

                break;

            case "OR":
                if (!CheckArgumentCount(data, "OR", 3)) return false;

                var ina = data.arguments[0];
                var inb = data.arguments[1];
                var out = data.arguments[2];

                var lblTrue = UniqueLabel();
                var lblEnd = UniqueLabel();


                CompileFunction(Func("CGOTO", ina, lblTrue));
                CompileFunction(Func("CGOTO", inb, lblTrue));
                CompileFunction(Func("GOTO", lblEnd));

                CompileLabel(lblTrue);
                CompileFunction(Func("SET", out));

                CompileLabel(lblEnd);

                break;

            case "AND":
                if (!CheckArgumentCount(data, "AND", 3)) return false;

                var ina = data.arguments[0];
                var inb = data.arguments[1];
                var out = data.arguments[2];

                var lblTrue = UniqueLabel();
                var lblOne = UniqueLabel();
                var lblEnd = UniqueLabel();

                CompileFunction(Func("CGOTO", ina, lblOne));
                CompileFunction(Func("GOTO", lblEnd));
                CompileLabel(lblOne);
                CompileFunction(Func("CGOTO", inb, lblTrue));
                CompileFunction(Func("GOTO", lblEnd));
                CompileLabel(lblTrue);
                CompileFunction(Func("SET", out));
                CompileLabel(lblEnd);
                break;

            default:
                CompileError("Unknown function \"" + data.function + "\"");
                return false;
        };


        buffer = "";
        data = {};

        return true;
    }

    var CompileLabel = function (label) {
        for (var i = 0; i < labels.length; i++) {
            if (label == labels[i].label) {
                CompileError("\"" + label + "\" label already exists");
                return false;
            }
        }

        labels.push({
            label: label,
            offset: compiled.length
        });

        buffer = "";
        data = {};

        return true;
    }

    var CompileDefine = function (data) {

        switch (data.define) {
            case "define":
                if (data.arguments.length < 1) {
                    CompileError("A definition must have a name");
                    return false;
                }

                var define = data.arguments[0];
                for (var i = 0; i < defines.length; i++) {
                    if (define == defines[i].define) {
                        CompileError("\"" + data.define + "\" define already exists");
                        return false;
                    }
                }

                if (data.arguments.length >= 1)
                    defines.push({
                        define: define,
                        value: data.arguments[1]
                    });
                else
                    defines.push({
                        define: define
                    });

                break;
            default:
                CompileError("Unknown preprocessor \"" + data.define + "\"");
                return false;
        }

        return true;
    }

    var ParseArgument = function (arg) {
        if (arg[0] == 'x') {
            return parseInt(arg.substring(1), 16);
        } else if (arg[0] == '\'') {
            if (arg.length != 3 && arg[2] != '\'') {
                CompileError("Invalid char type. Format is \'#\'");
                return null;
            }
            return arg.charCodeAt(1);
        } else if (arg[0] == '$') {
            var define = arg.substring(1);
            for (var i = 0; i < defines.length; i++) {
                if (defines[i].define == define) {
                    return ParseArgument(defines[i].value);
                }
            }
            CompileError("\"" + define + "\" not defined");
            return null;
        } else if (!isNaN(arg[0])) {
            return parseInt(arg);
        } else {
            return arg;
        }
    }

    var data : any = {};
    while (idx < code.length) {
        var c = code[idx++];

        if (c == '\n') {
            linen++;
            continue;
        }

        if (c == '\r' || c == '\t') {
            continue;
        }

        if (state == 0) { // FUNCTION
            if (c == '#') {
                state = 2;
                data.define = "";
                data.arguments = [];
            } else if (c == ':') {
                if (!CompileLabel(buffer))
                    return null;
                statementn++;
            } else if (c == ' ' || c == ';') {
                if (c == ' ' && buffer == "")
                    continue;
                data.function = buffer;
                buffer = "";
                data.arguments = [];

                if (c == ' ') {
                    state = 1;
                } else {
                    if (!CompileFunction(data))
                        return null;
                    statementn++;
                }
            } else {
                buffer += c;
            }
        } else if (state == 1) { // FUNCTION ARGUMENTS
            if (c == '\'' && argstate == 0) {
                argstate = 1;
                buffer += c;
            } else if (argstate == 0 && c == ' ' || c == ';') {
                var arg = ParseArgument(buffer);

                if (arg == null)
                    return null;

                data.arguments.push(arg);
                buffer = "";

                if (c == ';') {
                    if (!CompileFunction(data))
                        return null;
                    statementn++;
                    state = 0;
                    argstate = 0;
                }
            } else {
                buffer += c;
            }
        } else if (state == 2) { // DEFINE
            if (c == ' ' || c == ';') {
                data.define = buffer;
                buffer = "";

                if (c == ' ') {
                    state = 3;
                } else {
                    if (!CompileDefine(data))
                        return null;
                    statementn++;
                    state = 0;
                }
            } else {
                buffer += c;
            }
        } else if (state == 3) { // DEFINE ARGUMENTS
            if (c == ' ' || c == ';') {
                var arg = ParseArgument(buffer);

                if (arg == null)
                    return null;

                data.arguments.push(arg);

                buffer = "";

                if (c == ';') {
                    if (!CompileDefine(data))
                        return null;
                    statementn++;
                    state = 0;
                }
            } else {
                buffer += c;
            }
        }
    }

    // Linking
    for (var i = 0; i < linking.length; i++) {
        var label = linking[i].label;
        statementn = linking[i].line;

        var offset = GetLabelOffset(label);
        if (offset == -1) {
            CompileError("LINK - Unknown label \"" + label + "\"");
            return null;
        }

        compiled[linking[i].offset].b = offset;
    }

    return compiled;
}
